import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ClassWorkHandlers } from "../application/class-work-handlers";
import { PrismaClassWorkStore } from "./prisma-class-work-store";

export function createClassWorkHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ClassWorkHandlers {
  const db = deps?.prisma ?? prisma;
  return new ClassWorkHandlers({
    store: new PrismaClassWorkStore(db, db),
    now: deps?.now ?? (() => new Date()),
  });
}
