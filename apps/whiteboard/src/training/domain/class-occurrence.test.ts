import { describe, expect, it } from "vitest";

import { classSlotForDate } from "./class-occurrence";

const slots = [
  { daysOfWeek: [1, 3], startTime: "09:00", endTime: "10:00" },
];

describe("classSlotForDate", () => {
  it("finds the scheduled Batch Timing on its local weekday", () => {
    expect(classSlotForDate(slots, "2026-09-30", "09:00")).toEqual(slots[0]);
  });

  it("rejects a date or start time outside the Batch Timings", () => {
    expect(classSlotForDate(slots, "2026-10-01", "09:00")).toBeNull();
    expect(classSlotForDate(slots, "2026-09-30", "11:00")).toBeNull();
  });
});
