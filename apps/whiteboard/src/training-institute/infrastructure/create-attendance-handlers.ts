import { prisma } from "@repo/whiteboard-db";

import { AttendanceHandlers } from "../application/attendance-handlers";
import { PrismaAttendanceRepository } from "./prisma-attendance-repository";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";

export function createAttendanceHandlers(): AttendanceHandlers {
  return new AttendanceHandlers(
    new PrismaAttendanceRepository(prisma),
    new PrismaClassExceptionsReader(prisma),
  );
}
