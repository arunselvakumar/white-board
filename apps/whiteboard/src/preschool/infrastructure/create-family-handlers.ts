import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { FamilyHandlers } from "../application/family-handlers";
import { PrismaFamilyStore } from "./prisma-family-store";

export function createFamilyHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): FamilyHandlers {
  return new FamilyHandlers({
    store: new PrismaFamilyStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
