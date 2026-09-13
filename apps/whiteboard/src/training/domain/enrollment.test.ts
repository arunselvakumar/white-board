import { describe, expect, it } from "vitest";

import { Batch, batchRoom } from "./batch";
import { BatchId } from "./batch-id";
import { BatchName } from "./batch-name";
import { Capacity } from "./capacity";
import { ClassMode } from "./class-mode";
import { Course } from "./course";
import { CourseDuration } from "./course-duration";
import { CourseId } from "./course-id";
import { CourseName } from "./course-name";
import { DomainError } from "./errors";
import { Enrollment } from "./enrollment";
import { EnrollmentId } from "./enrollment-id";
import { FeePlan } from "./fee-plan";
import { Paise } from "./paise";
import { Student, StudentProfile } from "./student";
import { StudentId } from "./student-id";
import { TimingSource } from "./timing-source";
import { UserId } from "./user-id";
import { WeeklyTimings } from "./weekly-timings";
import { WorkspaceId } from "./workspace-id";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";
const OTHER_BATCH_ID = "770e8400-e29b-41d4-a716-446655440000";
const STUDENT_ID = "880e8400-e29b-41d4-a716-446655440000";
const ENROLLMENT_ID = "990e8400-e29b-41d4-a716-446655440000";

const weekdayMorning = WeeklyTimings.create([
  { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
]);
const sundayEvening = WeeklyTimings.create([
  { daysOfWeek: [0], startTime: "17:00", endTime: "18:00" },
]);

function createCourse() {
  return Course.create({
    id: CourseId.create(COURSE_ID),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    name: CourseName.create("DCA"),
    duration: CourseDuration.create("3 months"),
    description: null,
    defaultFeeAmount: Paise.create(500000),
    now: NOW,
  });
}

function createBatch(id = BATCH_ID, capacity = 1) {
  return Batch.create({
    id: BatchId.create(id),
    workspaceId: WorkspaceId.create("org_1"),
    courseId: CourseId.create(COURSE_ID),
    createdByUserId: UserId.create("user_1"),
    name: BatchName.create("DCA Weekday 9–11 Offline"),
    classMode: ClassMode.create("offline"),
    capacity: Capacity.create(capacity),
    room: batchRoom("Lab 1"),
    joinUrl: null,
    timings: weekdayMorning,
    now: NOW,
  });
}

function createStudent() {
  return Student.create({
    id: StudentId.create(STUDENT_ID),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    profile: StudentProfile.fromRaw({
      name: "Anita Sharma",
      phone: "9876543210",
    }),
    now: NOW,
  });
}

function enroll(overrides: Partial<{
  timingSource: TimingSource;
  studentTimings: WeeklyTimings | null;
  classModeOverride: ClassMode | null;
  batchId: string;
}> = {}) {
  return Enrollment.create({
    id: EnrollmentId.create(ENROLLMENT_ID),
    workspaceId: WorkspaceId.create("org_1"),
    studentId: StudentId.create(STUDENT_ID),
    courseId: CourseId.create(COURSE_ID),
    batchId: BatchId.create(overrides.batchId ?? BATCH_ID),
    createdByUserId: UserId.create("user_1"),
    classModeOverride: overrides.classModeOverride ?? null,
    timingSource: overrides.timingSource ?? TimingSource.create("batch"),
    studentTimings: overrides.studentTimings ?? null,
    feePlan: FeePlan.fromCourseDefault(Paise.create(500000), NOW),
    now: NOW,
  });
}

describe("Enrollment", () => {
  it("inherits Batch Class Mode and Timings", () => {
    const batch = createBatch();
    const enrollment = enroll();
    expect(enrollment.effectiveClassMode(batch).value).toBe("offline");
    expect(enrollment.effectiveTimings(batch).slots[0]?.startTime).toBe("09:00");
    expect(enrollment.timingSource.value).toBe("batch");
    expect(enrollment.feePlan.amount.value).toBe(500000);
  });

  it("overrides Class Mode for this Student", () => {
    const batch = createBatch();
    const enrollment = enroll();
    enrollment.overrideClassMode(ClassMode.create("online"), NOW);
    expect(enrollment.effectiveClassMode(batch).value).toBe("online");
  });

  it("sets Student-specific Timings", () => {
    const batch = createBatch();
    const enrollment = enroll();
    enrollment.setTimings(TimingSource.create("student"), sundayEvening, NOW);
    expect(enrollment.timingSource.value).toBe("student");
    expect(enrollment.effectiveTimings(batch).slots[0]?.startTime).toBe("17:00");
  });

  it("requires Student-specific Timings when source is student", () => {
    expect(() =>
      enroll({ timingSource: TimingSource.create("student") }),
    ).toThrow(DomainError);
  });

  it("moves to another Batch of the same Course", () => {
    const destination = createBatch(OTHER_BATCH_ID, 20);
    const enrollment = enroll();
    enrollment.moveTo(destination, NOW);
    expect(enrollment.batchId.value).toBe(OTHER_BATCH_ID);
  });

  it("refuses a move onto a closed Batch", () => {
    const destination = createBatch(OTHER_BATCH_ID, 20);
    destination.close(UserId.create("user_1"), NOW);
    const enrollment = enroll();
    expect(() => {
      enrollment.moveTo(destination, NOW);
    }).toThrow(DomainError);
  });

  it("ends once", () => {
    const enrollment = enroll();
    enrollment.end(UserId.create("user_2"), NOW);
    expect(enrollment.endedAt).toEqual(NOW);
    expect(() => {
      enrollment.end(UserId.create("user_2"), NOW);
    }).toThrow(DomainError);
  });

  it("refuses new Enrollments on a closed Batch or archived Course", () => {
    const batch = createBatch();
    batch.close(UserId.create("user_1"), NOW);
    expect(() => {
      batch.assertOpenForEnrollment();
    }).toThrow(DomainError);

    const course = createCourse();
    course.archive(UserId.create("user_1"), NOW);
    expect(() => {
      course.assertAcceptsNewEnrollments();
    }).toThrow(DomainError);
  });

  it("refuses a dropped Student", () => {
    const student = createStudent();
    student.drop(UserId.create("user_1"), NOW);
    expect(() => {
      student.assertCanEnroll();
    }).toThrow(DomainError);
  });
});
