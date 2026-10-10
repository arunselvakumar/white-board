import { describe, expect, it } from "vitest";

import { datesOf } from "./calendar";
import {
  aggregateSalaryDays,
  type SalaryAttendanceDay,
  type SalaryCalendarDay,
  type SalaryDaysInput,
} from "./salary-days";

// October 2026: the 1st is a Thursday; Saturdays and Sundays are week offs.
const MONTH = "2026-10";

function calendar(holidays: string[] = []): SalaryCalendarDay[] {
  return datesOf(MONTH).map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      date,
      kind: holidays.includes(date)
        ? "holiday"
        : weekday === 0 || weekday === 6
          ? "week_off"
          : "working",
    };
  });
}

/** Present 8 h on every working day, unless `overrides` says otherwise. */
function attendance(
  overrides: Record<string, Partial<SalaryAttendanceDay>> = {},
  days = calendar(),
): SalaryAttendanceDay[] {
  return days.map((day) => ({
    date: day.date,
    status: day.kind === "working" ? "present" : day.kind,
    workedHours: day.kind === "working" ? 8 : 0,
    overtimeHours: 0,
    leave: null,
    ...overrides[day.date],
  }));
}

function input(overrides: Partial<SalaryDaysInput> = {}): SalaryDaysInput {
  return {
    month: MONTH,
    calendar: calendar(),
    attendance: attendance(),
    leave: [],
    shifts: new Map(),
    salaryStartsOn: null,
    today: null,
    ...overrides,
  };
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

  it("counts a non-optional holiday on a working day as a holiday", () => {
    const days = calendar(["2026-10-02"]);
    const result = aggregateSalaryDays(
      input({ calendar: days, attendance: attendance({}, days) }),
    );
    expect(result.days.holidays).toBe(1);
    expect(result.days.workingDays).toBe(21);
    expect(result.days.present).toBe(21);
  });

  it("counts half days whole, absent days, and a missing record as absent", () => {
    const result = aggregateSalaryDays(
      input({
        attendance: attendance({
          "2026-10-05": { status: "half_day", workedHours: 4.5 },
          "2026-10-06": { status: "absent", workedHours: 0 },
        }).filter((day) => day.date !== "2026-10-07"),
      }),
    );
    expect(result.days.halfDays).toBe(1);
    expect(result.days.absent).toBe(2);
    expect(result.days.present).toBe(19);
    expect(result.totalHours).toBe(19 * 8 + 4.5);
  });

  it("takes paid and unpaid leave from approved leave, half days split with the attendance", () => {
    const result = aggregateSalaryDays(
      input({
        attendance: attendance({
          "2026-10-05": { status: "on_leave", workedHours: 0 },
          "2026-10-06": { status: "on_leave", workedHours: 0 },
          "2026-10-07": { status: "present", workedHours: 4 },
          "2026-10-08": { status: "absent", workedHours: 0 },
        }),
        leave: [
          { date: "2026-10-05", isPaid: true, days: 1 },
          { date: "2026-10-06", isPaid: false, days: 1 },
          { date: "2026-10-07", isPaid: true, days: 0.5 },
          { date: "2026-10-08", isPaid: false, days: 0.5 },
        ],
      }),
    );
    expect(result.days.paidLeave).toBe(1.5);
    expect(result.days.unpaidLeave).toBe(1.5);
    // 18 full days, the worked half of the 7th.
    expect(result.days.present).toBe(18.5);
    // The unworked half of the 8th.
    expect(result.days.absent).toBe(0.5);
  });

  it("caps leave at one day and counts unpaid halves first", () => {
    const result = aggregateSalaryDays(
      input({
        leave: [
          { date: "2026-10-05", isPaid: true, days: 0.5 },
          { date: "2026-10-05", isPaid: false, days: 0.5 },
          { date: "2026-10-05", isPaid: true, days: 1 },
        ],
      }),
    );
    expect(result.days.unpaidLeave).toBe(0.5);
    expect(result.days.paidLeave).toBe(0.5);
    expect(result.days.present).toBe(21);
  });

  it("falls back to the leave the attendance status carries", () => {
    const result = aggregateSalaryDays(
      input({
        attendance: attendance({
          "2026-10-05": {
            status: "on_leave",
            workedHours: 0,
            leave: { paid: false, half: false },
          },
          "2026-10-06": {
            status: "on_leave",
            workedHours: 4,
            leave: { paid: true, half: true },
          },
        }),
      }),
    );
    expect(result.days.unpaidLeave).toBe(1);
    expect(result.days.paidLeave).toBe(0.5);
    expect(result.days.present).toBe(20.5);
  });

  it("does not count leave on a holiday or a week off", () => {
    const days = calendar(["2026-10-02"]);
    const result = aggregateSalaryDays(
      input({
        calendar: days,
        attendance: attendance({}, days),
        leave: [
          { date: "2026-10-02", isPaid: false, days: 1 },
          { date: "2026-10-03", isPaid: false, days: 1 },
        ],
      }),
    );
    expect(result.days.unpaidLeave).toBe(0);
    expect(result.days.holidays).toBe(1);
    expect(result.days.weekOff).toBe(9);
  });

  it("pays overtime only on days whose shift allows it, at that shift's hours", () => {
    const result = aggregateSalaryDays(
      input({
        attendance: attendance({
          "2026-10-05": { workedHours: 10, overtimeHours: 2 },
          "2026-10-06": { workedHours: 9.333, overtimeHours: 1.333 },
          "2026-10-03": { workedHours: 3, overtimeHours: 3 },
        }),
        shifts: new Map([
          ["2026-10-05", { overtimeAllowed: true, workingHours: 9 }],
          ["2026-10-06", { overtimeAllowed: false, workingHours: 8 }],
          ["2026-10-03", { overtimeAllowed: false, workingHours: 8 }],
        ]),
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
    // Hours on the week off count too.
    expect(result.totalHours).toBe(20 * 8 + 10 + 9.33 + 3);
  });

  it("does not pay the days before the salary starts", () => {
    const result = aggregateSalaryDays(input({ salaryStartsOn: "2026-10-12" }));
    expect(result.days.notEmployed).toBe(11);
    // 12th–31st: 15 working days, 5 week offs.
    expect(result.days.workingDays).toBe(15);
    expect(result.days.present).toBe(15);
    expect(result.days.weekOff).toBe(5);
  });

  it("leaves the days after today uncounted, so they are paid", () => {
    const result = aggregateSalaryDays(
      input({ attendance: [], today: "2026-10-09" }),
    );
    // 1st–9th: 7 working days without a record are absent.
    expect(result.days.absent).toBe(7);
    expect(result.days.weekOff).toBe(2);
    expect(result.days.workingDays).toBe(22);
    const accounted =
      result.days.present + result.days.absent + result.days.weekOff;
    expect(accounted).toBe(9);
  });
});
