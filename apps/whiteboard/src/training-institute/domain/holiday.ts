import {
  daysBetween,
  isCalendarDate,
  type HolidayFact,
} from "./class-schedule";
import { DomainError } from "./errors";
import { OptionalText } from "./optional-text";

export const MAX_HOLIDAY_DAYS = 92;

export type HolidayProps = {
  id: string;
  workspaceId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: string | null;
};

/** Workspace-wide dates on which every Class is cancelled. */
export class Holiday {
  private constructor(private props: HolidayProps) {}

  static rehydrate(props: HolidayProps): Holiday {
    return new Holiday({ ...props });
  }

  static declare(input: {
    id: string;
    workspaceId: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
    userId: string;
    now: Date;
    today: string;
  }): Holiday {
    if (!isCalendarDate(input.startDate) || !isCalendarDate(input.endDate))
      throw new DomainError("HOLIDAY_DATES_INVALID", "Dates are invalid.");
    if (input.endDate < input.startDate)
      throw new DomainError(
        "HOLIDAY_DATES_INVALID",
        "End date must be on or after the start date.",
      );
    if (daysBetween(input.startDate, input.endDate) + 1 > MAX_HOLIDAY_DAYS)
      throw new DomainError(
        "HOLIDAY_TOO_LONG",
        `A Holiday can be at most ${MAX_HOLIDAY_DAYS} days.`,
      );
    if (input.startDate < input.today)
      throw new DomainError(
        "HOLIDAY_IN_PAST",
        "A Holiday must start today or later.",
      );
    const reason =
      OptionalText.create(
        input.reason,
        200,
        "HOLIDAY_REASON_TOO_LONG",
        "Reason must be 200 characters or fewer.",
      )?.value ?? null;
    return new Holiday({
      id: input.id,
      workspaceId: input.workspaceId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason,
      createdByUserId: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
  }

  get id() {
    return this.props.id;
  }
  get startDate() {
    return this.props.startDate;
  }
  get endDate() {
    return this.props.endDate;
  }

  overlaps(other: { startDate: string; endDate: string }): boolean {
    return (
      this.props.startDate <= other.endDate &&
      other.startDate <= this.props.endDate
    );
  }

  /** Remove an upcoming Holiday. Its Classes come back as they were. */
  remove(input: { userId: string; now: Date; today: string }): void {
    if (this.props.startDate < input.today)
      throw new DomainError(
        "HOLIDAY_STARTED",
        "A Holiday that has already begun can't be removed.",
      );
    this.props = {
      ...this.props,
      deletedAt: input.now,
      deletedByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  toFact(): HolidayFact {
    return {
      id: this.props.id,
      startDate: this.props.startDate,
      endDate: this.props.endDate,
      reason: this.props.reason,
    };
  }

  toProps(): HolidayProps {
    return { ...this.props };
  }
}
