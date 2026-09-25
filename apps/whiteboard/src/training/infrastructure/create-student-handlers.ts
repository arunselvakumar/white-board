import { prisma, type PrismaClient } from "@repo/db";

import { CreateStudentHandler } from "../application/create-student.handler";
import { DropStudentHandler } from "../application/drop-student.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetStudentHandler } from "../application/get-student.handler";
import { ListStudentsHandler } from "../application/list-students.handler";
import { InviteStudentOnCreated } from "../application/invite-student-on-created";
import { UpdateStudentProfileHandler } from "../application/update-student-profile.handler";
import { StudentId } from "../domain/student-id";
import { WorkspaceId } from "../domain/workspace-id";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { ClerkStudentInvitationSender } from "./clerk-student-invitation-sender";
import { PrismaEnrollmentRepository } from "./prisma-enrollment-repository";
import { PrismaFeePaymentRepository } from "./prisma-fee-payment-repository";
import { PrismaStudentRepository } from "./prisma-student-repository";

export type StudentHandlers = {
  create: CreateStudentHandler;
  updateProfile: UpdateStudentProfileHandler;
  drop: DropStudentHandler;
  get: GetStudentHandler;
  list: ListStudentsHandler;
};

export function createStudentHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
}): StudentHandlers {
  const db = deps?.prisma ?? prisma;
  const repository = new PrismaStudentRepository(db);
  const enrollments = new PrismaEnrollmentRepository(db);
  const payments = new PrismaFeePaymentRepository(db);
  const events = deps?.events ?? new InProcessEventDispatcher([
    new InviteStudentOnCreated(async (studentId, workspaceId) => {
      const student = await repository.findByIdInWorkspace(
        StudentId.create(studentId),
        WorkspaceId.create(workspaceId),
      );
      return student == null ? null : {
        email: student.email?.value ?? null,
        details: student.details,
        createdByUserId: student.createdByUserId.value,
      };
    }, new ClerkStudentInvitationSender()),
  ]);
  return {
    create: new CreateStudentHandler(repository, events),
    updateProfile: new UpdateStudentProfileHandler(repository, events),
    drop: new DropStudentHandler(repository, events),
    get: new GetStudentHandler(repository, enrollments, payments),
    list: new ListStudentsHandler(repository),
  };
}
