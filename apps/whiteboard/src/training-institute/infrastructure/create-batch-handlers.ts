import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { MovedClassGuard } from "../application/moved-class-guard";
import { PrismaClassChangeStore } from "./prisma-class-change-store";
import { CloseBatchHandler } from "../application/close-batch.handler";
import { CreateBatchHandler } from "../application/create-batch.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetBatchHandler } from "../application/get-batch.handler";
import { ListBatchesHandler } from "../application/list-batches.handler";
import { UpdateBatchScheduleHandler } from "../application/update-batch-schedule.handler";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { PrismaBatchRepository } from "./prisma-batch-repository";
import { PrismaCourseRepository } from "./prisma-course-repository";
import { PrismaEnrollmentRepository } from "./prisma-enrollment-repository";

export type BatchHandlers = {
  create: CreateBatchHandler;
  updateSchedule: UpdateBatchScheduleHandler;
  close: CloseBatchHandler;
  get: GetBatchHandler;
  list: ListBatchesHandler;
};

export function createBatchHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
}): BatchHandlers {
  const db = deps?.prisma ?? prisma;
  const batches = new PrismaBatchRepository(db);
  const courses = new PrismaCourseRepository(db);
  const enrollments = new PrismaEnrollmentRepository(db);
  const events = deps?.events ?? new InProcessEventDispatcher();
  return {
    create: new CreateBatchHandler(batches, courses, events),
    updateSchedule: new UpdateBatchScheduleHandler(
      batches,
      events,
      new MovedClassGuard({
        store: new PrismaClassChangeStore(db),
        now: () => new Date(),
      }),
    ),
    close: new CloseBatchHandler(batches, events),
    get: new GetBatchHandler(batches, enrollments),
    list: new ListBatchesHandler(batches, enrollments),
  };
}
