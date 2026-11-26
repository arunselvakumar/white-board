import type { IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

// An Enquiry moves New → Contacted → Visit scheduled → Visited → Admitted,
// or to Lost from any open status. Admitted is final; Lost can be reopened.

export const ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
  "admitted",
  "lost",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const OPEN_ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
] as const;
export type OpenEnquiryStatus = (typeof OPEN_ENQUIRY_STATUSES)[number];

/** Statuses a person moves an Enquiry to by hand. */
export const MOVABLE_ENQUIRY_STATUSES = [
  "contacted",
  "visit_scheduled",
  "visited",
] as const;
export type MovableEnquiryStatus = (typeof MOVABLE_ENQUIRY_STATUSES)[number];

export const ENQUIRY_SOURCES = [
  "walk_in",
  "referral",
  "google",
  "social_media",
  "flyer",
  "head_office",
  "other",
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ENQUIRY_ACTIVITY_KINDS = [
  "note",
  "call",
  "visit",
  "status_change",
] as const;
export type EnquiryActivityKind = (typeof ENQUIRY_ACTIVITY_KINDS)[number];
export type FollowUpKind = Exclude<EnquiryActivityKind, "status_change">;

/** `open`: still being worked; `due`: open with a follow-up today or earlier. */
export const ENQUIRY_LIST_FILTERS = ["open", "due", "closed", "all"] as const;
export type EnquiryListFilter = (typeof ENQUIRY_LIST_FILTERS)[number];

export function isOpenEnquiry(
  status: EnquiryStatus,
): status is OpenEnquiryStatus {
  return (OPEN_ENQUIRY_STATUSES as readonly string[]).includes(status);
}

/** Open, and the next follow-up is today or earlier (dates in India). */
export function isFollowUpDue(
  enquiry: { status: EnquiryStatus; nextFollowUpOn: IsoDate | null },
  today: IsoDate,
): boolean {
  return (
    isOpenEnquiry(enquiry.status) &&
    enquiry.nextFollowUpOn != null &&
    enquiry.nextFollowUpOn <= today
  );
}

/** An Admitted Enquiry is closed for good: 409 `ENQUIRY_ADMITTED`. */
export function assertEnquiryEditable(status: EnquiryStatus): void {
  if (status === "admitted")
    throw conflict(
      "ENQUIRY_ADMITTED",
      "This Enquiry has been admitted and can no longer be changed.",
    );
}

/** Follow-ups and status moves need an open Enquiry; a Lost one is reopened first. */
export function assertEnquiryOpen(status: EnquiryStatus): void {
  assertEnquiryEditable(status);
  if (status === "lost")
    throw conflict(
      "ENQUIRY_LOST",
      "This Enquiry is marked lost. Reopen it first.",
    );
}

/**
 * Where a status move leaves the Enquiry. A visit needs its date; marking it
 * visited keeps a visit date that has passed, else uses `today`. Moving to the
 * status it already has is refused, except to change the visit date.
 */
export function moveEnquiry(
  current: { status: EnquiryStatus; visitOn: IsoDate | null },
  to: MovableEnquiryStatus,
  input: { visitOn?: IsoDate | null },
  today: IsoDate,
): { status: MovableEnquiryStatus; visitOn: IsoDate | null } {
  assertEnquiryOpen(current.status);
  if (to === "visit_scheduled") {
    if (input.visitOn == null)
      throw invalid("VISIT_DATE_REQUIRED", "Choose the date of the visit.");
    if (current.status === to && current.visitOn === input.visitOn)
      throw statusUnchanged();
    return { status: to, visitOn: input.visitOn };
  }
  if (current.status === to) throw statusUnchanged();
  if (to === "visited") {
    const visitOn =
      input.visitOn ??
      (current.visitOn != null && current.visitOn <= today
        ? current.visitOn
        : today);
    return { status: to, visitOn };
  }
  return { status: to, visitOn: current.visitOn };
}

function statusUnchanged() {
  return conflict(
    "ENQUIRY_STATUS_UNCHANGED",
    "The Enquiry already has this status.",
  );
}

export function assertCanMarkLost(status: EnquiryStatus): void {
  assertEnquiryEditable(status);
  if (status === "lost")
    throw conflict("ENQUIRY_LOST", "This Enquiry is already marked lost.");
}

export function assertCanReopen(status: EnquiryStatus): void {
  assertEnquiryEditable(status);
  if (status !== "lost")
    throw conflict("ENQUIRY_NOT_LOST", "Only a lost Enquiry can be reopened.");
}

/** Only an open Enquiry of the same Centre becomes an Admission. */
export function assertCanAdmitEnquiry(
  enquiry: { status: EnquiryStatus; centreId: string },
  centreId: string,
): void {
  if (enquiry.status === "admitted")
    throw conflict(
      "ENQUIRY_ALREADY_ADMITTED",
      "This Enquiry has already been admitted.",
    );
  if (enquiry.status === "lost")
    throw conflict(
      "ENQUIRY_LOST",
      "This Enquiry is marked lost. Reopen it first.",
    );
  if (enquiry.centreId !== centreId)
    throw invalid(
      "ENQUIRY_OTHER_CENTRE",
      "The Enquiry belongs to another Centre.",
    );
}

/**
 * The status a reopened Enquiry goes back to: the open status it had when it
 * was marked lost, else New.
 * @param history status changes, newest first.
 */
export function statusBeforeLost(
  history: readonly { toStatus: EnquiryStatus | null }[],
): OpenEnquiryStatus {
  const changes = history.filter((entry) => entry.toStatus != null);
  const lostAt = changes.findIndex((entry) => entry.toStatus === "lost");
  if (lostAt < 0) return "new";
  for (const entry of changes.slice(lostAt + 1)) {
    const status = entry.toStatus;
    if (status === "lost") break;
    if (status != null && isOpenEnquiry(status)) return status;
  }
  return "new";
}
