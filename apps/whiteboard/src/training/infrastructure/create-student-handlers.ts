import { prisma, type PrismaClient } from "@repo/db";

import { CreateStudentHandler } from "../application/create-student.handler";
import { DropStudentHandler } from "../application/drop-student.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetStudentHandler } from "../application/get-student.handler";
import { ListStudentsHandler } from "../application/list-students.handler";
import { UpdateStudentProfileHandler } from "../application/update-student-profile.handler";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
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
  const events = deps?.events ?? new InProcessEventDispatcher();
  return {
    create: new CreateStudentHandler(repository, events),
    updateProfile: new UpdateStudentProfileHandler(repository, events),
    drop: new DropStudentHandler(repository, events),
    get: new GetStudentHandler(repository, enrollments, payments),
    list: new ListStudentsHandler(repository),
  };
}
