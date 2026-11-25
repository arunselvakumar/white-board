import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  StaffFields,
  StaffRecord,
  StaffStore,
} from "../application/staff-ports";
import type { StaffView } from "../application/staff-views";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { canSignIn } from "../domain/staff";

const VIEW_SELECT = {
  id: true,
  centreId: true,
  name: true,
  role: true,
  status: true,
  phone: true,
  email: true,
  designation: true,
  joinedOn: true,
  invitedAt: true,
  classrooms: {
    where: { classroom: { archivedAt: null, deletedAt: null } },
    select: { classroom: { select: { id: true, name: true } } },
  },
} as const;

type ViewRow = {
  id: string;
  centreId: string;
  name: string;
  role: StaffView["role"];
  status: StaffView["status"];
  phone: string | null;
  email: string | null;
  designation: string | null;
  joinedOn: Date | null;
  invitedAt: Date | null;
  classrooms: { classroom: { id: string; name: string } }[];
};

function view(row: ViewRow): StaffView {
  return {
    id: row.id,
    centreId: row.centreId,
    name: row.name,
    role: row.role,
    status: row.status,
    phone: row.phone,
    email: row.email,
    designation: row.designation,
    joinedOn: row.joinedOn == null ? null : toIsoDate(row.joinedOn),
    invitedAt: row.invitedAt?.toISOString() ?? null,
    canSignIn: canSignIn(row.role),
    classrooms: row.classrooms
      .map(({ classroom }) => classroom)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function data(fields: StaffFields) {
  return {
    ...fields,
    joinedOn: fields.joinedOn == null ? null : fromIsoDate(fields.joinedOn),
  };
}

export class PrismaStaffStore implements StaffStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(workspaceId: string, centreId: string): Promise<StaffView[]> {
    const rows = await this.db.preschoolStaff.findMany({
      where: { workspaceId, centreId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: VIEW_SELECT,
    });
    return rows.map(view);
  }

  async find(workspaceId: string, id: string): Promise<StaffRecord | null> {
    return this.db.preschoolStaff.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        name: true,
        role: true,
        status: true,
        email: true,
      },
    });
  }

  async view(workspaceId: string, id: string): Promise<StaffView> {
    return view(
      await this.db.preschoolStaff.findFirstOrThrow({
        where: { id, workspaceId, deletedAt: null },
        select: VIEW_SELECT,
      }),
    );
  }

  async emailTaken(
    workspaceId: string,
    email: string,
    exceptId?: string,
  ): Promise<boolean> {
    const count = await this.db.preschoolStaff.count({
      where: {
        workspaceId,
        email,
        deletedAt: null,
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
    });
    return count > 0;
  }

  async classrooms(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    { id: string; name: string; centreId: string; isArchived: boolean }[]
  > {
    const rows = await this.db.preschoolClassroom.findMany({
      where: { workspaceId, deletedAt: null, id: { in: [...ids] } },
      select: { id: true, name: true, centreId: true, archivedAt: true },
    });
    return rows.map(({ archivedAt, ...rest }) => ({
      ...rest,
      isArchived: archivedAt != null,
    }));
  }

  async create(
    workspaceId: string,
    input: StaffFields & { centreId: string; classroomIds: readonly string[] },
  ): Promise<string> {
    const { centreId, classroomIds, ...fields } = input;
    const id = randomUUID();
    await this.db.preschoolStaff.create({
      data: {
        id,
        workspaceId,
        centreId,
        ...data(fields),
        classrooms: {
          create: classroomIds.map((classroomId) => ({
            classroomId,
            workspaceId,
          })),
        },
      },
    });
    return id;
  }

  async update(
    workspaceId: string,
    id: string,
    fields: StaffFields,
    effects: { removeClassrooms: boolean; clearInvitedAt: boolean },
  ): Promise<void> {
    await this.db.$transaction([
      this.db.preschoolStaff.update({
        where: { id, workspaceId },
        data: {
          ...data(fields),
          ...(effects.clearInvitedAt ? { invitedAt: null } : {}),
        },
      }),
      ...(effects.removeClassrooms
        ? [
            this.db.preschoolClassroomTeacher.deleteMany({
              where: { workspaceId, staffId: id },
            }),
          ]
        : []),
    ]);
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: "active" | "inactive",
  ): Promise<void> {
    await this.db.$transaction([
      this.db.preschoolStaff.update({
        where: { id, workspaceId },
        data: { status },
      }),
      ...(status === "inactive"
        ? [
            this.db.preschoolClassroomTeacher.deleteMany({
              where: { workspaceId, staffId: id },
            }),
          ]
        : []),
    ]);
  }

  async markInvited(workspaceId: string, id: string, at: Date): Promise<void> {
    await this.db.preschoolStaff.update({
      where: { id, workspaceId },
      data: { invitedAt: at },
    });
  }
}
