import { describe, expect, it } from "vitest";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type {
  AssignmentSpan,
  RotationRule,
  ShiftBook,
  ShiftRule,
} from "../domain/effective-shift";
import { DEFAULT_HRMS_SETTINGS } from "../domain/hrms-settings";
import {
  BookEffectiveShiftResolver,
  ShiftWorkCalendar,
  type HolidaySource,
  type ShiftBookSource,
} from "./effective-shift-resolver";
import type { HrmsHoliday } from "./ports";

const NIGHT: ShiftRule = {
  id: "night",
  name: "Night",
  startTime: "22:00",
  endTime: "06:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 0,
  overtimeAllowed: true,
};

const WEEK: RotationRule = {
  id: "week",
  name: "Sunday off",
  type: "week",
  slots: [
    ...Array.from({ length: 6 }, () => ({
      kind: "shift" as const,
      shiftTemplateId: "night",
    })),
    { kind: "week_off" as const },
  ],
};

/** Books from fixed assignments per member; members without any get none. */
class FakeBooks implements ShiftBookSource {
  readonly calls: { memberIds: string[]; from: string; to: string }[] = [];

  constructor(private readonly assignments: Record<string, AssignmentSpan[]>) {}

  booksFor(
    _workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, ShiftBook>> {
    this.calls.push({ memberIds: [...memberIds], from, to });
    return Promise.resolve(
      new Map(
        memberIds.map((id) => [
          id,
          {
            settings: DEFAULT_HRMS_SETTINGS,
            assignments: this.assignments[id] ?? [],
            shifts: new Map([[NIGHT.id, NIGHT]]),
            rotations: new Map([[WEEK.id, WEEK]]),
          },
        ]),
      ),
    );
  }
}

class FakeHolidays implements HolidaySource {
  constructor(private readonly holidays: HrmsHoliday[]) {}

  holidaysBetween(
    _workspaceId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<HrmsHoliday[]> {
    return Promise.resolve(
      this.holidays.filter((item) => item.date >= from && item.date <= to),
    );
  }
}

const ASSIGNMENTS: Record<string, AssignmentSpan[]> = {
  crew: [
    {
      id: "a1",
      shiftTemplateId: null,
      rotationTemplateId: "week",
      effectiveFrom: "2026-10-01",
      effectiveTo: null,
    },
  ],
};

const HOLIDAYS: HrmsHoliday[] = [
  {
    id: "h1",
    name: "Gandhi Jayanti",
    date: "2026-10-02",
    type: "national",
    isOptional: false,
  },
  {
    id: "h2",
    name: "Company Day",
    date: "2026-10-03",
    type: "company",
    isOptional: true,
  },
  {
    id: "h3",
    name: "Sunday Festival",
    date: "2026-10-04",
    type: "festival",
    isOptional: false,
  },
];

describe("BookEffectiveShiftResolver", () => {
  it("resolves one date from the member's book", async () => {
    const books = new FakeBooks(ASSIGNMENTS);
    const resolver = new BookEffectiveShiftResolver(books);
    expect(await resolver.shiftFor("c1", "crew", "2026-10-05")).toMatchObject({
      source: "rotation",
      name: "Night",
      startTime: "22:00",
      isWorkingDay: true,
    });
    expect(books.calls[0]).toEqual({
      memberIds: ["crew"],
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect((await resolver.shiftFor("c1", "nobody", "2026-10-05")).source).toBe(
      "settings",
    );
  });

  it("resolves a month with one read", async () => {
    const books = new FakeBooks(ASSIGNMENTS);
    const month = await new BookEffectiveShiftResolver(books).shiftsForMonth(
      "c1",
      "crew",
      "2026-10",
    );
    expect(month.size).toBe(31);
    expect(month.get("2026-10-04")?.name).toBe("Week Off");
    expect(month.get("2026-10-31")?.name).toBe("Night");
    expect(books.calls).toEqual([
      { memberIds: ["crew"], from: "2026-10-01", to: "2026-10-31" },
    ]);
  });
});

describe("ShiftWorkCalendar", () => {
  const calendar = new ShiftWorkCalendar(
    new FakeHolidays(HOLIDAYS),
    new FakeBooks(ASSIGNMENTS),
  );

  it("marks holidays, week offs from the rotation, and working days", async () => {
    const days = await calendar.monthFor("c1", ["crew", "office"], "2026-10");
    const crew = days.get("crew") ?? [];
    const office = days.get("office") ?? [];
    expect(crew).toHaveLength(31);
    // A non-optional holiday is a holiday for everyone.
    expect(crew[1]).toMatchObject({ kind: "holiday", holiday: { id: "h1" } });
    // An optional holiday stays a working day (ADR CM-0012 §11) …
    expect(crew[2]).toMatchObject({ kind: "working", holiday: { id: "h2" } });
    // … but a Saturday is a week off for the Settings (Monday–Friday).
    expect(office[2]).toMatchObject({
      kind: "week_off",
      holiday: { id: "h2" },
    });
    // A holiday on a week off is a holiday.
    expect(crew[3]?.kind).toBe("holiday");
    // The rotation's Sunday off, and the Settings' weekend.
    expect(crew[10]).toMatchObject({ date: "2026-10-11", kind: "week_off" });
    expect(crew[9]).toMatchObject({ date: "2026-10-10", kind: "working" });
    expect(office[9]).toMatchObject({ date: "2026-10-10", kind: "week_off" });
  });

  it("answers single dates", async () => {
    expect(await calendar.isHoliday("c1", "crew", "2026-10-02")).toBe(true);
    expect(await calendar.isHoliday("c1", "crew", "2026-10-03")).toBe(false);
    expect((await calendar.holidayFor("c1", "crew", "2026-10-03"))?.name).toBe(
      "Company Day",
    );
    expect(await calendar.holidayFor("c1", "crew", "2026-10-05")).toBeNull();
    expect(await calendar.isWeekOff("c1", "crew", "2026-10-11")).toBe(true);
    expect(await calendar.isWeekOff("c1", "crew", "2026-10-10")).toBe(false);
    expect(await calendar.isWeekOff("c1", "office", "2026-10-10")).toBe(true);
  });
});
