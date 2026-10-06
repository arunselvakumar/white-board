import { describe, expect, it } from "vitest";

import { Batch, batchRoom } from "./batch";
import { BatchId } from "./batch-id";
import { BatchName } from "./batch-name";
import { Capacity } from "./capacity";
import { ClassMode } from "./class-mode";
import { Course } from "./course";
import { CourseDuration } from "./course-duration";
import { CourseDetails } from "./course-details";
import { CourseId } from "./course-id";
import { CourseName } from "./course-name";
import { DomainError } from "./errors";
import { Paise } from "./paise";
import { UserId } from "./user-id";
import { WeeklyTimings } from "./weekly-timings";
import { WorkspaceId } from "./workspace-id";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";

const weekdayMorning = WeeklyTimings.create([
  { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
]);

function createCourse() {
  return Course.create({
    id: CourseId.create(COURSE_ID),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    name: CourseName.create("DCA"),
    duration: CourseDuration.create({
      kind: "fixed",
      value: 3,
      unit: "months",
    }),
    details: CourseDetails.create({}),
    description: null,
    defaultFeeAmount: Paise.create(500000),
    now: NOW,
  });
}

function createBatch() {
  return Batch.create({
    id: BatchId.create(BATCH_ID),
    workspaceId: WorkspaceId.create("org_1"),
    courseId: CourseId.create(COURSE_ID),
    createdByUserId: UserId.create("user_1"),
    name: BatchName.create("DCA Weekday 9–11 Offline"),
    classMode: ClassMode.create("offline"),
    capacity: Capacity.create(20),
    room: batchRoom("Lab 1"),
    joinUrl: null,
    timings: weekdayMorning,
    now: NOW,
  });
}

describe("Batch", () => {
  it("creates a Batch with weekday Timings and Class Mode", () => {
    const batch = createBatch();
    expect(batch.name.value).toBe("DCA Weekday 9–11 Offline");
    expect(batch.classMode.value).toBe("offline");
    expect(batch.capacity.value).toBe(20);
    expect(batch.timings.slots[0]?.startTime).toBe("09:00");
    expect(batch.timezone).toBe("Asia/Kolkata");
    expect(batch.closedAt).toBeNull();
  });

  it("closes once", () => {
    const batch = createBatch();
    batch.close(UserId.create("user_2"), NOW);
    expect(batch.closedAt).toEqual(NOW);
    expect(() => {
      batch.close(UserId.create("user_2"), NOW);
    }).toThrow(DomainError);
  });

  it("stores the Whiteboard meeting choice for an Online Batch", () => {
    const batch = createBatch();
    batch.updateSchedule({
      name: batch.name,
      classMode: ClassMode.create("online"),
      meetingOption: "whiteboard",
      capacity: batch.capacity,
      room: null,
      joinUrl: null,
      timings: batch.timings,
      now: NOW,
    });
    expect(batch.meetingOption).toBe("whiteboard");
  });

  it("refuses new Enrollments when closed", () => {
    const batch = createBatch();
    batch.assertOpenForEnrollment();
    batch.close(UserId.create("user_1"), NOW);
    expect(() => {
      batch.assertOpenForEnrollment();
    }).toThrow(DomainError);
  });

  it("cannot be created for an archived Course", () => {
    const course = createCourse();
    course.archive(UserId.create("user_1"), NOW);
    expect(() => {
      course.assertAcceptsNewBatches();
    }).toThrow(DomainError);
  });

  it("rejects invalid Timings", () => {
    expect(() => WeeklyTimings.create([])).toThrow(DomainError);
    expect(() =>
      WeeklyTimings.create([
        { daysOfWeek: [1], startTime: "11:00", endTime: "09:00" },
      ]),
    ).toThrow(DomainError);
  });
});
