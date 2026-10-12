// Read models for Absence Notices and Notifications (ADR-0041). The HTTP
// Response models and the client query types match these exactly.

import type { ClassSlotTime } from "../domain/class-schedule";
import type { AbsenceGiverRole, AbsenceReason } from "../domain/absence-notice";
import type { FamilyRole } from "./family-links";

export type { AbsenceGiverRole, AbsenceReason };

/** A Student User or Parent User linked to Students by verified email. */
export type AbsenceNoticeFamily = {
  workspaceId: string;
  userId: string;
  role: FamilyRole;
  verifiedEmails: readonly string[];
};

/** The Owner, or a Teacher (who sees only assigned Batches). */
export type AbsenceNoticeStaff = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

export type GivenByView = {
  role: AbsenceGiverRole;
  /** Display name of the User who gave (or withdrew) the notice. */
  name: string;
};

/** One Class of one Enrollment, as a notice keys and shows it. */
export type NoticeClassView = {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  courseName: string;
  classMode: "offline" | "online" | "hybrid";
  timezone: string;
  /** YYYY-MM-DD, local to the Batch. */
  date: string;
  /** HH:mm */
  startTime: string;
  endTime: string;
  /** True when this is the new time of a Moved Class. */
  rescheduled: boolean;
};

// ---------------------------------------------------------------------------
// Family: the Class picker
// GET /api/training-institute/absence-notices/classes

export type PickableClassView = NoticeClassView & {
  /** The live notice already given for this Class, if any; not pickable. */
  noticeId: string | null;
};

export type AbsenceNoticeClassesView = {
  students: {
    id: string;
    name: string;
    /** Next 60 days, still scheduled, not started; date and time order. */
    classes: PickableClassView[];
  }[];
};

// Family: give notice
// POST /api/training-institute/absence-notices

export type GiveAbsenceNoticeInput = {
  studentId: string;
  classes: { enrollmentId: string; date: string; startTime: string }[];
  reason: AbsenceReason;
  note?: string | null;
};

// ---------------------------------------------------------------------------
// Family: notices given
// GET /api/training-institute/absence-notices
// POST /api/training-institute/absence-notices (201, the created notices)
// POST /api/training-institute/absence-notices/{id}/withdraw (200, the notice)

/**
 * Whether the notice still counts. Anything but `applies` is shown to the
 * family as no longer needed, with the reason.
 */
export type NoticeStandingView =
  "applies" | "cancelled" | "holiday" | "moved" | "not_scheduled";

export type FamilyAbsenceNoticeView = {
  id: string;
  studentId: string;
  studentName: string;
  class: NoticeClassView;
  reason: AbsenceReason;
  note: string | null;
  givenAt: string;
  givenBy: GivenByView;
  standing: NoticeStandingView;
  /** The Class's new time when `standing` is `moved`, if known. */
  movedTo: ClassSlotTime | null;
  /** True until the Class starts. */
  canWithdraw: boolean;
};

export type FamilyAbsenceNoticesView = {
  students: {
    id: string;
    name: string;
    /** Live (not withdrawn) notices for Classes not yet started, soonest first. */
    notices: FamilyAbsenceNoticeView[];
  }[];
};

// ---------------------------------------------------------------------------
// Staff: expected absentees
// GET /api/training-institute/absence-notices/expected

export type ExpectedAbsenteeView = {
  noticeId: string;
  studentId: string;
  studentName: string;
  reason: AbsenceReason;
  note: string | null;
  givenAt: string;
  givenBy: GivenByView;
};

export type ExpectedAbsenceClassView = {
  batchId: string;
  batchName: string;
  courseName: string;
  timezone: string;
  date: string;
  startTime: string;
  endTime: string;
  rescheduled: boolean;
  absentees: ExpectedAbsenteeView[];
};

export type ExpectedAbsencesView = {
  /** Upcoming Classes (next 60 days, not started) with notices that apply. */
  classes: ExpectedAbsenceClassView[];
};

// ---------------------------------------------------------------------------
// Attendance Register flag: each mark of a Register carries this, or null.

export type RegisterNoticeView = {
  noticeId: string;
  reason: AbsenceReason;
  note: string | null;
  givenAt: string;
  givenBy: GivenByView;
};

// ---------------------------------------------------------------------------
// Notifications (the bell)
// GET  /api/training-institute/notifications?limit&after&before
// POST /api/training-institute/notifications/{id}/read
// POST /api/training-institute/notifications/read-all

export type NotificationKind =
  "absence_notice_given" | "absence_notice_withdrawn";

/** Snapshot stored with the Notification; shape for both absence kinds. */
export type AbsenceNoticeNotificationPayload = {
  studentId: string;
  studentName: string;
  batchId: string;
  batchName: string;
  courseName: string;
  timezone: string;
  classes: ClassSlotTime[];
  reason: AbsenceReason;
  note: string | null;
  /** Who gave the notice, or for `absence_notice_withdrawn` who withdrew it. */
  by: GivenByView;
};

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  payload: AbsenceNoticeNotificationPayload;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsView = {
  /** Newest first. */
  items: NotificationView[];
  total: number;
  unreadCount: number;
  nextCursor: string | null;
  prevCursor: string | null;
};

/** GET /api/training-institute/notifications/unread-count */
export type UnreadNotificationsView = { unreadCount: number };
