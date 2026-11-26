import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import {
  SetUpPreschool,
  type PreschoolSeed,
  type PreschoolSetupStore,
  type SetUpPreschoolResult,
} from "../application/set-up-preschool";
import { fromIsoDate } from "../domain/dates";

export class PrismaSetupStore implements PreschoolSetupStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async seed(seed: PreschoolSeed): Promise<SetUpPreschoolResult> {
    const { workspaceId } = seed;
    return this.db.$transaction(async (tx) => {
      const existing = await tx.preschoolSettings.findUnique({
        where: { workspaceId },
      });
      if (existing != null) {
        const [centre, year] = await Promise.all([
          tx.preschoolCentre.findFirstOrThrow({
            where: { workspaceId, deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          }),
          tx.preschoolAcademicYear.findFirstOrThrow({
            where: { workspaceId, isCurrent: true },
            select: { id: true },
          }),
        ]);
        return { centreId: centre.id, academicYearId: year.id, created: false };
      }

      await tx.preschoolSettings.create({
        data: {
          workspaceId,
          academicYearStartMonth: seed.academicYearStartMonth,
        },
      });
      const academicYearId = randomUUID();
      await tx.preschoolAcademicYear.create({
        data: {
          id: academicYearId,
          workspaceId,
          name: seed.academicYear.name,
          startsOn: fromIsoDate(seed.academicYear.startsOn),
          endsOn: fromIsoDate(seed.academicYear.endsOn),
          isCurrent: true,
        },
      });
      const centreId = randomUUID();
      await tx.preschoolCentre.create({
        data: {
          id: centreId,
          workspaceId,
          name: seed.centre.name,
          code: seed.centre.code,
        },
      });
      await tx.preschoolProgramme.createMany({
        data: seed.programmes.map((programme, index) => ({
          id: randomUUID(),
          workspaceId,
          ...programme,
          sortOrder: index,
        })),
      });
      await tx.preschoolFeeHead.createMany({
        data: seed.feeHeads.map((head, index) => ({
          id: randomUUID(),
          workspaceId,
          ...head,
          sortOrder: index,
        })),
      });
      await tx.preschoolDevelopmentDomain.createMany({
        data: seed.developmentDomains.map((domain, index) => ({
          id: randomUUID(),
          workspaceId,
          ...domain,
          sortOrder: index,
        })),
      });
      return { centreId, academicYearId, created: true };
    });
  }
}

export function createSetUpPreschool(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): SetUpPreschool {
  return new SetUpPreschool({
    store: new PrismaSetupStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
