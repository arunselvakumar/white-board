import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ClassroomHandlers } from "../application/classroom-handlers";
import { PrismaClassroomStore } from "./prisma-classroom-store";

export function createClassroomHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ClassroomHandlers {
  return new ClassroomHandlers({
    store: new PrismaClassroomStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
