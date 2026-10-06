import { describe, expect, it } from "vitest";

import { expandCalendarItems } from "./calendar-dates";
import {
  classChangeSummary,
  classMarker,
  upcomingChanges,
} from "./class-changes";

// 2026-11-02 is a Monday.
const item = {
  id: "item-1",
  batchId: "batch-1",
  batchName: "DCA Weekday 9–11",
  courseName: "DCA",
  studentName: null,
  timezone: "Asia/Kolkata",
  activeFrom: "2026-01-01T00:00:00.000Z",
  timings: [
    { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "11:00" },
  ],
};
const dates = Array.from({ length: 14 }, (_, index) =>
  new Date(Date.UTC(2026, 10, 2 + index)).toISOString().slice(0, 10),
);
const exceptions = {
  classChanges: [
    {
      id: "c1",
      batchId: "batch-1",
      date: "2026-11-03",
      startTime: "09:00",
      endTime: "11:00",
      kind: "cancelled" as const,
      reason: "Pongal",
      movedTo: null,
    },
    {
      id: "c2",
      batchId: "batch-1",
      date: "2026-11-04",
      startTime: "09:00",
      endTime: "11:00",
      kind: "moved" as const,
      reason: null,
      movedTo: { date: "2026-11-07", startTime: "16:00", endTime: "18:00" },
    },
  ],
  holidays: [
    {
      id: "h1",
      startDate: "2026-11-09",
      endDate: "2026-11-10",
      reason: "Diwali",
    },
  ],
};

describe("Calendar Class changes", () => {
  const events = expandCalendarItems([item], dates, exceptions);

  it("marks each changed Class and adds the Rescheduled slot", () => {
    const on = (date: string) => events.filter((event) => event.date === date);
    expect(
      on("2026-11-03").map((event) => classMarker(event.scheduled)),
    ).toEqual(["Cancelled"]);
    expect(
      on("2026-11-04").map((event) => classMarker(event.scheduled)),
    ).toEqual(["Moved"]);
    expect(
      on("2026-11-07").map((event) => classMarker(event.scheduled)),
    ).toEqual([null, "Rescheduled"]);
    expect(
      on("2026-11-09").map((event) => classMarker(event.scheduled)),
    ).toEqual(["Holiday"]);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("explains each change in one line", () => {
    const summaries = events
      .map((event) => classChangeSummary(event.scheduled))
      .filter(Boolean);
    expect(summaries).toEqual([
      "Cancelled · Pongal",
      "Moved to Sat, Nov 7 · 4:00 PM",
      "Rescheduled from Wed, Nov 4 · 9:00 AM",
      "Holiday · Diwali",
      "Holiday · Diwali",
    ]);
  });

  it("lists upcoming changes once each, with Holidays as one entry", () => {
    const changes = upcomingChanges(events, exceptions.holidays, "2026-11-02");
    expect(
      changes.map((change) =>
        change.kind === "holiday"
          ? `${change.date} Holiday`
          : `${change.date} ${change.summary}`,
      ),
    ).toEqual([
      "2026-11-03 Cancelled · Pongal",
      "2026-11-04 Moved to Sat, Nov 7 · 4:00 PM",
      "2026-11-09 Holiday",
    ]);
  });

  it("shows only the Rescheduled slot when the original is already past", () => {
    const changes = upcomingChanges(events, [], "2026-11-05", 3);
    expect(changes).toMatchObject([
      {
        kind: "class",
        date: "2026-11-07",
        summary: "Rescheduled from Wed, Nov 4 · 9:00 AM",
      },
    ]);
  });
});
