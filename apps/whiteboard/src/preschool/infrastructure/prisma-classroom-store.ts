import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  ClassroomRecord,
  ClassroomStore,
} from "../application/classroom-ports";
import type {
  AcademicYearRefView,
  ClassroomOptionsView,
  ClassroomView,
  RosterChildView,
} from "../application/classroom-views";
import type { ClassTeacherCandidate } from "../domain/classroom";
import { seatsLeft } from "../domain/classroom";
import { toIsoDate } from "../domain/dates";

const ACTIVE_ADMISSION = {
  status: "active",
  child: { deletedAt: null },
} as const;

const VIEW_SELECT = {
  id: true,
  centreId: true,
  academicYearId: true,
  programmeId: true,
  name: true,
  capacity: true,
  archivedAt: true,
  programme: { select: { name: true } },
  teachers: {
    where: { staff: { deletedAt: null } },
    select: { staff: { select: { id: true, name: true } } },
  },
  _count: { select: { admissions: { where: ACTIVE_ADMISSION } } },
} as const;

type ViewRow = {
  id: string;
  centreId: string;
  academicYearId: string;
  programmeId: string;
  name: string;
  capacity: number;
  archivedAt: Date | null;
  programme: { name: string };
  teachers: { staff: { id: string; name: string } }[];
  _count: { admissions: number };
};

