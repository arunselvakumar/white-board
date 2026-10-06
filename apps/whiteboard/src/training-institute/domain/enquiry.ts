import { isCalendarDate } from "./class-schedule";
import { ClassMode, type ClassModeValue } from "./class-mode";
import { EmailAddress } from "./email-address";
import { DomainError } from "./errors";
import { OptionalText } from "./optional-text";
import { Phone } from "./phone";

/** Enquiries and one-to-one demos use the default Batches use (ADR-0032). */
export const ENQUIRY_TIMEZONE = "Asia/Kolkata";

export const ENQUIRY_STAGES = [
  "new",
  "follow_up",
  "demo_scheduled",
  "demo_attended",
  "joined",
  "not_interested",
] as const;
export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];

export type EnquiryActivityKind =
  | "created"
  | "follow_up"
  | "not_interested"
  | "reopened"
  | "joined"
  | "details_updated";

export type DemoAttendanceValue = "unmarked" | "attended" | "missed";

/** What the stage rule needs to know about each of the Enquiry's demos. */
export type DemoStageFact = {
  attendance: DemoAttendanceValue;
  cancelled: boolean;
};

export type EnquiryDetails = {
  prospectName: string;
  phone: string;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  courseId: string | null;
  subject: string | null;
  preferredClassMode: ClassModeValue | null;
  preferredTiming: string | null;
  sourceId: string | null;
  notes: string | null;
};

export type RawEnquiryDetails = {
  prospectName: string;
  phone: string;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  courseId?: string | null;
  subject?: string | null;
  preferredClassMode?: string | null;
  preferredTiming?: string | null;
  sourceId?: string | null;
  notes?: string | null;
};

export type EnquiryActivityRecord = {
  id: string;
  kind: EnquiryActivityKind;
  note: string | null;
  nextFollowUpOn: string | null;
  createdByUserId: string;
  createdAt: Date;
};

export type EnquiryProps = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  details: EnquiryDetails;
  stage: EnquiryStage;
  nextFollowUpOn: string | null;
  notInterestedReason: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  convertedStudentId: string | null;
  convertedEnrollmentId: string | null;
  convertedAt: Date | null;
  convertedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Demos booked for this Enquiry, including cancelled ones. */
  demos: DemoStageFact[];
  /** True once any follow-up note has been logged. */
  hasFollowUp: boolean;
};

/** Who acts, when, and the id for the history entry the action adds. */
export type EnquiryAction = {
  userId: string;
  now: Date;
  /** Local date in ENQUIRY_TIMEZONE. */
  today: string;
  activityId: string;
};

function text(
  raw: string | null | undefined,
  max: number,
  code: string,
  label: string,
): string | null {
  return (
    OptionalText.create(
      raw,
      max,
      code,
      `${label} must be at most ${String(max)} characters.`,
    )?.value ?? null
  );
}

export function enquiryDetails(raw: RawEnquiryDetails): EnquiryDetails {
  const prospectName = raw.prospectName.trim();
  if (prospectName.length === 0 || prospectName.length > 200)
    throw new DomainError(
      "ENQUIRY_PROSPECT_NAME_INVALID",
      "Name must be 1 to 200 characters.",
    );
  return {
    prospectName,
    phone: Phone.create(raw.phone, "ENQUIRY_PHONE_REQUIRED").value,
    email: EmailAddress.create(raw.email)?.value ?? null,
    guardianName: text(
      raw.guardianName,
      200,
      "GUARDIAN_NAME_TOO_LONG",
      "Guardian name",
    ),
    guardianPhone: Phone.createOptional(raw.guardianPhone)?.value ?? null,
    courseId: raw.courseId ?? null,
    subject: text(raw.subject, 200, "ENQUIRY_SUBJECT_TOO_LONG", "Subject"),
    preferredClassMode:
      raw.preferredClassMode == null || raw.preferredClassMode === ""
        ? null
        : ClassMode.create(raw.preferredClassMode).value,
    preferredTiming: text(
      raw.preferredTiming,
      200,
      "ENQUIRY_TIMING_TOO_LONG",
      "Preferred timing",
    ),
    sourceId: raw.sourceId ?? null,
    notes: text(raw.notes, 2000, "ENQUIRY_NOTES_TOO_LONG", "Notes"),
  };
}

