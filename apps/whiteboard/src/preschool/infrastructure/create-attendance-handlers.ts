import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { AttendanceHandlers } from "../application/attendance-handlers";
import { PrismaAttendanceStore } from "./prisma-attendance-store";

export function createAttendanceHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): AttendanceHandlers {
  return new AttendanceHandlers({
    store: new PrismaAttendanceStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
