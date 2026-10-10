import {
  addDays,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import {
  attendanceDay,
  type ApprovalStatus,
  type DayLeave,
} from "../domain/attendance";
import {
  addMonths,
  firstDayOf,
  lastDayOf,
  monthKeyOf,
  type MonthKey,
} from "../domain/calendar";
import { resolveShift } from "../domain/effective-shift";
import { isDayOff } from "../domain/holiday";
import type {
  HolidaySource,
  ShiftBookSource,
} from "./effective-shift-resolver";
import type {
  AttendanceDay,
  AttendanceDaySource,
  LeaveDaySource,
} from "./ports";

/** An entry as the day source reads it (`AttendanceStore.entriesBetween`). */
export type DayEntryRow = {
  memberId: string;
  date: CalendarDate;
  checkInAt: Date;
  checkOutAt: Date | null;
  approvalStatus: ApprovalStatus;
};

export type DayEntryReader = {
  /** Live entries of these members dated `from`–`to`, any approval status. */
  entriesBetween(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<DayEntryRow[]>;
};

/** The months `from`–`to` touch. */
function monthsBetween(from: CalendarDate, to: CalendarDate): MonthKey[] {
  const months: MonthKey[] = [];
  for (
    let month = monthKeyOf(from);
    month <= monthKeyOf(to);
    month = addMonths(month, 1)
  )
    months.push(month);
  return months;
}

/**
 * The `AttendanceDaySource` port (CM-308) over recorded entries: per
 * member per date, the shift and calendar (CM-305, CM-307), approved
 * leave (`LeaveDaySource`, CM-312) and the day's entries, through
 * `domain/attendance.ts` `attendanceDay`. Read by the salary run (CM-316),
 * the monthly summary and report, Team Today and the dashboard.
 */
export class RecordedAttendanceDaySource implements AttendanceDaySource {
  constructor(
    private readonly deps: {
      books: ShiftBookSource;
      holidays: HolidaySource;
      entries: DayEntryReader;
      leave: LeaveDaySource;
      timeZone: (workspaceId: string) => Promise<string>;
    },
  ) {}

  monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, AttendanceDay[]>> {
    return this.daysBetween(
      workspaceId,
      memberIds,
      firstDayOf(month),
      lastDayOf(month),
    );
  }

  /** Every date `from`–`to` (inclusive) for each member, in order. */
  async daysBetween(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, AttendanceDay[]>> {
    const ids = [...new Set(memberIds)];
    if (ids.length === 0) return new Map();
    const [books, holidays, entries, leaveMonths, timeZone] = await Promise.all(
      [
        this.deps.books.booksFor(workspaceId, ids, from, to),
        this.deps.holidays.holidaysBetween(workspaceId, from, to),
        this.deps.entries.entriesBetween(workspaceId, ids, from, to),
        Promise.all(
          monthsBetween(from, to).map((month) =>
            this.deps.leave.approvedForMonth(workspaceId, ids, month),
          ),
        ),
        this.deps.timeZone(workspaceId),
      ],
    );
    const holidayOn = new Map(
      holidays.map((holiday) => [holiday.date, holiday]),
    );
    const entriesOf = new Map<string, DayEntryRow[]>();
    for (const entry of entries) {
      const key = `${entry.memberId}|${entry.date}`;
      const list = entriesOf.get(key) ?? [];
      list.push(entry);
      entriesOf.set(key, list);
    }
    const leaveOf = new Map<string, DayLeave[]>();
    for (const byMember of leaveMonths)
      for (const [memberId, days] of byMember)
        for (const leave of days) {
          const key = `${memberId}|${leave.date}`;
          const list = leaveOf.get(key) ?? [];
          list.push({ paid: leave.isPaid, days: leave.days });
          leaveOf.set(key, list);
        }

    const dates = Array.from(
      { length: daysBetween(from, to) + 1 },
      (_, index) => addDays(from, index),
    );
    return new Map(
      ids.map((memberId) => {
        const book = books.get(memberId);
        return [
          memberId,
          dates.map((date): AttendanceDay => {
            const shift = book == null ? null : resolveShift(book, date);
            const holiday = holidayOn.get(date);
            const kind =
              holiday != null && isDayOff(holiday)
                ? "holiday"
                : shift == null || shift.isWorkingDay
                  ? "working"
                  : "week_off";
            return attendanceDay({
              date,
              kind,
              shift: shift ?? {
                startTime: null,
                endTime: null,
                workingHours: 8,
                halfDayHours: 4,
                graceMinutes: 0,
                overtimeAllowed: false,
              },
              entries: entriesOf.get(`${memberId}|${date}`) ?? [],
              leave: leaveOf.get(`${memberId}|${date}`) ?? [],
              timeZone,
            });
          }),
        ];
      }),
    );
  }
}
