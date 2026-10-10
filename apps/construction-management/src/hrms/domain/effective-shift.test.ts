import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { datesOf } from "./calendar";
import {
  assignmentOn,
  planAssignment,
  resolveShift,
  rotationSlotIndex,
  type AssignmentSpan,
  type RotationRule,
  type ShiftBook,
  type ShiftRule,
} from "./effective-shift";
import { DEFAULT_HRMS_SETTINGS } from "./hrms-settings";

const GENERAL: ShiftRule = {
  id: "general",
  name: "General",
  startTime: "09:00",
  endTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 5,
  overtimeAllowed: true,
};

const NIGHT: ShiftRule = {
  id: "night",
  name: "Night",
  startTime: "22:00",
  endTime: "06:00",
  workingDays: [1, 2, 3, 4, 5],
  workingHours: 7.5,
  halfDayHours: 4,
  graceMinutes: 0,
  overtimeAllowed: false,
};

const SHIFT = (id: string) => ({ kind: "shift" as const, shiftTemplateId: id });
const OFF = { kind: "week_off" as const };

const WEEK: RotationRule = {
  id: "week",
  name: "Week crew",
  type: "week",
  // Monday … Sunday.
  slots: [
    SHIFT("general"),
    SHIFT("general"),
    SHIFT("night"),
    SHIFT("night"),
    SHIFT("general"),
    SHIFT("general"),
    OFF,
  ],
};

const MONTH: RotationRule = {
  id: "month",
  name: "Fortnights",
  type: "month",
  slots: Array.from({ length: 31 }, (_, index) =>
    index < 15 ? SHIFT("general") : SHIFT("night"),
  ),
};

const CYCLE: RotationRule = {
  id: "cycle",
  name: "Two on, one off",
  type: "custom_cycle",
  slots: [SHIFT("general"), SHIFT("night"), OFF],
};

function span(
  overrides: Partial<AssignmentSpan> & Pick<AssignmentSpan, "effectiveFrom">,
): AssignmentSpan {
  return {
    id: overrides.id ?? `a-${overrides.effectiveFrom}`,
    shiftTemplateId: null,
    rotationTemplateId: null,
    effectiveTo: null,
    ...overrides,
  };
}

function book(assignments: AssignmentSpan[]): ShiftBook {
  return {
    settings: DEFAULT_HRMS_SETTINGS,
    assignments,
    shifts: new Map([
      [GENERAL.id, GENERAL],
      [NIGHT.id, NIGHT],
    ]),
    rotations: new Map([
      [WEEK.id, WEEK],
      [MONTH.id, MONTH],
      [CYCLE.id, CYCLE],
    ]),
  };
}

describe("no assignment", () => {
  it("falls back to the Settings day", () => {
    const monday = resolveShift(book([]), "2026-10-05");
    expect(monday).toEqual({
      source: "settings",
      shiftTemplateId: null,
      rotationTemplateId: null,
      name: "Standard",
      startTime: null,
      endTime: null,
      workingHours: 8,
      halfDayHours: 4,
      graceMinutes: 15,
      overtimeAllowed: false,
      isWorkingDay: true,
    });
    expect(resolveShift(book([]), "2026-10-10").isWorkingDay).toBe(false); // Saturday
  });

  it("uses the Settings before the first assignment starts", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-15", shiftTemplateId: "general" }),
    ]);
    expect(resolveShift(assigned, "2026-10-14").source).toBe("settings");
    expect(resolveShift(assigned, "2026-10-15").source).toBe("shift");
  });
});

describe("a shift assignment", () => {
  it("applies the shift, working on its own working days", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-01", shiftTemplateId: "general" }),
    ]);
    const saturday = resolveShift(assigned, "2026-10-10");
    expect(saturday).toMatchObject({
      source: "shift",
      shiftTemplateId: "general",
      rotationTemplateId: null,
      name: "General",
      startTime: "09:00",
      endTime: "18:00",
      graceMinutes: 5,
      overtimeAllowed: true,
      isWorkingDay: true,
    });
    expect(resolveShift(assigned, "2026-10-11").isWorkingDay).toBe(false); // Sunday
  });

  it("keeps a midnight-crossing shift on the day it starts", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-01", shiftTemplateId: "night" }),
    ]);
    // Friday night 22:00 to Saturday 06:00 is Friday's shift.
    expect(resolveShift(assigned, "2026-10-09")).toMatchObject({
      name: "Night",
      startTime: "22:00",
      endTime: "06:00",
      workingHours: 7.5,
      isWorkingDay: true,
    });
    expect(resolveShift(assigned, "2026-10-10").isWorkingDay).toBe(false);
  });
});

describe("a change mid-month", () => {
  // General until the 14th, then Night from the 15th: the previous
  // assignment was closed the day before.
  const changed = book([
    span({
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-10-14",
      shiftTemplateId: "general",
    }),
    span({ effectiveFrom: "2026-10-15", shiftTemplateId: "night" }),
  ]);

  it("answers the old shift for past dates and the new one after", () => {
    expect(resolveShift(changed, "2026-10-14").name).toBe("General");
    expect(resolveShift(changed, "2026-10-15").name).toBe("Night");
    expect(resolveShift(changed, "2027-01-04").name).toBe("Night");
    const month = datesOf("2026-10").map(
      (date) => resolveShift(changed, date).name,
    );
    expect(month.filter((name) => name === "General")).toHaveLength(14);
    expect(month.filter((name) => name === "Night")).toHaveLength(17);
  });
});

