import { prisma } from "@repo/db";

import { AttendanceHandlers } from "../application/attendance-handlers";
import { PrismaAttendanceRepository } from "./prisma-attendance-repository";

export function createAttendanceHandlers(): AttendanceHandlers {
  return new AttendanceHandlers(new PrismaAttendanceRepository(prisma));
}
