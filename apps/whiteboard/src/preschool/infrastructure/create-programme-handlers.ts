import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ProgrammeHandlers } from "../application/programme-handlers";
import { PrismaProgrammeStore } from "./prisma-programme-store";

export function createProgrammeHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ProgrammeHandlers {
  return new ProgrammeHandlers({
    store: new PrismaProgrammeStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
