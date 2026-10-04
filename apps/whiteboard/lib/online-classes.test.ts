import { describe, expect, it } from "vitest";

import { upcomingOnlineClasses } from "./online-classes";

const online = {
  id: "enrollment-1",
  batchId: "batch-1",
  batchName: "Morning",
  courseId: "course-1",
  courseName: "Python",
  studentName: "Asha",
  classMode: "online" as const,
  room: null,
  joinUrl: "https://meet.google.com/example",
  meetingOption: "external" as const,
  timezone: "Asia/Kolkata",
  timings: [{ daysOfWeek: [1], startTime: "09:00", endTime: "10:30" }],
  activeFrom: "2026-09-28T03:00:00.000Z",
};

describe("upcomingOnlineClasses", () => {
  it("lists only online and hybrid occurrences during the next 30 days", () => {
    const hybrid = {
      ...online,
      id: "enrollment-2",
      batchId: "batch-2",
      courseName: "Tally",
      classMode: "hybrid" as const,
      timings: [{ daysOfWeek: [2], startTime: "11:00", endTime: "12:00" }],
    };
    const offline = {
      ...online,
      id: "enrollment-3",
      batchId: "batch-3",
      classMode: "offline" as const,
    };

    expect(
      upcomingOnlineClasses(
        [offline, hybrid, online],
        new Date("2026-10-04T06:00:00.000Z"),
      ).map(({ item, date, startMinutes, endMinutes }) => [
        item.classMode,
        date,
        startMinutes,
        endMinutes,
      ]),
    ).toEqual([
      ["online", "2026-10-05", 540, 630],
      ["hybrid", "2026-10-06", 660, 720],
      ["online", "2026-10-12", 540, 630],
      ["hybrid", "2026-10-13", 660, 720],
      ["online", "2026-10-19", 540, 630],
      ["hybrid", "2026-10-20", 660, 720],
      ["online", "2026-10-26", 540, 630],
      ["hybrid", "2026-10-27", 660, 720],
      ["online", "2026-11-02", 540, 630],
    ]);
  });
});
