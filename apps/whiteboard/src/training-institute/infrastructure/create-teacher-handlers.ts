import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import {
  TeacherHandlers,
  type TeacherInviter,
} from "../application/teacher-handlers";
import { WorkspaceTeacherInviter } from "./workspace-teacher-inviter";
import { PrismaTeacherRepository } from "./prisma-teacher-repository";
import { PrismaTeacherDocumentRepository } from "./prisma-teacher-document-repository";

export function createTeacherHandlers(deps?: {
  prisma?: PrismaClient;
  invitations?: TeacherInviter;
}): TeacherHandlers {
  return new TeacherHandlers(
    new PrismaTeacherRepository(deps?.prisma ?? prisma),
    deps?.invitations ?? new WorkspaceTeacherInviter(),
    new PrismaTeacherDocumentRepository(deps?.prisma ?? prisma),
  );
}
