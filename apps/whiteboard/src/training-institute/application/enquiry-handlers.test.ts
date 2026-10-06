import { describe, expect, it } from "vitest";

import type { ClassChangeFact } from "../domain/class-schedule";
import { demoClassAt } from "./enquiry-handlers";
import { enquiryMonth, phoneMatchKey } from "./enquiry-queries";

// Mondays and Wednesdays, 09:00–11:00. 2026-11-02 is a Monday.
const source = {
  batchId: "batch-1",
  timings: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "11:00" }],
  firstDate: "2026-10-01",
};
const key = { date: "2026-11-02", startTime: "09:00" };

describe("demoClassAt", () => {
  it("finds the scheduled Class at that date and start time", () => {
    expect(demoClassAt(source, key, [], [])).toMatchObject({
      endTime: "11:00",
      status: "scheduled",
    });
    expect(
      demoClassAt(source, { ...key, startTime: "10:00" }, [], []),
    ).toBeNull();
    expect(
      demoClassAt(source, { ...key, date: "2026-11-03" }, [], []),
    ).toBeNull();
  });

  it("refuses Cancelled, Moved-away, and Holiday Classes", () => {
    const cancelled: ClassChangeFact = {
      id: "c-1",
      batchId: "batch-1",
      date: "2026-11-02",
      startTime: "09:00",
      endTime: "11:00",
      kind: "cancelled",
      reason: null,
      movedTo: null,
    };
    expect(demoClassAt(source, key, [cancelled], [])).toBeNull();
    const moved: ClassChangeFact = {
      ...cancelled,
      kind: "moved",
      movedTo: { date: "2026-11-03", startTime: "15:00", endTime: "16:30" },
    };
    expect(demoClassAt(source, key, [moved], [])).toBeNull();
    expect(
      demoClassAt(
        source,
        key,
        [],
        [
          {
            id: "h",
            startDate: "2026-11-02",
            endDate: "2026-11-02",
            reason: null,
          },
        ],
      ),
    ).toBeNull();
  });

  it("accepts a Rescheduled slot with its own end time", () => {
    const moved: ClassChangeFact = {
      id: "c-1",
      batchId: "batch-1",
      date: "2026-11-02",
      startTime: "09:00",
      endTime: "11:00",
      kind: "moved",
      reason: null,
      movedTo: { date: "2026-11-03", startTime: "15:00", endTime: "16:30" },
    };
    expect(
      demoClassAt(
        source,
        { date: "2026-11-03", startTime: "15:00" },
        [moved],
        [],
      ),
    ).toMatchObject({ rescheduled: true, endTime: "16:30" });
  });
});

describe("enquiryMonth", () => {
  it("uses Asia/Kolkata month boundaries", () => {
    expect(enquiryMonth("2026-12")).toEqual({
      month: "2026-12",
      firstDay: "2026-12-01",
      lastDay: "2026-12-31",
      from: new Date("2026-11-30T18:30:00.000Z"),
      to: new Date("2026-12-31T18:30:00.000Z"),
    });
    expect(enquiryMonth("2028-02").lastDay).toBe("2028-02-29");
  });

  it("rejects anything but YYYY-MM", () => {
    for (const bad of ["2026-13", "2026-1", "26-10", "2026-10-01"])
      expect(() => enquiryMonth(bad)).toThrow(
        expect.objectContaining({ code: "ENQUIRY_SUMMARY_MONTH_INVALID" }),
      );
  });
});

describe("phoneMatchKey", () => {
  it("keeps the last 10 digits", () => {
    expect(phoneMatchKey("+91 98765-43210")).toBe("9876543210");
    expect(phoneMatchKey("98765 43210")).toBe("9876543210");
    expect(phoneMatchKey("044 2345")).toBe("0442345");
    expect(phoneMatchKey("n/a")).toBe("");
  });
});
