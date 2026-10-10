import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertSlotShiftsUsable,
  createRotationTemplate,
  createShiftTemplate,
  crossesMidnight,
  shiftLengthMinutes,
  shiftWindow,
  slotShiftIds,
  templateInUse,
} from "./shift";

const DAY = {
  name: " General ",
  startTime: "09:30",
  endTime: "18:30",
  workingDays: [5, 1, 2, 3, 4],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 10,
  overtimeAllowed: true,
  isActive: true,
};

function codeOf(run: () => unknown): { code: string; field: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("createShiftTemplate", () => {
  it("normalises name and working days", () => {
    expect(createShiftTemplate(DAY)).toEqual({
      ...DAY,
      name: "General",
      workingDays: [1, 2, 3, 4, 5],
    });
  });

  it("allows a shift crossing midnight, measured to the next day", () => {
    const night = createShiftTemplate({
      ...DAY,
      name: "Night",
      startTime: "22:00",
      endTime: "06:00",
      workingHours: 8,
    });
    expect(crossesMidnight(night.startTime, night.endTime)).toBe(true);
    expect(shiftLengthMinutes("22:00", "06:00")).toBe(480);
    expect(shiftWindow("2026-10-31", "22:00", "06:00")).toEqual({
      start: { date: "2026-10-31", time: "22:00" },
      end: { date: "2026-11-01", time: "06:00" },
    });
    expect(shiftWindow("2026-10-31", "09:00", "18:00").end.date).toBe(
      "2026-10-31",
    );
    // Start equal to end is a 24-hour shift.
    expect(shiftLengthMinutes("08:00", "08:00")).toBe(1440);
    expect(crossesMidnight("09:00", "18:00")).toBe(false);
  });

  it("keeps working hours inside the shift", () => {
    expect(
      codeOf(() =>
        createShiftTemplate({ ...DAY, startTime: "22:00", endTime: "05:00" }),
      ),
    ).toEqual({ code: "SHIFT_WORKING_HOURS_TOO_LONG", field: "workingHours" });
    expect(
      createShiftTemplate({
        ...DAY,
        startTime: "22:00",
        endTime: "06:00",
        workingHours: 8,
      }).workingHours,
    ).toBe(8);
  });

  it("needs half-day hours below the working hours", () => {
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, halfDayHours: 8 })),
    ).toEqual({ code: "SHIFT_HALF_DAY_HOURS_INVALID", field: "halfDayHours" });
    expect(
      createShiftTemplate({ ...DAY, halfDayHours: 7.99 }).halfDayHours,
    ).toBe(7.99);
  });

  it("refuses bad times, days, hours and grace", () => {
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, startTime: "9:30" })),
    ).toEqual({ code: "SHIFT_START_INVALID", field: "startTime" });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, endTime: "24:00" })),
    ).toEqual({ code: "SHIFT_END_INVALID", field: "endTime" });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, workingDays: [] })),
    ).toEqual({
      code: "SHIFT_WORKING_DAYS_INVALID",
      field: "workingDays",
    });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, workingDays: [1, 1, 2] })),
    ).toEqual({ code: "SHIFT_WORKING_DAYS_INVALID", field: "workingDays" });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, workingHours: 0 })),
    ).toEqual({ code: "SHIFT_WORKING_HOURS_INVALID", field: "workingHours" });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, workingHours: 8.125 })),
    ).toEqual({ code: "SHIFT_WORKING_HOURS_INVALID", field: "workingHours" });
    expect(
      codeOf(() => createShiftTemplate({ ...DAY, graceMinutes: 121 })),
    ).toEqual({ code: "SHIFT_GRACE_MINUTES_INVALID", field: "graceMinutes" });
    expect(codeOf(() => createShiftTemplate({ ...DAY, name: " " }))).toEqual({
      code: "SHIFT_NAME_REQUIRED",
      field: "name",
    });
  });
});

