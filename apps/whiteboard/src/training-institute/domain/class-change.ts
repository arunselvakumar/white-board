import {
  hasStarted,
  isCalendarDate,
  isClock,
  type ClassChangeFact,
  type ClassSlotTime,
  type LocalNow,
} from "./class-schedule";
import { DomainError } from "./errors";
import { OptionalText } from "./optional-text";

export type ClassChangeProps = {
  id: string;
  workspaceId: string;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: "cancelled" | "moved";
  reason: string | null;
  movedTo: ClassSlotTime | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: string | null;
};

type Original = {
  id: string;
  workspaceId: string;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
};

function reasonValue(raw: string | null | undefined): string | null {
  return (
    OptionalText.create(
      raw,
      200,
      "CLASS_CHANGE_REASON_TOO_LONG",
      "Reason must be 200 characters or fewer.",
    )?.value ?? null
  );
}

/** Validates the new slot of a Moved Class. */
export function moveTarget(
  original: { date: string; startTime: string },
  to: ClassSlotTime,
  now: LocalNow,
): ClassSlotTime {
  if (!isCalendarDate(to.date))
    throw new DomainError("CLASS_DATE_INVALID", "New date is invalid.");
  if (!isClock(to.startTime) || !isClock(to.endTime))
    throw new DomainError("CLASS_TIME_INVALID", "Times must be HH:mm.");
  if (to.startTime >= to.endTime)
    throw new DomainError(
      "CLASS_TIME_INVALID",
      "Start time must be before end time.",
    );
  if (to.date === original.date && to.startTime === original.startTime)
    throw new DomainError(
      "CLASS_MOVE_SAME_SLOT",
      "Choose a different date or start time.",
    );
  if (hasStarted(to, now))
    throw new DomainError(
      "CLASS_MOVE_IN_PAST",
      "A Class can't be moved to a date or time in the past.",
    );
  return { date: to.date, startTime: to.startTime, endTime: to.endTime };
}

/** One change to one original Class: cancelled, or moved to a new slot. */
export class ClassChange {
  private constructor(private props: ClassChangeProps) {}

  static rehydrate(props: ClassChangeProps): ClassChange {
    return new ClassChange({ ...props });
  }

  static cancel(
    original: Original,
    input: { reason?: string | null; userId: string; now: Date },
  ): ClassChange {
    return new ClassChange({
      ...original,
      kind: "cancelled",
      reason: reasonValue(input.reason),
      movedTo: null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
  }

  static move(
    original: Original,
    input: {
      to: ClassSlotTime;
      reason?: string | null;
      userId: string;
      now: Date;
      localNow: LocalNow;
    },
  ): ClassChange {
    return new ClassChange({
      ...original,
      kind: "moved",
      reason: reasonValue(input.reason),
      movedTo: moveTarget(original, input.to, input.localNow),
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
  }

  get id() {
    return this.props.id;
  }
  get workspaceId() {
    return this.props.workspaceId;
  }
  get batchId() {
    return this.props.batchId;
  }
  get date() {
    return this.props.date;
  }
  get startTime() {
    return this.props.startTime;
  }
  get kind() {
    return this.props.kind;
  }
  get movedTo() {
    return this.props.movedTo;
  }
  get deletedAt() {
    return this.props.deletedAt;
  }

  /** Cancel a Rescheduled Class: the change becomes a cancellation. */
  cancelInstead(input: {
    reason?: string | null;
    userId: string;
    now: Date;
    localNow: LocalNow;
  }): void {
    this.assertMovedSlotOpen(input.localNow);
    this.props = {
      ...this.props,
      kind: "cancelled",
      reason: reasonValue(input.reason),
      movedTo: null,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  /** Move a Rescheduled Class again. The original slot stays the same. */
  moveAgain(input: {
    to: ClassSlotTime;
    reason?: string | null;
    userId: string;
    now: Date;
    localNow: LocalNow;
  }): void {
    this.assertMovedSlotOpen(input.localNow);
    this.props = {
      ...this.props,
      kind: "moved",
      reason: reasonValue(input.reason),
      movedTo: moveTarget(this.props, input.to, input.localNow),
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  /** Bring the original Class back. Its slot, and any new slot, must not have started. */
  restore(input: { userId: string; now: Date; localNow: LocalNow }): void {
    if (hasStarted(this.props, input.localNow))
      throw new DomainError(
        "CLASS_ALREADY_STARTED",
        "This Class has already happened and can't be restored.",
      );
    if (this.props.movedTo != null) this.assertMovedSlotOpen(input.localNow);
    this.props = {
      ...this.props,
      deletedAt: input.now,
      deletedByUserId: input.userId,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  private assertMovedSlotOpen(now: LocalNow): void {
    if (this.props.movedTo != null && hasStarted(this.props.movedTo, now))
      throw new DomainError(
        "CLASS_ALREADY_STARTED",
        "The Rescheduled Class has already started.",
      );
  }

  toFact(): ClassChangeFact {
    return {
      id: this.props.id,
      batchId: this.props.batchId,
      date: this.props.date,
      startTime: this.props.startTime,
      endTime: this.props.endTime,
      kind: this.props.kind,
      reason: this.props.reason,
      movedTo: this.props.movedTo,
    };
  }

  toProps(): ClassChangeProps {
    return { ...this.props };
  }
}
