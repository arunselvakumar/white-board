import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { EnquiryHandlers } from "../application/enquiry-handlers";
import { EnquiryQueries } from "../application/enquiry-queries";
import type { EventDispatcher } from "../application/event-dispatcher";
import { InviteStudentOnCreated } from "../application/invite-student-on-created";
import { StudentId } from "../domain/student-id";
import { WorkspaceId } from "../domain/workspace-id";
import { WorkspaceStudentInvitationSender } from "./workspace-student-invitation-sender";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { PrismaEnquiryReader } from "./prisma-enquiry-reader";
import { PrismaEnquiryStore } from "./prisma-enquiry-store";
import { PrismaStudentRepository } from "./prisma-student-repository";

export type EnquiryHandlerSet = {
  commands: EnquiryHandlers;
  queries: EnquiryQueries;
};

/** Converting an Enquiry invites the new Student, the same as Add Student. */
function studentEvents(db: PrismaClient): EventDispatcher {
  const students = new PrismaStudentRepository(db);
  return new InProcessEventDispatcher([
    new InviteStudentOnCreated(async (studentId, workspaceId) => {
      const student = await students.findByIdInWorkspace(
        StudentId.create(studentId),
        WorkspaceId.create(workspaceId),
      );
      return student == null
        ? null
        : {
            email: student.email?.value ?? null,
            details: student.details,
            createdByUserId: student.createdByUserId.value,
          };
    }, new WorkspaceStudentInvitationSender()),
  ]);
}

export function createEnquiryHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
  now?: () => Date;
}): EnquiryHandlerSet {
  const db = deps?.prisma ?? prisma;
  const store = new PrismaEnquiryStore(db);
  const reader = new PrismaEnquiryReader(db);
  const now = deps?.now ?? (() => new Date());
  return {
    commands: new EnquiryHandlers({
      store,
      reader,
      events: deps?.events ?? studentEvents(db),
      now,
    }),
    queries: new EnquiryQueries({ reader, now, schedule: store }),
  };
}
