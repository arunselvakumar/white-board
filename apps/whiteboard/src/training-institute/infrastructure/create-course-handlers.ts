import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ArchiveCourseHandler } from "../application/archive-course.handler";
import { CreateCourseHandler } from "../application/create-course.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetCourseHandler } from "../application/get-course.handler";
import { ListCoursesHandler } from "../application/list-courses.handler";
import { UpdateCourseHandler } from "../application/update-course.handler";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { PrismaCourseRepository } from "./prisma-course-repository";

export type CourseHandlers = {
  create: CreateCourseHandler;
  update: UpdateCourseHandler;
  archive: ArchiveCourseHandler;
  get: GetCourseHandler;
  list: ListCoursesHandler;
};

export function createCourseHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
}): CourseHandlers {
  const repository = new PrismaCourseRepository(deps?.prisma ?? prisma);
  const events = deps?.events ?? new InProcessEventDispatcher();
  return {
    create: new CreateCourseHandler(repository, events),
    update: new UpdateCourseHandler(repository, events),
    archive: new ArchiveCourseHandler(repository, events),
    get: new GetCourseHandler(repository),
    list: new ListCoursesHandler(repository),
  };
}
