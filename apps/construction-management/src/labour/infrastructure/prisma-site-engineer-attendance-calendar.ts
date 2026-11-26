import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import type {
  AttendanceDayRow,
  PersonAttendanceSource,
  PersonAttendanceWindow,
} from "@/src/shared-kernel/person-attendance";

import { checkInCalendarDays } from "../domain/check-in-attendance-calendar";

/**
 * A Site Engineer's days from the Check-In log (`check_in_events` of kind
 * `site_engineer`, voided entries left out) for the Attendance tab (ADR
 * CM-0051 §3). The Site Engineer is the supervisor row, not their sign-in.
 */
export class PrismaSiteEngineerAttendanceCalendar implements PersonAttendanceSource {
  constructor(private readonly db: PrismaClient = prisma) {}

  async person(workspaceId: string, personId: string, timeZone: string) {
    const engineer = await this.db.constructionMastersSupervisor.findFirst({
      where: { id: personId, workspaceId, deletedAt: null },
      select: { joiningDate: true, createdAt: true },
    });
    if (engineer == null) return null;
    const added = todayIn(timeZone, engineer.createdAt);
    if (engineer.joiningDate == null) return { since: added };
    const joined = calendarDateFromDb(engineer.joiningDate);
    return { since: joined < added ? joined : added };
  }

  async firstDay(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    const first = await this.db.constructionLabourCheckInEvent.findFirst({
      where: { ...this.where(window), action: "check_in" },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return first == null ? null : calendarDateFromDb(first.attendanceDate);
  }

  async days(window: PersonAttendanceWindow): Promise<AttendanceDayRow[]> {
    const rows = await this.db.constructionLabourCheckInEvent.findMany({
      where: {
        ...this.where(window),
        attendanceDate: {
          gte: calendarDateToDb(window.from),
          lte: calendarDateToDb(window.to),
        },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        projectId: true,
        action: true,
        occurredAt: true,
        attendanceDate: true,
      },
    });
    return checkInCalendarDays(
      rows.map((row) => ({
        projectId: row.projectId,
        action: row.action,
        occurredAt: row.occurredAt,
        attendanceDate: calendarDateFromDb(row.attendanceDate),
      })),
      window.timeZone,
    );
  }

  private where(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    return {
      workspaceId: window.workspaceId,
      personKind: "site_engineer" as const,
      personId: window.personId,
      voidedAt: null,
      ...(window.visibleProjectIds == null
        ? {}
        : { projectId: { in: [...window.visibleProjectIds] } }),
    };
  }
}
