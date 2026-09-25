import { prisma, type PrismaClient } from "@repo/db";

import { TeacherHandlers, type TeacherInviter } from "../application/teacher-handlers";
import { ClerkTeacherInviter } from "./clerk-teacher-inviter";
import { PrismaTeacherRepository } from "./prisma-teacher-repository";

export function createTeacherHandlers(deps?: {
  prisma?: PrismaClient;
  invitations?: TeacherInviter;
}): TeacherHandlers {
  return new TeacherHandlers(
    new PrismaTeacherRepository(deps?.prisma ?? prisma),
    deps?.invitations ?? new ClerkTeacherInviter(),
  );
}
