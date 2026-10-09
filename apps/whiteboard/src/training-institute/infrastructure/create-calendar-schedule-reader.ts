import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { CalendarScheduleReader } from "../application/calendar-schedule";

import { PrismaCalendarScheduleReader } from "./prisma-calendar-schedule-reader";

export function createCalendarScheduleReader(
  db: PrismaClient = prisma,
): CalendarScheduleReader {
  return new PrismaCalendarScheduleReader(db);
}
