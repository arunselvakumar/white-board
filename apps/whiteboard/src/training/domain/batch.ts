import type { BatchId } from "./batch-id";
import type { BatchName } from "./batch-name";
import type { Capacity } from "./capacity";
import type { ClassMode } from "./class-mode";
import type { CourseId } from "./course-id";
import { DomainError } from "./errors";
import type { DomainEvent } from "./events";
import { OptionalText } from "./optional-text";
import type { UserId } from "./user-id";
import type { WeeklyTimings } from "./weekly-timings";
import type { WorkspaceId } from "./workspace-id";

export type MeetingOption = "external" | "whiteboard";

function meetingOption(value: string | undefined): MeetingOption {
  if (value == null || value === "external") return "external";
  if (value === "whiteboard") return "whiteboard";
  throw new DomainError(
    "INVALID_MEETING_OPTION",
    "Choose an external link or a Whiteboard class.",
  );
}

export function batchRoom(raw: string | null | undefined): OptionalText | null {
  return OptionalText.create(
    raw,
    80,
    "ROOM_TOO_LONG",
    "Room must be at most 80 characters.",
  );
}

export function batchJoinUrl(
  raw: string | null | undefined,
): OptionalText | null {
  return OptionalText.create(
    raw,
    2048,
    "JOIN_URL_TOO_LONG",
    "Join URL must be at most 2048 characters.",
  );
}

export type BatchProps = {
  id: BatchId;
  workspaceId: WorkspaceId;
  courseId: CourseId;
  createdByUserId: UserId;
  name: BatchName;
  classMode: ClassMode;
  capacity: Capacity;
  room: OptionalText | null;
  joinUrl: OptionalText | null;
  meetingOption?: MeetingOption;
  timings: WeeklyTimings;
  timezone: string;
  closedAt: Date | null;
  closedByUserId: UserId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

export class Batch {
  private events: DomainEvent[] = [];

  private constructor(private props: BatchProps) {}

  static create(input: {
    id: BatchId;
    workspaceId: WorkspaceId;
    courseId: CourseId;
    createdByUserId: UserId;
    name: BatchName;
    classMode: ClassMode;
    capacity: Capacity;
    room: OptionalText | null;
    joinUrl: OptionalText | null;
    meetingOption?: string;
    timings: WeeklyTimings;
    timezone?: string;
    now: Date;
  }): Batch {
    const batch = new Batch({
      id: input.id,
      workspaceId: input.workspaceId,
      courseId: input.courseId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      classMode: input.classMode,
      capacity: input.capacity,
      room: input.room,
      joinUrl: input.joinUrl,
      meetingOption: meetingOption(input.meetingOption),
      timings: input.timings,
      timezone: input.timezone ?? "Asia/Kolkata",
      closedAt: null,
      closedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    batch.events.push({
      type: "BatchCreated",
      batchId: input.id.value,
      courseId: input.courseId.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return batch;
  }

  static reconstitute(props: BatchProps): Batch {
    return new Batch(props);
  }

  get id(): BatchId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get courseId(): CourseId {
    return this.props.courseId;
  }

  get createdByUserId(): UserId {
    return this.props.createdByUserId;
  }

  get name(): BatchName {
    return this.props.name;
  }

  get classMode(): ClassMode {
    return this.props.classMode;
  }

  get capacity(): Capacity {
    return this.props.capacity;
  }

  get room(): OptionalText | null {
    return this.props.room;
  }

  get joinUrl(): OptionalText | null {
    return this.props.joinUrl;
  }

  get meetingOption(): MeetingOption {
    return this.props.meetingOption ?? "external";
  }

  get timings(): WeeklyTimings {
    return this.props.timings;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get closedByUserId(): UserId | null {
    return this.props.closedByUserId;
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

  updateSchedule(input: {
    name: BatchName;
    classMode: ClassMode;
    capacity: Capacity;
    room: OptionalText | null;
    joinUrl: OptionalText | null;
    meetingOption?: string;
    timings: WeeklyTimings;
    now: Date;
  }): void {
    this.props = {
      ...this.props,
      name: input.name,
      classMode: input.classMode,
      capacity: input.capacity,
      room: input.room,
      joinUrl: input.joinUrl,
      meetingOption: meetingOption(
        input.meetingOption ?? this.props.meetingOption,
      ),
      timings: input.timings,
      updatedAt: input.now,
    };
    this.events.push({
      type: "BatchScheduleUpdated",
      batchId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: input.now,
    });
  }

  close(closedByUserId: UserId, now: Date): void {
    if (this.props.closedAt != null) {
      throw new DomainError("BATCH_ALREADY_CLOSED", "Batch is already closed.");
    }
    this.props = {
      ...this.props,
      closedAt: now,
      closedByUserId,
      updatedAt: now,
    };
    this.events.push({
      type: "BatchClosed",
      batchId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      closedByUserId: closedByUserId.value,
      occurredAt: now,
    });
  }

  assertOpenForEnrollment(): void {
    if (this.props.closedAt != null) {
      throw new DomainError(
        "BATCH_CLOSED",
        "Closed Batch cannot accept new Enrollments.",
      );
    }
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
