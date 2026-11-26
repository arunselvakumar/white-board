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

import { vendorCalendarDays } from "../domain/vendor-attendance-calendar";

/** A Vendor's saved headcounts (`vendor_attendance` and its lines) for the Attendance tab (ADR CM-0051 §3). */
export class PrismaVendorAttendanceCalendar implements PersonAttendanceSource {
  constructor(private readonly db: PrismaClient = prisma) {}

  async person(workspaceId: string, personId: string, timeZone: string) {
    const vendor = await this.db.constructionLabourVendor.findFirst({
      where: { id: personId, workspaceId, deletedAt: null },
      select: { joiningDate: true, createdAt: true },
    });
    if (vendor == null) return null;
    const joined = calendarDateFromDb(vendor.joiningDate);
    const added = todayIn(timeZone, vendor.createdAt);
    return { since: joined < added ? joined : added };
  }

  /** The first day with any heads: a save whose lines are all zero supplied nobody. */
  async firstDay(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    const first = await this.db.constructionLabourVendorAttendance.findFirst({
      where: {
        ...this.where(window),
        lines: {
          some: {
            OR: [{ fullDayCount: { gt: 0 } }, { halfDayCount: { gt: 0 } }],
          },
        },
      },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return first == null ? null : calendarDateFromDb(first.attendanceDate);
  }

  async days(window: PersonAttendanceWindow): Promise<AttendanceDayRow[]> {
    const rows = await this.db.constructionLabourVendorAttendance.findMany({
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
        lines: {
          select: {
            fullDayCount: true,
            halfDayCount: true,
            overtimeHours: true,
          },
        },
      },
    });
    return vendorCalendarDays(
      rows.map((row) => ({
        date: calendarDateFromDb(row.attendanceDate),
        projectId: row.projectId,
        lines: row.lines.map((line) => ({
          fullDayCount: line.fullDayCount,
          halfDayCount: line.halfDayCount,
          overtimeHours: line.overtimeHours.toString(),
        })),
      })),
    );
  }

  private where(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    return {
      workspaceId: window.workspaceId,
      vendorId: window.personId,
      deletedAt: null,
      ...(window.visibleProjectIds == null
        ? {}
        : { projectId: { in: [...window.visibleProjectIds] } }),
    };
  }
}
