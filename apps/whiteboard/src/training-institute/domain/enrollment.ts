import type { Batch } from "./batch";
import type { BatchId } from "./batch-id";
import type { ClassMode } from "./class-mode";
import type { CourseId } from "./course-id";
import { DomainError } from "./errors";
import type { DomainEvent } from "./events";
import type { EnrollmentId } from "./enrollment-id";
import type { FeePlan } from "./fee-plan";
import type { StudentId } from "./student-id";
import type { TimingSource } from "./timing-source";
import type { UserId } from "./user-id";
import type { WeeklyTimings } from "./weekly-timings";
import type { WorkspaceId } from "./workspace-id";

export type EnrollmentProps = {
  id: EnrollmentId;
  workspaceId: WorkspaceId;
  studentId: StudentId;
  courseId: CourseId;
  batchId: BatchId;
  createdByUserId: UserId;
  classModeOverride: ClassMode | null;
  timingSource: TimingSource;
  studentTimings: WeeklyTimings | null;
  endedAt: Date | null;
  endedByUserId: UserId | null;
  feePlan: FeePlan;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

function assertTimings(
  timingSource: TimingSource,
  studentTimings: WeeklyTimings | null,
): void {
  if (timingSource.inheritsBatch) {
    if (studentTimings != null) {
      throw new DomainError(
        "STUDENT_TIMINGS_INVALID",
        "Student-specific Timings are only used when Timing source is student.",
      );
    }
    return;
  }
  if (studentTimings == null) {
    throw new DomainError(
      "STUDENT_TIMINGS_REQUIRED",
      "Student-specific Timings are required when Timing source is student.",
    );
  }
}

export class Enrollment {
  private events: DomainEvent[] = [];

  private constructor(private props: EnrollmentProps) {}

  static create(input: {
    id: EnrollmentId;
    workspaceId: WorkspaceId;
    studentId: StudentId;
    courseId: CourseId;
    batchId: BatchId;
    createdByUserId: UserId;
    classModeOverride: ClassMode | null;
    timingSource: TimingSource;
    studentTimings: WeeklyTimings | null;
    feePlan: FeePlan;
    now: Date;
  }): Enrollment {
    assertTimings(input.timingSource, input.studentTimings);
    const enrollment = new Enrollment({
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      courseId: input.courseId,
      batchId: input.batchId,
      createdByUserId: input.createdByUserId,
      classModeOverride: input.classModeOverride,
      timingSource: input.timingSource,
      studentTimings: input.studentTimings,
      endedAt: null,
      endedByUserId: null,
      feePlan: input.feePlan,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    enrollment.events.push({
      type: "StudentEnrolled",
      enrollmentId: input.id.value,
      studentId: input.studentId.value,
      batchId: input.batchId.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return enrollment;
  }

  static reconstitute(props: EnrollmentProps): Enrollment {
    return new Enrollment(props);
  }

  get id(): EnrollmentId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get studentId(): StudentId {
    return this.props.studentId;
  }

  get courseId(): CourseId {
    return this.props.courseId;
  }

  get batchId(): BatchId {
    return this.props.batchId;
  }

  get createdByUserId(): UserId {
    return this.props.createdByUserId;
  }

  get classModeOverride(): ClassMode | null {
    return this.props.classModeOverride;
  }

  get timingSource(): TimingSource {
    return this.props.timingSource;
  }

  get studentTimings(): WeeklyTimings | null {
    return this.props.studentTimings;
  }

  get endedAt(): Date | null {
    return this.props.endedAt;
  }

  get endedByUserId(): UserId | null {
    return this.props.endedByUserId;
  }

  get feePlan(): FeePlan {
    return this.props.feePlan;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get deletedByUserId(): UserId | null {
    return this.props.deletedByUserId;
  }

  get isActive(): boolean {
    return this.props.endedAt == null;
  }

  effectiveClassMode(batch: Batch): ClassMode {
    return this.props.classModeOverride ?? batch.classMode;
  }

  effectiveTimings(batch: Batch): WeeklyTimings {
    if (this.props.timingSource.inheritsBatch) {
      return batch.timings;
    }
    if (this.props.studentTimings == null) {
      throw new DomainError(
        "STUDENT_TIMINGS_REQUIRED",
        "Student-specific Timings are required when Timing source is student.",
      );
    }
    return this.props.studentTimings;
  }

  assertActive(): void {
    if (this.props.endedAt != null) {
      throw new DomainError(
        "ENROLLMENT_ALREADY_ENDED",
        "Enrollment has already ended.",
      );
    }
  }

  overrideClassMode(classModeOverride: ClassMode | null, now: Date): void {
    this.assertActive();
    this.props = {
      ...this.props,
      classModeOverride,
      updatedAt: now,
    };
    this.events.push({
      type: "EnrollmentModeOverridden",
      enrollmentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  setTimings(
    timingSource: TimingSource,
    studentTimings: WeeklyTimings | null,
    now: Date,
  ): void {
    this.assertActive();
    assertTimings(timingSource, studentTimings);
    this.props = {
      ...this.props,
      timingSource,
      studentTimings: timingSource.inheritsBatch ? null : studentTimings,
      updatedAt: now,
    };
    this.events.push({
      type: "EnrollmentTimingsSet",
      enrollmentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  moveTo(batch: Batch, now: Date): void {
    this.assertActive();
    if (!batch.courseId.equals(this.props.courseId)) {
      throw new DomainError(
        "ENROLLMENT_MOVE_COURSE_MISMATCH",
        "Move must stay on the same Course.",
      );
    }
    batch.assertOpenForEnrollment();
    this.props = {
      ...this.props,
      batchId: batch.id,
      updatedAt: now,
    };
    this.events.push({
      type: "EnrollmentMoved",
      enrollmentId: this.props.id.value,
      batchId: batch.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  end(endedByUserId: UserId, now: Date): void {
    this.assertActive();
    this.props = {
      ...this.props,
      endedAt: now,
      endedByUserId,
      updatedAt: now,
    };
    this.events.push({
      type: "EnrollmentEnded",
      enrollmentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      endedByUserId: endedByUserId.value,
      occurredAt: now,
    });
  }

  adjustFeePlan(feePlan: FeePlan, now: Date): void {
    this.assertActive();
    this.props = {
      ...this.props,
      feePlan,
      updatedAt: now,
    };
    this.events.push({
      type: "FeePlanAdjusted",
      enrollmentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
