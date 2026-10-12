import { describe, expect, it } from "vitest";

import type { ExpectedAbsenceClassView } from "@/src/training-institute/application/absence-notice-views";

import {
  classCountLabel,
  classDayLabel,
  classSlotLabel,
  dayHeading,
  expectedAbsenceDays,
  giverLabel,
  reasonLabel,
  timeRangeLabel,
  timestampLabel,
} from "./absence-notice-labels";

function cls(
  date: string,
  startTime: string,
  batchName = "Tally Evening",
): ExpectedAbsenceClassView {
  return {
    batchId: `batch-${batchName}`,
    batchName,
    courseName: "Tally",
    timezone: "Asia/Kolkata",
    date,
    startTime,
    endTime: "18:00",
    rescheduled: false,
    absentees: [],
  };
}

describe("Absence Notice labels", () => {
  it("formats Class dates and times in the Batch's local terms", () => {
    expect(classDayLabel("2026-10-16")).toBe("Fri 16 Oct");
    expect(timeRangeLabel("17:00", "18:00")).toBe("5:00–6:00 pm");
    expect(timeRangeLabel("11:30", "12:30")).toBe("11:30 am–12:30 pm");
    expect(timeRangeLabel("00:15", "09:05")).toBe("12:15–9:05 am");
    expect(
      classSlotLabel({
        date: "2026-10-15",
        startTime: "17:00",
        endTime: "18:00",
      }),
    ).toBe("Thu 15 Oct, 5:00–6:00 pm");
  });

  it("names the reason, the giver, and the count", () => {
    expect(reasonLabel("family")).toBe("Family function");
    expect(giverLabel({ role: "parent", name: "Ramesh Rao" })).toBe(
      "Parent (Ramesh Rao)",
    );
    expect(giverLabel({ role: "student", name: " " })).toBe("Student");
    expect(classCountLabel(1)).toBe("1 Class");
    expect(classCountLabel(3)).toBe("3 Classes");
  });

  it("shows a timestamp in the Batch timezone", () => {
    expect(timestampLabel("2026-10-12T10:15:00.000Z", "Asia/Kolkata")).toBe(
      "12 Oct, 3:45 pm",
    );
  });

  it("calls today and tomorrow by name", () => {
    expect(dayHeading("2026-10-12", "2026-10-12")).toBe("Today");
    expect(dayHeading("2026-10-13", "2026-10-12")).toBe("Tomorrow");
    expect(dayHeading("2026-10-15", "2026-10-12")).toBe("Thursday 15 Oct");
  });

  it("groups Classes by date, with today in the Batch timezone", () => {
    // 2026-10-12 20:00 UTC is already 13 Oct in Kolkata.
    const now = new Date("2026-10-12T20:00:00.000Z");
    const days = expectedAbsenceDays(
      [
        cls("2026-10-13", "09:00"),
        cls("2026-10-13", "17:00", "DCA Morning"),
        cls("2026-10-14", "17:00"),
        cls("2026-10-20", "17:00"),
      ],
      now,
    );
    expect(
      days.map((day) => [day.heading, day.subheading, day.classes.length]),
    ).toEqual([
      ["Today", "Tue 13 Oct", 2],
      ["Tomorrow", "Wed 14 Oct", 1],
      ["Tuesday 20 Oct", null, 1],
    ]);
    expect(expectedAbsenceDays([], now)).toEqual([]);
  });
});
