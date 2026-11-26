import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { PreschoolActor } from "../application/access";
import type { MeReader, MeView } from "../application/me";
import { toIsoDate } from "../domain/dates";

export class PrismaMeReader implements MeReader {
  constructor(private readonly db: PrismaClient = prisma) {}

  async read(actor: PreschoolActor): Promise<MeView> {
    const { workspaceId } = actor;
    const [settings, year, centres, centreCount, children] = await Promise.all([
      this.db.preschoolSettings.findUniqueOrThrow({ where: { workspaceId } }),
      this.db.preschoolAcademicYear.findFirstOrThrow({
        where: { workspaceId, isCurrent: true },
      }),
      this.db.preschoolCentre.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          id: { in: [...actor.centreIds] },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          ownership: true,
          status: true,
        },
      }),
      this.db.preschoolCentre.count({
        where: { workspaceId, deletedAt: null },
      }),
      actor.childIds.length === 0
        ? Promise.resolve([])
        : this.db.preschoolChild.findMany({
            where: { workspaceId, id: { in: [...actor.childIds] } },
            orderBy: [{ firstName: "asc" }, { id: "asc" }],
            select: {
              id: true,
              centreId: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
            },
          }),
    ]);
    return {
      role: actor.role,
      userName: actor.userName,
      academicYearStartMonth: settings.academicYearStartMonth,
      currentAcademicYear: {
        id: year.id,
        name: year.name,
        startsOn: toIsoDate(year.startsOn),
        endsOn: toIsoDate(year.endsOn),
      },
      hasSeveralCentres: centreCount > 1,
      centres,
      classroomIds: [...actor.classroomIds],
      children,
    };
  }
}
