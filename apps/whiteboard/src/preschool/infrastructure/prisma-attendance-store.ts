import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  AttendanceStore,
  ChildPlacement,
  RosterChild,
  RosterReader,
} from "../application/attendance-ports";
import type { AttendanceClassroomView } from "../application/attendance-views";
import type { AttendanceMark } from "../domain/attendance";
import { childName } from "../domain/child";
import {
  fromIsoDate,
  instantInIndia,
  timeInIndia,
  toIsoDate,
  type IsoDate,
} from "../domain/dates";

type Db = PrismaClient | Prisma.TransactionClient;

type MarkRow = Prisma.PreschoolAttendanceGetPayload<object>;

function toMark(row: MarkRow): AttendanceMark {
  return {
    status: row.status,
    checkInTime: row.checkInAt == null ? null : timeInIndia(row.checkInAt),
    droppedBy: row.droppedBy,
    checkOutTime: row.checkOutAt == null ? null : timeInIndia(row.checkOutAt),
    collectedByKind: row.collectedByKind,
    collectedByName: row.collectedByName,
    collectedByPickupId: row.collectedByPickupId,
    note: row.note,
  };
}

function markData(date: IsoDate, mark: AttendanceMark) {
  return {
    status: mark.status,
    checkInAt:
      mark.checkInTime == null ? null : instantInIndia(date, mark.checkInTime),
    droppedBy: mark.droppedBy,
    checkOutAt:
      mark.checkOutTime == null
        ? null
        : instantInIndia(date, mark.checkOutTime),
    collectedByKind: mark.collectedByKind,
    collectedByName: mark.collectedByName,
    collectedByPickupId: mark.collectedByPickupId,
    note: mark.note,
  };
}

/** The roster, Classrooms and Children's placements, shared with Daily Reports. */
export class PrismaRosterReader implements RosterReader {
  constructor(protected readonly db: Db = prisma) {}

  async classroom(
    workspaceId: string,
    id: string,
  ): Promise<AttendanceClassroomView | null> {
    const row = await this.db.preschoolClassroom.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        centreId: true,
        programme: { select: { name: true } },
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          name: row.name,
          centreId: row.centreId,
          programmeName: row.programme.name,
        };
  }

  async roster(classroomId: string, date: IsoDate): Promise<RosterChild[]> {
    const rows = await this.db.preschoolChild.findMany({
      where: {
        deletedAt: null,
        admissions: {
          some: {
            classroomId,
            status: "active",
            admittedOn: { lte: fromIsoDate(date) },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        allergies: true,
        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,
        authorisedPickups: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true, relationship: true, photoUrl: true },
        },
      },
    });
    return rows.map((row) => ({
      childId: row.id,
      name: childName(row.firstName, row.lastName),
      photoUrl: row.photoUrl,
      hasAllergies: (row.allergies?.trim() ?? "") !== "",
      father: { name: row.fatherName, phone: row.fatherPhone },
      mother: { name: row.motherName, phone: row.motherPhone },
      authorisedPickups: row.authorisedPickups,
    }));
  }

  async placement(
    workspaceId: string,
    childId: string,
    date: IsoDate,
  ): Promise<ChildPlacement | null> {
    const row = await this.db.preschoolChild.findFirst({
      where: { id: childId, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        firstName: true,
        lastName: true,
        fatherName: true,
        motherName: true,
        authorisedPickups: { select: { id: true, name: true } },
        admissions: {
          where: { status: "active", admittedOn: { lte: fromIsoDate(date) } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { classroomId: true },
        },
      },
    });
    if (row == null) return null;
    return {
      childId: row.id,
      name: childName(row.firstName, row.lastName),
      centreId: row.centreId,
      classroomId: row.admissions[0]?.classroomId ?? null,
      fatherName: row.fatherName,
      motherName: row.motherName,
      pickups: row.authorisedPickups,
    };
  }
}

/** Attendance marks in Postgres. */
export class PrismaAttendanceStore
  extends PrismaRosterReader
  implements AttendanceStore
{
  transaction<T>(work: (store: AttendanceStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaAttendanceStore(tx)));
  }

  async marks(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, AttendanceMark>> {
    if (childIds.length === 0) return new Map();
    const rows = await this.db.preschoolAttendance.findMany({
      where: { childId: { in: [...childIds] }, date: fromIsoDate(date) },
    });
    return new Map(rows.map((row) => [row.childId, toMark(row)]));
  }

  async lockMark(
    childId: string,
    date: IsoDate,
  ): Promise<AttendanceMark | null> {
    const locked = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM preschool.attendance
      WHERE child_id = ${childId}::uuid AND date = ${date}::date
      FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await this.db.preschoolAttendance.findUnique({
      where: { childId_date: { childId, date: fromIsoDate(date) } },
    });
    return row == null ? null : toMark(row);
  }

  async saveMark(
    input: Parameters<AttendanceStore["saveMark"]>[0],
  ): Promise<void> {
    const data = {
      ...markData(input.date, input.mark),
      classroomId: input.classroomId,
      markedByUserId: input.markedByUserId,
    };
    await this.db.preschoolAttendance.upsert({
      where: {
        childId_date: { childId: input.childId, date: fromIsoDate(input.date) },
      },
      create: {
        ...data,
        id: randomUUID(),
        workspaceId: input.workspaceId,
        centreId: input.centreId,
        childId: input.childId,
        date: fromIsoDate(input.date),
      },
      update: data,
    });
  }

  async deleteMark(childId: string, date: IsoDate): Promise<void> {
    await this.db.preschoolAttendance.deleteMany({
      where: { childId, date: fromIsoDate(date) },
    });
  }

  async classroomMarks(classroomId: string, from: IsoDate, to: IsoDate) {
    const rows = await this.db.preschoolAttendance.findMany({
      where: {
        classroomId,
        date: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      select: { childId: true, date: true, status: true },
    });
    return rows.map((row) => ({ ...row, date: toIsoDate(row.date) }));
  }

  async childMarks(childId: string, from: IsoDate, to: IsoDate) {
    const rows = await this.db.preschoolAttendance.findMany({
      where: {
        childId,
        date: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      orderBy: { date: "asc" },
    });
    return rows.map((row) => ({
      date: toIsoDate(row.date),
      mark: toMark(row),
    }));
  }

  async childNames(childIds: readonly string[]): Promise<Map<string, string>> {
    if (childIds.length === 0) return new Map();
    const rows = await this.db.preschoolChild.findMany({
      where: { id: { in: [...childIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      rows.map((row) => [row.id, childName(row.firstName, row.lastName)]),
    );
  }

  async centreClassrooms(
    workspaceId: string,
    centreId: string,
    date: IsoDate,
  ): Promise<AttendanceClassroomView[]> {
    const day = fromIsoDate(date);
    const rows = await this.db.preschoolClassroom.findMany({
      where: {
        workspaceId,
        centreId,
        deletedAt: null,
        archivedAt: null,
        academicYear: { startsOn: { lte: day }, endsOn: { gte: day } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        centreId: true,
        programme: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      centreId: row.centreId,
      programmeName: row.programme.name,
    }));
  }
}
