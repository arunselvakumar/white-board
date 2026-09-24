import type { CourseDescription } from "./course-description";
import type { CourseDetails } from "./course-details";
import type { CourseDuration } from "./course-duration";
import type { CourseId } from "./course-id";
import type { CourseName } from "./course-name";
import { DomainError } from "./errors";
import type { DomainEvent } from "./events";
import type { Paise } from "./paise";
import type { UserId } from "./user-id";
import type { WorkspaceId } from "./workspace-id";

export type CourseProps = {
  id: CourseId;
  workspaceId: WorkspaceId;
  createdByUserId: UserId;
  name: CourseName;
  duration: CourseDuration;
  description: CourseDescription | null;
  details: CourseDetails;
  defaultFeeAmount: Paise;
  archivedAt: Date | null;
  archivedByUserId: UserId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

export class Course {
  private events: DomainEvent[] = [];

  private constructor(private props: CourseProps) {}

  static create(input: {
    id: CourseId;
    workspaceId: WorkspaceId;
    createdByUserId: UserId;
    name: CourseName;
    duration: CourseDuration;
    description: CourseDescription | null;
    details: CourseDetails;
    defaultFeeAmount: Paise;
    now: Date;
  }): Course {
    const course = new Course({
      id: input.id,
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      duration: input.duration,
      description: input.description,
      details: input.details,
      defaultFeeAmount: input.defaultFeeAmount,
      archivedAt: null,
      archivedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    course.events.push({
      type: "CourseCreated",
      courseId: input.id.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return course;
  }

  static reconstitute(props: CourseProps): Course {
    return new Course(props);
  }

  get id(): CourseId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get createdByUserId(): UserId {
    return this.props.createdByUserId;
  }

  get name(): CourseName {
    return this.props.name;
  }

  get duration(): CourseDuration {
    return this.props.duration;
  }

  get description(): CourseDescription | null {
    return this.props.description;
  }

  get details(): CourseDetails {
    return this.props.details;
  }

  get defaultFeeAmount(): Paise {
    return this.props.defaultFeeAmount;
  }

  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }

  get archivedByUserId(): UserId | null {
    return this.props.archivedByUserId;
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

  update(input: {
    name: CourseName;
    duration: CourseDuration;
    description: CourseDescription | null;
    details: CourseDetails;
    defaultFeeAmount: Paise;
    now: Date;
  }): void {
    this.props = {
      ...this.props,
      name: input.name,
      duration: input.duration,
      description: input.description,
      details: input.details,
      defaultFeeAmount: input.defaultFeeAmount,
      updatedAt: input.now,
    };
    this.events.push({
      type: "CourseUpdated",
      courseId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: input.now,
    });
  }

  archive(archivedByUserId: UserId, now: Date): void {
    if (this.props.archivedAt != null) {
      throw new DomainError(
        "COURSE_ALREADY_ARCHIVED",
        "Course is already archived.",
      );
    }
    this.props = {
      ...this.props,
      archivedAt: now,
      archivedByUserId,
      updatedAt: now,
    };
    this.events.push({
      type: "CourseArchived",
      courseId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      archivedByUserId: archivedByUserId.value,
      occurredAt: now,
    });
  }

  /** P0-011 Batch create must call this. Archived Course cannot accept new Batches. */
  assertAcceptsNewBatches(): void {
    if (this.props.archivedAt != null) {
      throw new DomainError(
        "COURSE_ARCHIVED",
        "Archived Course cannot accept new Batches.",
      );
    }
  }

  assertAcceptsNewEnrollments(): void {
    if (this.props.archivedAt != null) {
      throw new DomainError(
        "COURSE_ARCHIVED",
        "Archived Course cannot accept new Enrollments.",
      );
    }
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