/**
 * Stage is worked out from what happened (ADR-0032): Joined > Not interested
 * > Demo scheduled > Demo attended > Follow-up > New.
 */
export function enquiryStage(input: {
  converted: boolean;
  notInterested: boolean;
  demos: readonly DemoStageFact[];
  nextFollowUpOn: string | null;
  hasFollowUp: boolean;
}): EnquiryStage {
  if (input.converted) return "joined";
  if (input.notInterested) return "not_interested";
  if (
    input.demos.some(
      (demo) => !demo.cancelled && demo.attendance === "unmarked",
    )
  )
    return "demo_scheduled";
  if (input.demos.some((demo) => demo.attendance === "attended"))
    return "demo_attended";
  if (input.nextFollowUpOn != null || input.hasFollowUp) return "follow_up";
  return "new";
}

export function isClosedStage(stage: EnquiryStage): boolean {
  return stage === "joined" || stage === "not_interested";
}

/** Open, and the next follow-up date is today or earlier. */
export function isFollowUpDue(
  stage: EnquiryStage,
  nextFollowUpOn: string | null,
  today: string,
): boolean {
  return (
    !isClosedStage(stage) && nextFollowUpOn != null && nextFollowUpOn <= today
  );
}

function followUpDate(
  raw: string | null | undefined,
  today: string,
): string | null {
  if (raw == null) return null;
  if (!isCalendarDate(raw))
    throw new DomainError(
      "FOLLOW_UP_DATE_INVALID",
      "Next follow-up date is invalid.",
    );
  if (raw < today)
    throw new DomainError(
      "FOLLOW_UP_IN_PAST",
      "The next follow-up date can't be in the past.",
    );
  return raw;
}

function enquiryClosed(): DomainError {
  return new DomainError(
    "ENQUIRY_CLOSED",
    "This Enquiry is closed. Reopen it first.",
  );
}

function enquiryJoined(): DomainError {
  return new DomainError(
    "ENQUIRY_JOINED",
    "This Enquiry has joined as a Student and can't be changed.",
  );
}

/** A prospect asking about a Course or subject, before admission. */
export class Enquiry {
  private activities: EnquiryActivityRecord[] = [];

  private constructor(private props: EnquiryProps) {}

  static record(input: {
    id: string;
    workspaceId: string;
    details: EnquiryDetails;
    nextFollowUpOn?: string | null;
    action: EnquiryAction;
  }): Enquiry {
    const { action } = input;
    const nextFollowUpOn = followUpDate(input.nextFollowUpOn, action.today);
    const enquiry = new Enquiry({
      id: input.id,
      workspaceId: input.workspaceId,
      createdByUserId: action.userId,
      details: input.details,
      stage: "new",
      nextFollowUpOn,
      notInterestedReason: null,
      closedAt: null,
      closedByUserId: null,
      convertedStudentId: null,
      convertedEnrollmentId: null,
      convertedAt: null,
      convertedByUserId: null,
      createdAt: action.now,
      updatedAt: action.now,
      demos: [],
      hasFollowUp: false,
    });
    enquiry.restage();
    enquiry.log(action, "created", null, nextFollowUpOn);
    return enquiry;
  }

