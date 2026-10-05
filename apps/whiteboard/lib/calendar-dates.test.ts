import { describe, expect, it } from "vitest";

import {
  addDays,
  expandCalendarItems,
  monthGrid,
  weekDates,
} from "./calendar-dates";

const schedule = {
  id: "enrollment-1",
  batchId: "batch-1",
  batchName: "Morning",
  courseId: "course-1",
  courseName: "Python",
  studentName: "Asha",
  classMode: "offline" as const,
  room: "Lab 1",
  joinUrl: null,
  timezone: "Asia/Kolkata",
  timings: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "10:30" }],
  activeFrom: "2026-09-28T03:00:00.000Z",
};

describe("Calendar dates", () => {
  it("starts weeks on Sunday and ends on Saturday, including month spillover", () => {
    expect(weekDates("2026-09-30")).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(monthGrid("2026-09-30")).toHaveLength(42);
    expect(monthGrid("2026-09-30")[0]).toBe("2026-08-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("expands effective weekly Timings only from the Enrollment date", () => {
    const dates = ["2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30"];
    expect(
      expandCalendarItems([schedule], dates).map((event) => [
        event.date,
        event.startMinutes,
        event.endMinutes,
      ]),
    ).toEqual([
      ["2026-09-28", 540, 630],
      ["2026-09-30", 540, 630],
    ]);
  });
});
