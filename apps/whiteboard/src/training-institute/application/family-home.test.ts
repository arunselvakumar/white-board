import { describe, expect, it } from "vitest";

import type { CalendarItem } from "./calendar-schedule";
import {
  familyRecordings,
  GetFamilyHomeHandler,
  nextClass,
  type FamilyEnrollment,
  type FamilyHomeData,
} from "./family-home";
import type { ClassChangeFact } from "../domain/class-schedule";

// 2026-09-30 is a Wednesday; 03:30Z is 09:00 in Asia/Kolkata.
const NOW = new Date("2026-09-30T03:30:00.000Z");
const BATCH = "660e8400-e29b-41d4-a716-446655440000";
const OTHER_BATCH = "770e8400-e29b-41d4-a716-446655440000";

const item: CalendarItem = {
  id: "880e8400-e29b-41d4-a716-446655440000",
  batchId: BATCH,
  batchName: "Morning",
  courseId: "550e8400-e29b-41d4-a716-446655440000",
  courseName: "DCA",
  studentName: "Asha",
  classMode: "online",
  room: null,
  joinUrl: null,
  meetingOption: "whiteboard",
  timezone: "Asia/Kolkata",
  timings: [{ daysOfWeek: [3, 5], startTime: "10:00", endTime: "11:00" }],
  activeFrom: "2026-09-01T00:00:00.000Z",
};

function cancelled(date: string, startTime: string): ClassChangeFact {
  return {
    id: `change-${date}`,
    batchId: BATCH,
    date,
    startTime,
    endTime: "11:00",
    kind: "cancelled",
    reason: null,
    movedTo: null,
  };
}

describe("nextClass", () => {
  it("finds the next Class later today", () => {
    expect(nextClass([item], [], [], NOW)).toMatchObject({
      date: "2026-09-30",
      startTime: "10:00",
      inProgress: false,
      rescheduled: false,
    });
  });

  it("counts a Class in progress until it ends", () => {
    const at = new Date("2026-09-30T04:45:00.000Z"); // 10:15 IST
    expect(nextClass([item], [], [], at)).toMatchObject({
      date: "2026-09-30",
      inProgress: true,
    });
    const after = new Date("2026-09-30T05:30:00.000Z"); // 11:00 IST
    expect(nextClass([item], [], [], after)).toMatchObject({
      date: "2026-10-02",
      inProgress: false,
    });
  });

  it("skips Cancelled and Holiday Classes and follows a Moved Class", () => {
    expect(
      nextClass(
        [item],
        [cancelled("2026-09-30", "10:00")],
        [
          {
            id: "h",
            startDate: "2026-10-02",
            endDate: "2026-10-02",
            reason: null,
          },
        ],
        NOW,
      ),
    ).toMatchObject({ date: "2026-10-07" });
    expect(
      nextClass(
        [item],
        [
          {
            ...cancelled("2026-09-30", "10:00"),
            kind: "moved",
            movedTo: {
              date: "2026-10-01",
              startTime: "16:00",
              endTime: "17:00",
            },
          },
        ],
        [],
        NOW,
      ),
    ).toMatchObject({
      date: "2026-10-01",
      startTime: "16:00",
      rescheduled: true,
    });
  });

  it("picks the earliest Class across Enrollments", () => {
    const evening: CalendarItem = {
      ...item,
      id: "990e8400-e29b-41d4-a716-446655440000",
      batchId: OTHER_BATCH,
      batchName: "Evening",
      classMode: "offline",
      room: "Lab 2",
      timings: [{ daysOfWeek: [3], startTime: "09:30", endTime: "10:30" }],
    };
    expect(nextClass([item, evening], [], [], NOW)).toMatchObject({
      batchName: "Evening",
      classMode: "offline",
      room: "Lab 2",
      startTime: "09:30",
    });
  });

  it("returns null with no Classes ahead", () => {
    expect(nextClass([], [], [], NOW)).toBeNull();
    expect(nextClass([{ ...item, timings: [] }], [], [], NOW)).toBeNull();
  });
});

