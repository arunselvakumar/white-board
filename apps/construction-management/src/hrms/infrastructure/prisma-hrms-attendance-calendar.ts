import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type {
  AttendanceDayRow,
  PersonAttendanceSource,
  PersonAttendanceWindow,
} from "@/src/shared-kernel/person-attendance";

import type { AttendanceDays } from "../application/attendance-handlers";
import {
  hrmsCalendarDay,
  type CalendarBranch,
  type CalendarEntry,
} from "../domain/attendance-calendar";
import { PrismaAttendanceStore } from "./prisma-attendance-store";

type Member = { since: CalendarDate; active: boolean };

function earlier(a: CalendarDate, b: CalendarDate): CalendarDate {
  return a < b ? a : b;
}

function later(a: CalendarDate, b: CalendarDate): CalendarDate {
  return a > b ? a : b;
}

/**
 * An Office Staff member's HRMS attendance (`attendance_entries`) for the
 * Attendance tab (ADR CM-0051 §3): each day's status by the HRMS day rule
 * (ADR CM-0012 §2: shifts, holidays, week offs and approved leave, the
 * same day source as the monthly summary) and the day's entries by the
 * branch or Project site checked in at.
 *
 * As in the monthly summary, a joined (active) member has a status for
 * every day from their first day to today, Absent included; a member
 * who has not joined or has left has only the days they have entries on.
 * Days after today are never read. Not filtered by Project (§5).
 */
export class PrismaHrmsAttendanceCalendar implements PersonAttendanceSource {
  private readonly entries: PrismaAttendanceStore;

  constructor(
    private readonly deps: {
      days: AttendanceDays;
      prisma?: PrismaClient;
      now?: () => Date;
    },
  ) {
    this.entries = new PrismaAttendanceStore(this.db);
  }

  private get db(): PrismaClient {
    return this.deps.prisma ?? prisma;
  }

  private async member(
    workspaceId: string,
    personId: string,
    timeZone: string,
  ): Promise<Member | null> {
    const row = await this.db.constructionOrganizationTeamMember.findFirst({
      where: { id: personId, workspaceId, deletedAt: null },
      select: { joinedAt: true, createdAt: true, status: true },
    });
    if (row == null) return null;
    const added = todayIn(timeZone, row.createdAt);
    const joined =
      row.joinedAt == null ? null : todayIn(timeZone, row.joinedAt);
    return {
      since: joined == null ? added : earlier(joined, added),
      active: row.status === "active",
    };
  }

  async person(workspaceId: string, personId: string, timeZone: string) {
    const member = await this.member(workspaceId, personId, timeZone);
    return member == null ? null : { since: member.since };
  }

  async firstDay(window: Omit<PersonAttendanceWindow, "from" | "to">) {
    const first = await this.db.constructionHrmsAttendanceEntry.findFirst({
      where: {
        workspaceId: window.workspaceId,
        memberId: window.personId,
        deletedAt: null,
        approvalStatus: { not: "rejected" },
      },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return first == null ? null : calendarDateFromDb(first.attendanceDate);
  }

  async days(window: PersonAttendanceWindow): Promise<AttendanceDayRow[]> {
    const { workspaceId, personId, timeZone } = window;
    const member = await this.member(workspaceId, personId, timeZone);
    if (member == null) return [];
    const today = todayIn(timeZone, this.deps.now?.() ?? new Date());
    const to = earlier(window.to, today);
    if (to < window.from) return [];

    const entries = (
      await this.entries.entriesBetween(
        workspaceId,
        [personId],
        window.from,
        to,
      )
    ).filter((entry) => entry.approvalStatus !== "rejected");
    const entryDates = new Set(entries.map((entry) => entry.date));
    const ruleFrom = member.active ? later(window.from, member.since) : null;
    const dates = [...entryDates].sort();
    const from =
      ruleFrom == null
        ? dates[0]
        : dates[0] == null
          ? ruleFrom
          : earlier(ruleFrom, dates[0]);
    if (from == null || from > to) return [];

    const [days, branches] = await Promise.all([
      this.deps.days.daysBetween(workspaceId, [personId], from, to),
      this.branches(
        workspaceId,
        entries.flatMap((entry) =>
          entry.checkInBranchId == null ? [] : [entry.checkInBranchId],
        ),
      ),
    ]);
    const byDate = new Map<CalendarDate, CalendarEntry[]>();
    for (const entry of entries) {
      const list = byDate.get(entry.date) ?? [];
      list.push({
        checkInAt: entry.checkInAt,
        checkOutAt: entry.checkOutAt,
        approvalStatus: entry.approvalStatus,
        branch:
          entry.checkInBranchId == null
            ? null
            : (branches.get(entry.checkInBranchId) ?? null),
      });
      byDate.set(entry.date, list);
    }

    return (days.get(personId) ?? [])
      .filter(
        (day) =>
          entryDates.has(day.date) ||
          (ruleFrom != null && day.date >= ruleFrom),
      )
      .map((day) =>
        hrmsCalendarDay(
          {
            date: day.date,
            status: day.status,
            leave: day.leave,
            overtimeHours: day.overtimeHours,
          },
          byDate.get(day.date) ?? [],
          timeZone,
        ),
      );
  }

  /** Branches by id, a removed one included: it was where they checked in. */
  private async branches(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CalendarBranch>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionHrmsBranch.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, projectId: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}
