import { BatchId } from "../domain/batch-id";
import type { BatchRepository } from "../domain/batch-repository";
import { ClassMode } from "../domain/class-mode";
import type { CourseRepository } from "../domain/course-repository";
import { DomainError } from "../domain/errors";
import { Enrollment } from "../domain/enrollment";
import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import { FeePlan } from "../domain/fee-plan";
import { StudentId } from "../domain/student-id";
import type { StudentRepository } from "../domain/student-repository";
import { TimingSource } from "../domain/timing-source";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import type { EnrollStudentCommand } from "./enroll-student.command";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import {
  BatchNotFoundError,
  CourseNotFoundError,
  StudentNotFoundError,
} from "./not-found-error";

export class EnrollStudentHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly students: StudentRepository,
    private readonly batches: BatchRepository,
    private readonly courses: CourseRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: EnrollStudentCommand): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const student = await this.students.findByIdInWorkspace(
      StudentId.create(command.studentId),
      workspaceId,
    );
    if (student == null) {
      throw new StudentNotFoundError();
    }
    student.assertCanEnroll();
    const batch = await this.batches.findByIdInWorkspace(
      BatchId.create(command.batchId),
      workspaceId,
    );
    if (batch == null) {
      throw new BatchNotFoundError();
    }
    batch.assertOpenForEnrollment();
    const course = await this.courses.findByIdInWorkspace(
      batch.courseId,
      workspaceId,
    );
    if (course == null) {
      throw new CourseNotFoundError();
    }
    course.assertAcceptsNewEnrollments();
    const existing = await this.enrollments.findActiveByStudentAndBatch(
      student.id,
      batch.id,
      workspaceId,
    );
    if (existing != null) {
      throw new DomainError(
        "STUDENT_ALREADY_ENROLLED",
        "This Student is already in that Batch.",
      );
    }
    const occupied = await this.enrollments.countActiveInBatch(
      batch.id,
      workspaceId,
    );
    if (occupied >= batch.capacity.value) {
      throw new DomainError("BATCH_AT_CAPACITY", "Batch is at capacity.");
    }
    const timingSource = TimingSource.create(command.timingSource);
    const now = new Date();
    const enrollment = Enrollment.create({
      id: EnrollmentId.create(crypto.randomUUID()),
      workspaceId,
      studentId: student.id,
      courseId: course.id,
      batchId: batch.id,
      createdByUserId: UserId.create(command.createdByUserId),
      classModeOverride:
        command.classModeOverride == null || command.classModeOverride === ""
          ? null
          : ClassMode.create(command.classModeOverride),
      timingSource,
      studentTimings: timingSource.inheritsBatch
        ? null
        : WeeklyTimings.create(command.studentTimings),
      feePlan: FeePlan.fromCourseDefault(course.defaultFeeAmount, now),
      now,
    });
    await this.enrollments.save(enrollment);
    await this.events.dispatch(enrollment.pullDomainEvents());
    return toEnrollmentReadModel(enrollment, 0);
  }
}
