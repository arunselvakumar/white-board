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

import { labourCalendarDays } from "../domain/attendance-calendar";

/** A Labour's marked days (`labour_attendance`) for the Attendance tab (ADR CM-0051). */
export class PrismaLabourAttendanceCalendar implements PersonAttendanceSource {
  constructor(private readonly db: PrismaClient = prisma) {}

  async person(workspaceId: string, personId: string, timeZone: string) {
    const labour = await this.db.constructionLabourLabour.findFirst({
      where: { id: personId, workspaceId, deletedAt: null },
      select: { joiningDate: true, createdAt: true },
    });
    if (labour == null) return null;
    const joined = calendarDateFromDb(labour.joiningDate);
    const added = todayIn(timeZone, labour.createdAt);
    return { since: joined < added ? joined : added };
  }

  async firstDay(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    const first = await this.db.constructionLabourAttendance.findFirst({
      where: this.where(window),
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return first == null ? null : calendarDateFromDb(first.attendanceDate);
  }

  async days(window: PersonAttendanceWindow): Promise<AttendanceDayRow[]> {
    const rows = await this.db.constructionLabourAttendance.findMany({
      where: {
        ...this.where(window),
        attendanceDate: {
          gte: calendarDateToDb(window.from),
          lte: calendarDateToDb(window.to),
        },
      },
      orderBy: [{ attendanceDate: "asc" }, { createdAt: "asc" }],
      select: {
        attendanceDate: true,
        projectId: true,
        status: true,
        isPaidLeave: true,
        checkIn: true,
        checkOut: true,
        breakMinutes: true,
        workingHours: true,
        overtime: { select: { hours: true } },
      },
    });
    return labourCalendarDays(
      rows.map((row) => ({
        date: calendarDateFromDb(row.attendanceDate),
        projectId: row.projectId,
        status: row.status,
        isPaidLeave: row.isPaidLeave,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        breakMinutes: row.breakMinutes,
        workingHours: row.workingHours.toString(),
        overtimeHours: row.overtime.map((overtime) =>
          overtime.hours.toString(),
        ),
      })),
    );
  }

  private where(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    return {
      workspaceId: window.workspaceId,
      labourId: window.personId,
      deletedAt: null,
      ...(window.visibleProjectIds == null
        ? {}
        : { projectId: { in: [...window.visibleProjectIds] } }),
    };
  }
}