describe("familyRecordings", () => {
  it("keeps the Student's own Classes since the Enrollment began, newest first", () => {
    const recordings = [
      {
        batchId: BATCH,
        date: "2026-09-23",
        startTime: "10:00",
        endTime: "11:00",
      },
      {
        batchId: BATCH,
        date: "2026-09-25",
        startTime: "10:00",
        endTime: "11:00",
      },
      // Not one of the Student's Timings (home tuition in a shared Batch).
      {
        batchId: BATCH,
        date: "2026-09-24",
        startTime: "10:00",
        endTime: "11:00",
      },
      // Before the Enrollment began.
      {
        batchId: BATCH,
        date: "2026-08-28",
        startTime: "10:00",
        endTime: "11:00",
      },
      // Another Batch.
      {
        batchId: OTHER_BATCH,
        date: "2026-09-25",
        startTime: "10:00",
        endTime: "11:00",
      },
    ];
    expect(familyRecordings([item], recordings, [], [])).toEqual([
      {
        batchId: BATCH,
        batchName: "Morning",
        courseName: "DCA",
        date: "2026-09-25",
        startTime: "10:00",
        endTime: "11:00",
      },
      {
        batchId: BATCH,
        batchName: "Morning",
        courseName: "DCA",
        date: "2026-09-23",
        startTime: "10:00",
        endTime: "11:00",
      },
    ]);
  });

  it("shows at most five", () => {
    // Every Wednesday and Friday Class in September.
    const dates = ["02", "04", "09", "11", "16", "18", "23", "25", "30"];
    const result = familyRecordings(
      [item],
      dates.map((day) => ({
        batchId: BATCH,
        date: `2026-09-${day}`,
        startTime: "10:00",
        endTime: "11:00",
      })),
      [],
      [],
    );
    expect(result.map((recording) => recording.date)).toEqual([
      "2026-09-30",
      "2026-09-25",
      "2026-09-23",
      "2026-09-18",
      "2026-09-16",
    ]);
  });
});

describe("GetFamilyHomeHandler", () => {
  const enrollment: FamilyEnrollment = {
    ...item,
    studentId: "s1",
    feePlanAmountPaise: 500000,
    feePlanConcessionPaise: 50000,
    paidPaise: 200000,
  };
  const data: FamilyHomeData = {
    students: [
      { id: "s1", name: "Asha" },
      { id: "s2", name: "Ravi" },
    ],
    enrollments: [enrollment],
    changes: [],
    holidays: [],
    attendance: [
      ...Array.from({ length: 6 }, (_, index) => ({
        studentId: "s1",
        date: `2026-09-${String(29 - index).padStart(2, "0")}`,
        batchName: "Morning",
        courseName: "DCA",
        status: "present" as const,
      })),
    ],
    recordings: [],
  };

  it("builds one section per linked Student with empty sections intact", async () => {
    const home = await new GetFamilyHomeHandler({
      load: () => Promise.resolve(data),
    }).execute({
      workspaceId: "org_1",
      role: "parent",
      verifiedEmails: ["parent@example.com"],
      now: NOW,
    });
    expect(home.students).toHaveLength(2);
    const [asha, ravi] = home.students;
    expect(asha).toMatchObject({
      name: "Asha",
      nextClass: { date: "2026-09-30", startTime: "10:00" },
      dues: [
        {
          enrollmentId: item.id,
          feePlanPaise: 450000,
          paidPaise: 200000,
          remainingDuesPaise: 250000,
        },
      ],
      recordings: [],
    });
    expect(asha?.recentAttendance).toHaveLength(5);
    expect(asha?.recentAttendance[0]).toEqual({
      date: "2026-09-29",
      batchName: "Morning",
      courseName: "DCA",
      status: "present",
    });
    expect(ravi).toEqual({
      id: "s2",
      name: "Ravi",
      nextClass: null,
      dues: [],
      recentAttendance: [],
      recordings: [],
    });
  });
});