describe("rotations", () => {
  it("picks a Week rotation's slot by weekday, Week Off included", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-07", rotationTemplateId: "week" }), // a Wednesday
    ]);
    expect(resolveShift(assigned, "2026-10-07")).toMatchObject({
      source: "rotation",
      rotationTemplateId: "week",
      shiftTemplateId: "night",
      name: "Night",
      isWorkingDay: true,
    });
    // Saturday: General, though the rotation decides, not the shift's days.
    expect(resolveShift(assigned, "2026-10-10").name).toBe("General");
    const sunday = resolveShift(assigned, "2026-10-11");
    expect(sunday).toMatchObject({
      source: "rotation",
      rotationTemplateId: "week",
      shiftTemplateId: null,
      name: "Week Off",
      startTime: null,
      overtimeAllowed: false,
      isWorkingDay: false,
      workingHours: 8,
    });
    // A Night shift slot works even on a weekday Night does not list.
    const nightOnly = book([
      span({ effectiveFrom: "2026-10-01", rotationTemplateId: "cycle" }),
    ]);
    expect(resolveShift(nightOnly, "2026-10-03")).toMatchObject({
      name: "Week Off",
    });
  });

  it("picks a Month rotation's slot by day of the month", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-20", rotationTemplateId: "month" }),
    ]);
    expect(resolveShift(assigned, "2026-10-20").name).toBe("Night");
    expect(resolveShift(assigned, "2026-11-01").name).toBe("General");
    expect(resolveShift(assigned, "2026-11-15").name).toBe("General");
    expect(resolveShift(assigned, "2026-11-16").name).toBe("Night");
    // February has 28 days; slots 29–31 are simply not reached.
    expect(resolveShift(assigned, "2027-02-28").name).toBe("Night");
    expect(resolveShift(assigned, "2027-03-01").name).toBe("General");
  });

  it("counts a Custom Cycle from the assignment's first day and wraps", () => {
    const assigned = book([
      span({ effectiveFrom: "2026-10-30", rotationTemplateId: "cycle" }),
    ]);
    const names = [
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ].map((date) => resolveShift(assigned, date).name);
    expect(names).toEqual([
      "General",
      "Night",
      "Week Off",
      "General",
      "Night",
      "Week Off",
      "General",
    ]);
  });

  it("restarts a Custom Cycle when it is assigned again", () => {
    const assigned = book([
      span({
        effectiveFrom: "2026-10-01",
        effectiveTo: "2026-10-09",
        rotationTemplateId: "cycle",
      }),
      span({ effectiveFrom: "2026-10-10", rotationTemplateId: "cycle" }),
    ]);
    // Day 9 of the first cycle (index 8 % 3 = 2) is a Week Off …
    expect(resolveShift(assigned, "2026-10-09").name).toBe("Week Off");
    // … and the new one starts at slot 0.
    expect(resolveShift(assigned, "2026-10-10").name).toBe("General");
  });

  it("indexes slots for each type", () => {
    expect(rotationSlotIndex(WEEK, "2026-10-01", "2026-10-05")).toBe(0); // Monday
    expect(rotationSlotIndex(WEEK, "2026-10-01", "2026-10-11")).toBe(6); // Sunday
    expect(rotationSlotIndex(MONTH, "2026-10-01", "2026-12-31")).toBe(30);
    expect(rotationSlotIndex(CYCLE, "2026-10-01", "2026-10-01")).toBe(0);
    expect(rotationSlotIndex(CYCLE, "2026-10-01", "2026-12-31")).toBe(91 % 3);
    // A date before the start still lands on a slot (never negative).
    expect(rotationSlotIndex(CYCLE, "2026-10-05", "2026-10-04")).toBe(2);
  });
});

describe("a template that cannot be read", () => {
  it("falls back to the Settings day", () => {
    const missing = book([
      span({ effectiveFrom: "2026-10-01", shiftTemplateId: "deleted" }),
    ]);
    expect(resolveShift(missing, "2026-10-05").source).toBe("settings");
  });
});

describe("assignmentOn", () => {
  it("includes both ends and nothing outside", () => {
    const closed = span({
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-10-31",
      shiftTemplateId: "general",
    });
    expect(assignmentOn([closed], "2026-10-01")).toBe(closed);
    expect(assignmentOn([closed], "2026-10-31")).toBe(closed);
    expect(assignmentOn([closed], "2026-11-01")).toBeNull();
    expect(assignmentOn([closed], "2026-09-30")).toBeNull();
  });
});

describe("planAssignment (until changed)", () => {
  it("just adds the first one", () => {
    expect(planAssignment([], "2026-10-15")).toEqual({
      close: null,
      replace: null,
    });
  });

  it("closes the open one on the day before the new start", () => {
    const open = span({
      id: "open",
      effectiveFrom: "2026-09-01",
      shiftTemplateId: "general",
    });
    expect(planAssignment([open], "2026-10-15")).toEqual({
      close: { id: "open", closeOn: "2026-10-14" },
      replace: null,
    });
    expect(planAssignment([open], "2026-09-02")).toEqual({
      close: { id: "open", closeOn: "2026-09-01" },
      replace: null,
    });
  });

  it("replaces one starting the same day", () => {
    const earlier = span({
      id: "earlier",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-10-14",
      shiftTemplateId: "general",
    });
    const latest = span({
      id: "latest",
      effectiveFrom: "2026-10-15",
      rotationTemplateId: "week",
    });
    expect(planAssignment([latest, earlier], "2026-10-15")).toEqual({
      close: null,
      replace: "latest",
    });
  });

  it("refuses a start before the latest assignment", () => {
    const latest = span({
      effectiveFrom: "2026-10-15",
      shiftTemplateId: "general",
    });
    try {
      planAssignment([latest], "2026-10-14");
      throw new Error("Expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(
        "SHIFT_ASSIGNMENT_BEFORE_LATEST",
      );
      expect((error as DomainError).details).toMatchObject({
        field: "effectiveFrom",
      });
    }
  });
});
