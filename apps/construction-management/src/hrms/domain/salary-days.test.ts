import { describe, expect, it } from "vitest";

import type { DayResult } from "./attendance";
import { datesOf } from "./calendar";
import { aggregateSalaryDays, type SalaryDaysInput } from "./salary-days";

// October 2026: the 1st is a Thursday; Saturdays and Sundays are week offs.
const MONTH = "2026-10";

/** Present 8 h on every working day, unless `overrides` says otherwise. */
function month(
  overrides: Record<string, Partial<DayResult>> = {},
): DayResult[] {
  return datesOf(MONTH).map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const working = weekday !== 0 && weekday !== 6;
    return {
      date,
      status: working ? "present" : "week_off",
      workedHours: working ? 8 : 0,
      overtimeHours: 0,
      overtimeAllowed: false,
      shiftWorkingHours: 8,
      late: false,
      leave: null,
      ...overrides[date],
    };
  });
}

function input(overrides: Partial<SalaryDaysInput> = {}): SalaryDaysInput {
  return { days: month(), salaryStartsOn: null, today: null, ...overrides };
}

describe("aggregateSalaryDays", () => {
  it("counts a full month present with week offs", () => {
    const result = aggregateSalaryDays(input());
    expect(result.days).toEqual({
      workingDays: 22,
      present: 22,
      halfDays: 0,
      absent: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      weekOff: 9,
      holidays: 0,
      notEmployed: 0,
    });
    expect(result.totalHours).toBe(176);
    expect(result.overtime).toEqual([]);
  });

  it("counts holidays, half days, absent days and leave with its other half", () => {
    const result = aggregateSalaryDays(
      input({
        days: month({
          "2026-10-02": { status: "holiday", workedHours: 0 },
          "2026-10-05": { status: "half_day", workedHours: 4.5 },
          "2026-10-06": { status: "absent", workedHours: 0 },
          "2026-10-07": {
            status: "on_leave",
            workedHours: 0,
            leave: { paid: true, half: false, otherHalf: null },
          },
          "2026-10-08": {
            status: "on_leave",
            workedHours: 4,
            leave: { paid: false, half: true, otherHalf: "present" },
          },
          "2026-10-09": {
            status: "on_leave",
            workedHours: 0,
            leave: { paid: true, half: true, otherHalf: "absent" },
          },
        }),
      }),
    );
    expect(result.days).toMatchObject({
      workingDays: 21,
      holidays: 1,
      halfDays: 1,
      absent: 1.5,
      paidLeave: 1.5,
      unpaidLeave: 0.5,
      present: 16.5,
    });
    expect(result.totalHours).toBe(16 * 8 + 4.5 + 4);
  });

  it("pays overtime only on days whose shift allows it, at that shift's hours", () => {
    const result = aggregateSalaryDays(
      input({
        days: month({
          "2026-10-03": { workedHours: 3, overtimeHours: 3 },
          "2026-10-05": {
            workedHours: 11,
            overtimeHours: 2,
            overtimeAllowed: true,
            shiftWorkingHours: 9,
          },
          "2026-10-06": { workedHours: 9.333, overtimeHours: 1.333 },
        }),
      }),
    );
    expect(result.overtime).toEqual([
      {
        date: "2026-10-03",
        hours: 3,
        overtimeAllowed: false,
        shiftWorkingHours: 8,
      },
      {
        date: "2026-10-05",
        hours: 2,
        overtimeAllowed: true,
        shiftWorkingHours: 9,
      },
      {
        date: "2026-10-06",
        hours: 1.33,
        overtimeAllowed: false,
        shiftWorkingHours: 8,
      },
    ]);
  });

  it("does not count or pay the days before the salary starts", () => {
    const result = aggregateSalaryDays(input({ salaryStartsOn: "2026-10-12" }));
    expect(result.days.notEmployed).toBe(11);
    // 12th–31st: 15 working days, 5 week offs.
    expect(result.days.workingDays).toBe(15);
    expect(result.days.present).toBe(15);
    expect(result.days.weekOff).toBe(5);
  });

  it("leaves the days after today uncounted, so they are paid", () => {
    const days = month(
      Object.fromEntries(
        datesOf(MONTH).map((date) => [
          date,
          { status: "absent" as const, workedHours: 0 },
        ]),
      ),
    ).map((day, index) =>
      [2, 3, 9, 10, 16, 17, 23, 24, 30].includes(index)
        ? { ...day, status: "week_off" as const }
        : day,
    );
    const result = aggregateSalaryDays(input({ days, today: "2026-10-09" }));
    // 1st–9th: 7 working days absent, 2 week offs; the rest not counted.
    expect(result.days.absent).toBe(7);
    expect(result.days.weekOff).toBe(2);
    expect(result.days.workingDays).toBe(22);
  });
});
