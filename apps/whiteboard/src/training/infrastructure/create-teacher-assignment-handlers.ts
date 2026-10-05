import { prisma } from "@repo/db";

import { TeacherAssignmentHandlers } from "../application/teacher-assignment-handlers";
import { PrismaTeacherAssignmentRepository } from "./prisma-teacher-assignment-repository";
import { PrismaTeacherRepository } from "./prisma-teacher-repository";

export function createTeacherAssignmentHandlers(): TeacherAssignmentHandlers {
  return new TeacherAssignmentHandlers(
    new PrismaTeacherRepository(prisma),
    new PrismaTeacherAssignmentRepository(prisma),
  );
}