function view(row: ViewRow): ClassroomView {
  const childCount = row._count.admissions;
  return {
    id: row.id,
    centreId: row.centreId,
    academicYearId: row.academicYearId,
    programmeId: row.programmeId,
    programmeName: row.programme.name,
    name: row.name,
    capacity: row.capacity,
    childCount,
    seatsLeft: seatsLeft(row.capacity, childCount),
    isArchived: row.archivedAt != null,
    teachers: row.teachers
      .map(({ staff }) => ({ staffId: staff.id, name: staff.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const ORDER = [
  { programme: { sortOrder: "asc" } },
  { name: "asc" },
  { id: "asc" },
] as const;

export class PrismaClassroomStore implements ClassroomStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async currentAcademicYear(workspaceId: string): Promise<AcademicYearRefView> {
    return this.db.preschoolAcademicYear.findFirstOrThrow({
      where: { workspaceId, isCurrent: true },
      select: { id: true, name: true },
    });
  }

  async academicYear(
    workspaceId: string,
    id: string,
  ): Promise<AcademicYearRefView | null> {
    return this.db.preschoolAcademicYear.findFirst({
      where: { id, workspaceId },
      select: { id: true, name: true },
    });
  }

  async programme(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null> {
    const row = await this.db.preschoolProgramme.findFirst({
      where: { id, workspaceId },
      select: { id: true, name: true, archivedAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, isArchived: row.archivedAt != null };
  }

  async list(
    workspaceId: string,
    query: {
      centreId: string;
      academicYearId: string;
      classroomIds?: readonly string[];
    },
  ): Promise<ClassroomView[]> {
    const rows = await this.db.preschoolClassroom.findMany({
      where: {
        workspaceId,
        centreId: query.centreId,
        academicYearId: query.academicYearId,
        archivedAt: null,
        deletedAt: null,
        ...(query.classroomIds == null
          ? {}
          : { id: { in: [...query.classroomIds] } }),
      },
      orderBy: [...ORDER],
      select: VIEW_SELECT,
    });
    return rows.map(view);
  }

  async find(workspaceId: string, id: string): Promise<ClassroomRecord | null> {
    const row = await this.db.preschoolClassroom.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        academicYearId: true,
        programmeId: true,
        name: true,
        capacity: true,
        archivedAt: true,
      },
    });
    if (row == null) return null;
    const { archivedAt, ...rest } = row;
    return { ...rest, isArchived: archivedAt != null };
  }

  async view(workspaceId: string, id: string): Promise<ClassroomView> {
    return view(
      await this.db.preschoolClassroom.findFirstOrThrow({
        where: { id, workspaceId, deletedAt: null },
        select: VIEW_SELECT,
      }),
    );
  }

  async roster(
    workspaceId: string,
    classroomId: string,
  ): Promise<RosterChildView[]> {
    const rows = await this.db.preschoolAdmission.findMany({
      where: { workspaceId, classroomId, ...ACTIVE_ADMISSION },
      orderBy: [
        { child: { firstName: "asc" } },
        { child: { lastName: "asc" } },
        { childId: "asc" },
      ],
      select: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            dateOfBirth: true,
            photoUrl: true,
            fatherPhone: true,
            motherPhone: true,
          },
        },
      },
    });
    return rows.map(({ child }) => ({
      childId: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      admissionNumber: child.admissionNumber,
      dateOfBirth: toIsoDate(child.dateOfBirth),
      photoUrl: child.photoUrl,
      fatherPhone: child.fatherPhone,
      motherPhone: child.motherPhone,
    }));
  }

  async childCount(workspaceId: string, classroomId: string): Promise<number> {
    return this.db.preschoolAdmission.count({
      where: { workspaceId, classroomId, ...ACTIVE_ADMISSION },
    });
  }

  async nameTaken(
    workspaceId: string,
    query: {
      centreId: string;
      academicYearId: string;
      name: string;
      exceptId?: string;
    },
  ): Promise<boolean> {
    const count = await this.db.preschoolClassroom.count({
      where: {
        workspaceId,
        centreId: query.centreId,
        academicYearId: query.academicYearId,
        archivedAt: null,
        deletedAt: null,
        name: { equals: query.name, mode: "insensitive" },
        ...(query.exceptId == null ? {} : { id: { not: query.exceptId } }),
      },
    });
    return count > 0;
  }

  async create(
    workspaceId: string,
    record: Omit<ClassroomRecord, "id" | "isArchived">,
  ): Promise<string> {
    const id = randomUUID();
    await this.db.preschoolClassroom.create({
      data: { id, workspaceId, ...record },
    });
    return id;
  }

  async update(
    workspaceId: string,
    id: string,
    fields: { name: string; capacity: number },
  ): Promise<void> {
    await this.db.preschoolClassroom.update({
      where: { id, workspaceId },
      data: fields,
    });
  }

  async archive(workspaceId: string, id: string, at: Date): Promise<void> {
    await this.db.preschoolClassroom.update({
      where: { id, workspaceId },
      data: { archivedAt: at },
    });
  }

  async staff(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<ClassTeacherCandidate[]> {
    if (ids.length === 0) return [];
    return this.db.preschoolStaff.findMany({
      where: { workspaceId, deletedAt: null, id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        centreId: true,
        role: true,
        status: true,
      },
    });
  }

  async setTeachers(
    workspaceId: string,
    classroomId: string,
    staffIds: readonly string[],
  ): Promise<void> {
    await this.db.$transaction([
      this.db.preschoolClassroomTeacher.deleteMany({
        where: { workspaceId, classroomId, staffId: { notIn: [...staffIds] } },
      }),
      this.db.preschoolClassroomTeacher.createMany({
        data: staffIds.map((staffId) => ({
          workspaceId,
          classroomId,
          staffId,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  async options(
    workspaceId: string,
    query: { centreId: string; academicYearId: string },
  ): Promise<Omit<ClassroomOptionsView, "academicYear">> {
    const [programmes, classrooms] = await Promise.all([
      this.db.preschoolProgramme.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          minAgeMonths: true,
          maxAgeMonths: true,
          isDaycare: true,
        },
      }),
      this.list(workspaceId, query),
    ]);
    return {
      programmes,
      classrooms: classrooms.map((classroom) => ({
        id: classroom.id,
        name: classroom.name,
        programmeId: classroom.programmeId,
        programmeName: classroom.programmeName,
        capacity: classroom.capacity,
        childCount: classroom.childCount,
        seatsLeft: classroom.seatsLeft,
      })),
    };
  }
}
