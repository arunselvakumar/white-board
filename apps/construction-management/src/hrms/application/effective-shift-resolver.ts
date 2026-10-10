import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  datesOf,
  firstDayOf,
  lastDayOf,
  type MonthKey,
} from "../domain/calendar";
import { resolveShift, type ShiftBook } from "../domain/effective-shift";
import { isDayOff } from "../domain/holiday";
import type {
  EffectiveShift,
  EffectiveShiftResolver,
  HrmsHoliday,
  WorkCalendar,
  WorkCalendarDay,
} from "./ports";

/**
 * Where the resolver reads assignments and templates
 * (`PrismaShiftBookSource`). One book per member, holding the Settings,
 * the member's assignments that touch `[from, to]`, and every shift and
 * rotation those assignments (and rotation slots) name.
 */
export type ShiftBookSource = {
  booksFor(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, ShiftBook>>;
};

/** Where the work calendar reads holidays (`PrismaHolidayStore`). */
export type HolidaySource = {
  holidaysBetween(
    workspaceId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<HrmsHoliday[]>;
};

/**
 * The `EffectiveShiftResolver` port (CM-307) over stored assignments: the
 * member's shift or rotation slot in force, else the Settings day
 * (`domain/effective-shift.ts` `resolveShift`).
 */
export class BookEffectiveShiftResolver implements EffectiveShiftResolver {
  constructor(private readonly books: ShiftBookSource) {}

  private async book(
    workspaceId: string,
    memberId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<ShiftBook> {
    const books = await this.books.booksFor(workspaceId, [memberId], from, to);
    const book = books.get(memberId);
    if (book == null) throw new Error("No shift book for the member.");
    return book;
  }

  async shiftFor(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<EffectiveShift> {
    return resolveShift(
      await this.book(workspaceId, memberId, date, date),
      date,
    );
  }

  async shiftsForMonth(
    workspaceId: string,
    memberId: string,
    month: MonthKey,
  ): Promise<Map<CalendarDate, EffectiveShift>> {
    const book = await this.book(
      workspaceId,
      memberId,
      firstDayOf(month),
      lastDayOf(month),
    );
    return new Map(
      datesOf(month).map((date) => [date, resolveShift(book, date)]),
    );
  }
}

/**
 * The `WorkCalendar` port (CM-305, CM-307): holidays from the Company's
 * holiday list; week offs from the member's effective shift or rotation
 * slot, falling back to the Settings working days. A non-optional
 * holiday wins over a week off; an optional holiday is a working day
 * (ADR CM-0012 §11).
 */
export class ShiftWorkCalendar implements WorkCalendar {
  constructor(
    private readonly holidays: HolidaySource,
    private readonly books: ShiftBookSource,
  ) {}

  async holidayFor(
    workspaceId: string,
    _memberId: string,
    date: CalendarDate,
  ): Promise<HrmsHoliday | null> {
    const [holiday] = await this.holidays.holidaysBetween(
      workspaceId,
      date,
      date,
    );
    return holiday ?? null;
  }

  async isHoliday(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean> {
    const holiday = await this.holidayFor(workspaceId, memberId, date);
    return holiday != null && isDayOff(holiday);
  }

  async isWeekOff(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean> {
    const books = await this.books.booksFor(
      workspaceId,
      [memberId],
      date,
      date,
    );
    const book = books.get(memberId);
    return book != null && !resolveShift(book, date).isWorkingDay;
  }

  async monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, WorkCalendarDay[]>> {
    const from = firstDayOf(month);
    const to = lastDayOf(month);
    const [holidays, books] = await Promise.all([
      this.holidays.holidaysBetween(workspaceId, from, to),
      this.books.booksFor(workspaceId, memberIds, from, to),
    ]);
    const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
    const dates = datesOf(month);
    return new Map(
      memberIds.map((memberId) => {
        const book = books.get(memberId);
        return [
          memberId,
          dates.map((date): WorkCalendarDay => {
            const holiday = byDate.get(date) ?? null;
            const working =
              book == null ? true : resolveShift(book, date).isWorkingDay;
            return {
              date,
              kind:
                holiday != null && isDayOff(holiday)
                  ? "holiday"
                  : working
                    ? "working"
                    : "week_off",
              holiday,
            };
          }),
        ];
      }),
    );
  }
}
