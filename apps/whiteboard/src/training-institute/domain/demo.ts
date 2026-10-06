import {
  clockMinutes,
  hasStarted,
  holidayOn,
  isCalendarDate,
  isClock,
  type HolidayFact,
  type LocalNow,
} from "./class-schedule";
import type { DemoAttendanceValue, DemoStageFact } from "./enquiry";
import { DomainError } from "./errors";

export const DEMO_FEE_MIN_PAISE = 100;
export const DEMO_FEE_MAX_PAISE = 10_000_000;

export type DemoKind = "batch" | "one_to_one";
export type DemoFeeKind = "free" | "paid";

export type DemoFee = { kind: DemoFeeKind; amountPaise: number | null };

export type DemoProps = {
  id: string;
  workspaceId: string;
  enquiryId: string;
  kind: DemoKind;
  batchId: string | null;
  teacherId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  feeKind: DemoFeeKind;
  feeAmountPaise: number | null;
  feePaidAt: Date | null;
  feePaidByUserId: string | null;
  attendance: DemoAttendanceValue;
  attendanceMarkedAt: Date | null;
  attendanceMarkedByUserId: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type Booking = {
  id: string;
  workspaceId: string;
  enquiryId: string;
  fee: DemoFee;
  userId: string;
  now: Date;
  /** "Now" in the demo's timezone. */
  localNow: LocalNow;
};

/** A paid demo has an amount from ₹1 to ₹1,00,000; a free demo has none. */
export function demoFee(
  kind: DemoFeeKind,
  amountPaise: number | null | undefined,
): DemoFee {
  if (kind === "free") {
    if (amountPaise != null)
      throw new DomainError(
        "DEMO_FEE_INVALID",
        "A free demo can't have an amount.",
      );
    return { kind, amountPaise: null };
  }
  if (
    amountPaise == null ||
    !Number.isInteger(amountPaise) ||
    amountPaise < DEMO_FEE_MIN_PAISE ||
    amountPaise > DEMO_FEE_MAX_PAISE
  )
    throw new DomainError(
      "DEMO_FEE_INVALID",
      "A paid demo needs an amount from ₹1 to ₹1,00,000.",
    );
  return { kind, amountPaise };
}

function assertNotPast(
  slot: { date: string; startTime: string },
  localNow: LocalNow,
): void {
  if (hasStarted(slot, localNow))
    throw new DomainError(
      "DEMO_IN_PAST",
      "A demo can't be booked in the past or after its start time today.",
    );
}

/** Two time ranges on the same date overlap when each starts before the other ends. */
export function timesOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return (
    clockMinutes(a.startTime) < clockMinutes(b.endTime) &&
    clockMinutes(b.startTime) < clockMinutes(a.endTime)
  );
}

/**
 * A trial class for an Enquiry's prospect: a Batch demo (one date's Class of
 * a Batch) or a one-to-one demo (a date and time with a Teacher). It never
 * takes a seat, creates dues, or appears in the Attendance Register.
 */
export class Demo {
  private constructor(private props: DemoProps) {}

  /**
   * The application finds the Class first: it must be scheduled at this date
   * and start time, and its end time comes from the Class.
   */
  static bookBatch(
    input: Booking & {
      batchId: string;
      timezone: string;
      slot: { date: string; startTime: string; endTime: string };
    },
  ): Demo {
    assertNotPast(input.slot, input.localNow);
    return new Demo({
      ...Demo.base(input),
      kind: "batch",
      batchId: input.batchId,
      teacherId: null,
      ...input.slot,
      timezone: input.timezone,
    });
  }