  static rehydrate(props: EnquiryProps): Enquiry {
    return new Enquiry({ ...props, demos: [...props.demos] });
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get details(): EnquiryDetails {
    return this.props.details;
  }
  get stage(): EnquiryStage {
    return this.props.stage;
  }
  get nextFollowUpOn(): string | null {
    return this.props.nextFollowUpOn;
  }
  get converted(): boolean {
    return this.props.convertedAt != null;
  }
  get notInterested(): boolean {
    return this.props.closedAt != null && !this.converted;
  }
  get closed(): boolean {
    return this.converted || this.notInterested;
  }

  updateDetails(details: EnquiryDetails, action: EnquiryAction): void {
    if (this.converted) throw enquiryJoined();
    this.props = { ...this.props, details, updatedAt: action.now };
    this.log(action, "details_updated", null, null);
  }

  logFollowUp(
    input: { note: string; nextFollowUpOn: string | null },
    action: EnquiryAction,
  ): void {
    if (this.closed) throw enquiryClosed();
    const note = input.note.trim();
    if (note.length === 0 || note.length > 1000)
      throw new DomainError(
        "FOLLOW_UP_NOTE_INVALID",
        "Follow-up note must be 1 to 1000 characters.",
      );
    const nextFollowUpOn = followUpDate(input.nextFollowUpOn, action.today);
    this.props = {
      ...this.props,
      nextFollowUpOn,
      hasFollowUp: true,
      updatedAt: action.now,
    };
    this.restage();
    this.log(action, "follow_up", note, nextFollowUpOn);
  }

  markNotInterested(reason: string, action: EnquiryAction): void {
    if (this.closed) throw enquiryClosed();
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > 200)
      throw new DomainError(
        "NOT_INTERESTED_REASON_INVALID",
        "Reason must be 1 to 200 characters.",
      );
    this.props = {
      ...this.props,
      notInterestedReason: trimmed,
      closedAt: action.now,
      closedByUserId: action.userId,
      updatedAt: action.now,
    };
    this.restage();
    this.log(action, "not_interested", trimmed, null);
  }

  reopen(
    input: { nextFollowUpOn?: string | null },
    action: EnquiryAction,
  ): void {
    if (this.converted) throw enquiryJoined();
    if (!this.notInterested)
      throw new DomainError("ENQUIRY_NOT_CLOSED", "This Enquiry is open.");
    const nextFollowUpOn = followUpDate(input.nextFollowUpOn, action.today);
    this.props = {
      ...this.props,
      nextFollowUpOn,
      notInterestedReason: null,
      closedAt: null,
      closedByUserId: null,
      updatedAt: action.now,
    };
    this.restage();
    this.log(action, "reopened", null, nextFollowUpOn);
  }

  /** Joined and Not interested Enquiries can't take new demos. */
  assertCanBookDemo(): void {
    if (this.closed) throw enquiryClosed();
  }

  assertCanConvert(): void {
    if (this.converted)
      throw new DomainError(
        "ENQUIRY_ALREADY_CONVERTED",
        "This Enquiry has already been converted to a Student.",
      );
    if (this.notInterested) throw enquiryClosed();
  }

  markJoined(
    input: { studentId: string; enrollmentId: string },
    action: EnquiryAction,
  ): void {
    this.assertCanConvert();
    this.props = {
      ...this.props,
      convertedStudentId: input.studentId,
      convertedEnrollmentId: input.enrollmentId,
      convertedAt: action.now,
      convertedByUserId: action.userId,
      updatedAt: action.now,
    };
    this.restage();
    this.log(action, "joined", null, null);
  }

  /** Recalculates the stage after a demo was booked, marked, or cancelled. */
  demosChanged(demos: readonly DemoStageFact[], now: Date): void {
    this.props = { ...this.props, demos: [...demos], updatedAt: now };
    this.restage();
  }

  pullActivities(): EnquiryActivityRecord[] {
    const pending = this.activities;
    this.activities = [];
    return pending;
  }

  toProps(): EnquiryProps {
    return { ...this.props, demos: [...this.props.demos] };
  }

  private restage(): void {
    this.props.stage = enquiryStage({
      converted: this.converted,
      notInterested: this.notInterested,
      demos: this.props.demos,
      nextFollowUpOn: this.props.nextFollowUpOn,
      hasFollowUp: this.props.hasFollowUp,
    });
  }

  private log(
    action: EnquiryAction,
    kind: EnquiryActivityKind,
    note: string | null,
    nextFollowUpOn: string | null,
  ): void {
    this.activities.push({
      id: action.activityId,
      kind,
      note,
      nextFollowUpOn,
      createdByUserId: action.userId,
      createdAt: action.now,
    });
  }
}
