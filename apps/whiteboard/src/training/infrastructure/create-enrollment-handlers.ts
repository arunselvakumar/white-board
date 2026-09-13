import { prisma, type PrismaClient } from "@repo/db";

import { AdjustFeePlanHandler } from "../application/adjust-fee-plan.handler";
import { EndEnrollmentHandler } from "../application/end-enrollment.handler";
import { EnrollStudentHandler } from "../application/enroll-student.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetEnrollmentHandler } from "../application/get-enrollment.handler";
import { GetReceiptHandler } from "../application/get-receipt.handler";
import { ListEnrollmentsHandler } from "../application/list-enrollments.handler";
import { ListFeePaymentsHandler } from "../application/list-fee-payments.handler";
import { MoveEnrollmentHandler } from "../application/move-enrollment.handler";
import { OverrideEnrollmentModeHandler } from "../application/override-enrollment-mode.handler";
import { RecordFeePaymentHandler } from "../application/record-fee-payment.handler";
import { SetEnrollmentTimingsHandler } from "../application/set-enrollment-timings.handler";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { PrismaBatchRepository } from "./prisma-batch-repository";
import { PrismaCourseRepository } from "./prisma-course-repository";
import { PrismaEnrollmentRepository } from "./prisma-enrollment-repository";
import { PrismaFeePaymentRepository } from "./prisma-fee-payment-repository";
import { PrismaStudentRepository } from "./prisma-student-repository";

export type EnrollmentHandlers = {
  enroll: EnrollStudentHandler;
  overrideMode: OverrideEnrollmentModeHandler;
  setTimings: SetEnrollmentTimingsHandler;
  move: MoveEnrollmentHandler;
  end: EndEnrollmentHandler;
  get: GetEnrollmentHandler;
  list: ListEnrollmentsHandler;
  adjustFeePlan: AdjustFeePlanHandler;
  recordPayment: RecordFeePaymentHandler;
  listPayments: ListFeePaymentsHandler;
  getReceipt: GetReceiptHandler;
};

export function createEnrollmentHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
}): EnrollmentHandlers {
  const db = deps?.prisma ?? prisma;
  const enrollments = new PrismaEnrollmentRepository(db);
  const payments = new PrismaFeePaymentRepository(db);
  const students = new PrismaStudentRepository(db);
  const batches = new PrismaBatchRepository(db);
  const courses = new PrismaCourseRepository(db);
  const events = deps?.events ?? new InProcessEventDispatcher();
  return {
    enroll: new EnrollStudentHandler(
      enrollments,
      students,
      batches,
      courses,
      events,
    ),
    overrideMode: new OverrideEnrollmentModeHandler(
      enrollments,
      payments,
      events,
    ),
    setTimings: new SetEnrollmentTimingsHandler(enrollments, payments, events),
    move: new MoveEnrollmentHandler(enrollments, batches, payments, events),
    end: new EndEnrollmentHandler(enrollments, payments, events),
    get: new GetEnrollmentHandler(enrollments, payments),
    list: new ListEnrollmentsHandler(enrollments, payments),
    adjustFeePlan: new AdjustFeePlanHandler(enrollments, payments, events),
    recordPayment: new RecordFeePaymentHandler(enrollments, payments, events),
    listPayments: new ListFeePaymentsHandler(enrollments, payments),
    getReceipt: new GetReceiptHandler(payments),
  };
}
