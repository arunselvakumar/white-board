import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  AccessQuery,
  AccessReader,
  AccessResult,
  PreschoolActor,
} from "../application/access";

export class PrismaAccessReader implements AccessReader {
  constructor(private readonly db: PrismaClient = prisma) {}

  async resolve(query: AccessQuery): Promise<AccessResult> {
    const { workspaceId } = query;
    const settings = await this.db.preschoolSettings.findUnique({
      where: { workspaceId },
      select: { workspaceId: true },
    });
    if (settings == null) return { kind: "not_a_preschool" };

    const base = {
      workspaceId,
      userId: query.userId,
      userName: query.userName,
    };
    const actor = (rest: Omit<PreschoolActor, keyof typeof base>) =>
      ({ kind: "actor", actor: { ...base, ...rest } }) as const;

    if (query.memberRole === "owner") {
      const centres = await this.db.preschoolCentre.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true },
      });
      return actor({
        role: "owner",
        centreIds: centres.map((centre) => centre.id),
        classroomIds: [],
        childIds: [],
      });
    }

    const emails = query.verifiedEmails.map((email) => email.toLowerCase());
    if (emails.length === 0) return { kind: "no_access" };

    if (query.memberRole === "teacher") {
      const staff = await this.db.preschoolStaff.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          status: "active",
          email: { in: emails },
          role: { in: ["centre_head", "teacher"] },
          centre: { deletedAt: null },
        },
        select: {
          id: true,
          role: true,
          centreId: true,
          classrooms: {
            where: { classroom: { deletedAt: null, archivedAt: null } },
            select: { classroomId: true },
          },
        },
      });
      const heads = staff.filter((member) => member.role === "centre_head");
      if (heads.length > 0)
        return actor({
          role: "centre_head",
          centreIds: unique(heads.map((member) => member.centreId)),
          classroomIds: [],
          childIds: [],
        });
      if (staff.length === 0) return { kind: "no_access" };
      return actor({
        role: "teacher",
        centreIds: unique(staff.map((member) => member.centreId)),
        classroomIds: unique(
          staff.flatMap((member) =>
            member.classrooms.map((link) => link.classroomId),
          ),
        ),
        childIds: [],
      });
    }

    if (query.memberRole === "parent") {
      const children = await this.db.preschoolChild.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { fatherEmail: { in: emails } },
            { motherEmail: { in: emails } },
          ],
        },
        select: { id: true, centreId: true },
      });
      if (children.length === 0) return { kind: "no_access" };
      return actor({
        role: "parent",
        centreIds: unique(children.map((child) => child.centreId)),
        classroomIds: [],
        childIds: children.map((child) => child.id),
      });
    }

    return { kind: "no_access" };
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
