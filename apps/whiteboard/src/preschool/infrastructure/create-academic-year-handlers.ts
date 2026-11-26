import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { AcademicYearHandlers } from "../application/academic-year-handlers";
import { PrismaAcademicYearStore } from "./prisma-academic-year-store";

export function createAcademicYearHandlers(deps?: {
  prisma?: PrismaClient;
}): AcademicYearHandlers {
  return new AcademicYearHandlers({
    store: new PrismaAcademicYearStore(deps?.prisma ?? prisma),
  });
}
