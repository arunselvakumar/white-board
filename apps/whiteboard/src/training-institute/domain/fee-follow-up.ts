import { isCalendarDate } from "./class-schedule";
import { DomainError } from "./errors";

export const FEE_FOLLOW_UP_CHANNELS = [
  "phone",
  "whatsapp_sms",
  "in_person",
  "other",
] as const;

export type FeeFollowUpChannel = (typeof FEE_FOLLOW_UP_CHANNELS)[number];

/**
 * Why a Fee Follow-up closed: a newer one was logged, the Owner marked it
 * done, or the Enrollment's remaining dues reached zero.
 */
export type FeeFollowUpCloseReason = "superseded" | "done" | "dues_cleared";

export const FEE_FOLLOW_UP_NOTE_MAX = 500;

export type FeeFollowUpProps = {
  id: string;
  workspaceId: string;
  enrollmentId: string;
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string | null;
  loggedByUserId: string;
  editedByUserId: string | null;
  editedAt: Date | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  closeReason: FeeFollowUpCloseReason | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FeeFollowUpDetails = {
  channel: string;
  note?: string | null;
  nextFollowUpOn?: string | null;
};

/** Who is acting, when, and today's date in the Enrollment's Batch timezone. */
export type FeeFollowUpAction = { userId: string; now: Date; today: string };

/**
 * The Owner's record of chasing an Enrollment's dues. An Enrollment has at
 * most one open Fee Follow-up: logging a new one closes the last (ADR-0039 §4).
 */
export class FeeFollowUp {
  private constructor(private props: FeeFollowUpProps) {}

  static log(
    input: {
      id: string;
      workspaceId: string;
      enrollmentId: string;
      details: FeeFollowUpDetails;
    },
    action: FeeFollowUpAction,
  ): FeeFollowUp {
    return new FeeFollowUp({
      id: input.id,
      workspaceId: input.workspaceId,
      enrollmentId: input.enrollmentId,
      ...validDetails(input.details, action.today),
      loggedByUserId: action.userId,
      editedByUserId: null,
      editedAt: null,
      closedAt: null,
      closedByUserId: null,
      closeReason: null,
      createdAt: action.now,
      updatedAt: action.now,
    });
  }

  static rehydrate(props: FeeFollowUpProps): FeeFollowUp {
    return new FeeFollowUp({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get enrollmentId(): string {
    return this.props.enrollmentId;
  }

  get open(): boolean {
    return this.props.closedAt == null;
  }

  /** Changes the channel, note, and next date of the open Fee Follow-up. */
  edit(details: FeeFollowUpDetails, action: FeeFollowUpAction): void {
    this.assertOpen();
    this.props = {
      ...this.props,
      ...validDetails(details, action.today),
      editedByUserId: action.userId,
      editedAt: action.now,
      updatedAt: action.now,
    };
  }

  markDone(action: FeeFollowUpAction): void {
    this.assertOpen();
    this.close("done", action);
  }

  /** Closes it because a newer Fee Follow-up was logged. */
  supersede(action: FeeFollowUpAction): void {
    this.assertOpen();
    this.close("superseded", action);
  }

  toProps(): FeeFollowUpProps {
    return { ...this.props };
  }

  private close(reason: FeeFollowUpCloseReason, action: FeeFollowUpAction) {
    this.props = {
      ...this.props,
      closedAt: action.now,
      closedByUserId: action.userId,
      closeReason: reason,
      updatedAt: action.now,
    };
  }

  private assertOpen(): void {
    if (!this.open)
      throw new DomainError(
        "FEE_FOLLOW_UP_CLOSED",
        "This follow-up is closed and can't be changed.",
      );
  }
}

/** Refused when an Enrollment has nothing left to pay. */
export function noDuesToFollowUp(): DomainError {
  return new DomainError(
    "FEE_FOLLOW_UP_NO_DUES",
    "This Enrollment has no remaining dues to follow up.",
  );
}

function validDetails(
  details: FeeFollowUpDetails,
  today: string,
): Pick<FeeFollowUpProps, "channel" | "note" | "nextFollowUpOn"> {
  if (!FEE_FOLLOW_UP_CHANNELS.includes(details.channel as FeeFollowUpChannel))
    throw new DomainError(
      "FEE_FOLLOW_UP_CHANNEL_REQUIRED",
      "Choose how you followed up: phone, WhatsApp/SMS, in person, or other.",
    );
  const note = details.note?.trim() ?? "";
  if (note.length > FEE_FOLLOW_UP_NOTE_MAX)
    throw new DomainError(
      "FEE_FOLLOW_UP_NOTE_INVALID",
      `Note must be ${FEE_FOLLOW_UP_NOTE_MAX} characters or fewer.`,
    );
  const next = details.nextFollowUpOn ?? null;
  if (next != null && !isCalendarDate(next))
    throw new DomainError(
      "FEE_FOLLOW_UP_DATE_INVALID",
      "Next follow-up date is invalid.",
    );
  if (next != null && next < today)
    throw new DomainError(
      "FEE_FOLLOW_UP_DATE_IN_PAST",
      "The next follow-up date can't be in the past.",
    );
  return {
    channel: details.channel as FeeFollowUpChannel,
    note: note.length === 0 ? null : note,
    nextFollowUpOn: next,
  };
}