  static bookOneToOne(
    input: Booking & {
      teacherId: string;
      timezone: string;
      date: string;
      startTime: string;
      endTime: string;
      holidays: readonly HolidayFact[];
      /** The Teacher's other one-to-one demos on that date. */
      teacherDemos: readonly Demo[];
    },
  ): Demo {
    if (
      !isCalendarDate(input.date) ||
      !isClock(input.startTime) ||
      !isClock(input.endTime) ||
      clockMinutes(input.endTime) <= clockMinutes(input.startTime)
    )
      throw new DomainError(
        "DEMO_TIME_INVALID",
        "End time must be after the start time.",
      );
    assertNotPast(input, input.localNow);
    if (holidayOn(input.holidays, input.date) != null)
      throw new DomainError("DEMO_ON_HOLIDAY", "That date is a Holiday.");
    const clash = input.teacherDemos.some(
      (other) =>
        other.props.kind === "one_to_one" &&
        other.props.teacherId === input.teacherId &&
        other.props.date === input.date &&
        !other.cancelled &&
        other.props.id !== input.id &&
        timesOverlap(other.props, input),
    );
    if (clash)
      throw new DomainError(
        "DEMO_TEACHER_CLASH",
        "This Teacher already has a one-to-one demo at that time.",
      );
    return new Demo({
      ...Demo.base(input),
      kind: "one_to_one",
      batchId: null,
      teacherId: input.teacherId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
    });
  }

  private static base(input: Booking) {
    return {
      id: input.id,
      workspaceId: input.workspaceId,
      enquiryId: input.enquiryId,
      feeKind: input.fee.kind,
      feeAmountPaise: input.fee.amountPaise,
      feePaidAt: null,
      feePaidByUserId: null,
      attendance: "unmarked" as const,
      attendanceMarkedAt: null,
      attendanceMarkedByUserId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      createdByUserId: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  static rehydrate(props: DemoProps): Demo {
    return new Demo({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get enquiryId(): string {
    return this.props.enquiryId;
  }
  get timezone(): string {
    return this.props.timezone;
  }
  get cancelled(): boolean {
    return this.props.cancelledAt != null;
  }
  get attendance(): DemoAttendanceValue {
    return this.props.attendance;
  }

  /** Marked from the demo's start time onwards; can be corrected later. */
  markAttendance(
    attended: boolean,
    input: { userId: string; now: Date; localNow: LocalNow },
  ): void {
    if (this.cancelled)
      throw new DomainError(
        "DEMO_CANCELLED",
        "This demo was cancelled, so it can't be marked.",
      );
    if (!hasStarted(this.props, input.localNow))
      throw new DomainError(
        "DEMO_NOT_STARTED",
        "Attendance can be marked once the demo has started.",
      );
    this.props = {
      ...this.props,
      attendance: attended ? "attended" : "missed",
      attendanceMarkedAt: input.now,
      attendanceMarkedByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  /** Demo fees stay separate from course fees and never create dues. */
  markFeePaid(input: { userId: string; now: Date }): void {
    if (this.props.feeKind === "free")
      throw new DomainError("DEMO_FREE", "This demo is free.");
    if (this.cancelled)
      throw new DomainError("DEMO_CANCELLED", "This demo was cancelled.");
    if (this.props.feePaidAt != null)
      throw new DomainError(
        "DEMO_FEE_ALREADY_PAID",
        "This demo fee is already marked paid.",
      );
    this.props = {
      ...this.props,
      feePaidAt: input.now,
      feePaidByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  cancel(input: { userId: string; now: Date }): void {
    if (this.cancelled)
      throw new DomainError(
        "DEMO_ALREADY_CANCELLED",
        "This demo is already cancelled.",
      );
    if (this.props.attendance !== "unmarked")
      throw new DomainError(
        "DEMO_ATTENDANCE_MARKED",
        "Attendance is marked for this demo, so it can't be cancelled.",
      );
    this.props = {
      ...this.props,
      cancelledAt: input.now,
      cancelledByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  /** Booked and not marked yet: what closing an Enquiry calls off. */
  get pending(): boolean {
    return !this.cancelled && this.props.attendance === "unmarked";
  }

  toStageFact(): DemoStageFact {
    return { attendance: this.props.attendance, cancelled: this.cancelled };
  }

  toProps(): DemoProps {
    return { ...this.props };
  }
}