describe("createRotationTemplate", () => {
  const A = "shift-a";
  const B = "shift-b";

  it("has 7 slots for a week, Monday first; null is a Week Off", () => {
    const rotation = createRotationTemplate({
      name: "Six-day crew",
      type: "week",
      slots: [A, A, A, B, B, B, null],
      isActive: true,
    });
    expect(rotation.daysPerCycle).toBe(7);
    expect(rotation.slots[6]).toEqual({ kind: "week_off" });
    expect(rotation.slots[0]).toEqual({ kind: "shift", shiftTemplateId: A });
    expect(slotShiftIds(rotation.slots)).toEqual([A, B]);
  });

  it("has 31 slots for a month, whatever daysPerCycle says", () => {
    const rotation = createRotationTemplate({
      name: "Monthly",
      type: "month",
      daysPerCycle: 5,
      slots: Array.from({ length: 31 }, (_, index) => (index < 15 ? A : B)),
      isActive: true,
    });
    expect(rotation.daysPerCycle).toBe(31);
    expect(
      codeOf(() =>
        createRotationTemplate({
          name: "Monthly",
          type: "month",
          slots: [A, B],
          isActive: true,
        }),
      ),
    ).toEqual({ code: "ROTATION_SLOTS_INVALID", field: "slots" });
  });

  it("keeps a custom cycle to 2–12 days, one slot each", () => {
    for (const days of [2, 12])
      expect(
        createRotationTemplate({
          name: "Crew",
          type: "custom_cycle",
          daysPerCycle: days,
          slots: Array.from({ length: days }, () => A),
          isActive: true,
        }).daysPerCycle,
      ).toBe(days);
    for (const daysPerCycle of [1, 13, null, 2.5])
      expect(
        codeOf(() =>
          createRotationTemplate({
            name: "Crew",
            type: "custom_cycle",
            daysPerCycle,
            slots: [A, B],
            isActive: true,
          }),
        ),
      ).toEqual({ code: "ROTATION_CYCLE_INVALID", field: "daysPerCycle" });
    expect(
      codeOf(() =>
        createRotationTemplate({
          name: "Crew",
          type: "custom_cycle",
          daysPerCycle: 3,
          slots: [A, B],
          isActive: true,
        }),
      ),
    ).toEqual({ code: "ROTATION_SLOTS_INVALID", field: "slots" });
  });

  it("needs at least one shift in the cycle", () => {
    expect(
      codeOf(() =>
        createRotationTemplate({
          name: "Idle",
          type: "custom_cycle",
          daysPerCycle: 2,
          slots: [null, ""],
          isActive: true,
        }),
      ),
    ).toEqual({ code: "ROTATION_ALL_WEEK_OFF", field: "slots" });
  });

  it("needs each slot's shift to exist and be active, unless already used", () => {
    const rotation = createRotationTemplate({
      name: "Crew",
      type: "custom_cycle",
      daysPerCycle: 2,
      slots: [A, B],
      isActive: true,
    });
    const shifts = new Map([
      [A, { isActive: true }],
      [B, { isActive: false }],
    ]);
    expect(
      codeOf(() => {
        assertSlotShiftsUsable(rotation.slots, shifts);
      }),
    ).toEqual({ code: "ROTATION_SHIFT_INACTIVE", field: "slots" });
    expect(() => {
      assertSlotShiftsUsable(rotation.slots, shifts, new Set([B]));
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertSlotShiftsUsable(rotation.slots, new Map());
      }),
    ).toEqual({ code: "ROTATION_SHIFT_NOT_FOUND", field: "slots" });
  });
});

describe("delete in use", () => {
  it("is a 409 asking to deactivate instead", () => {
    const shift = templateInUse("shift");
    expect(shift.kind).toBe("conflict");
    expect(shift.code).toBe("SHIFT_TEMPLATE_IN_USE");
    expect(templateInUse("rotation").code).toBe("ROTATION_TEMPLATE_IN_USE");
  });
});
