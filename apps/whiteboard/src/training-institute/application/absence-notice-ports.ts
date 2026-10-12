// Ports for Absence Notices and the Notifications they send (ADR-0041).

import type { AbsenceGiverRole, AbsenceReason } from "../domain/absence-notice";
import type { ScheduleSlot } from "../domain/class-schedule";
import type {
  AbsenceNoticeNotificationPayload,
  NotificationKind,
} from "./absence-notice-views";
import type { ClassExceptions } from "./class-change-handlers";
import type { FamilyRole } from "./family-links";

/** An Enrollment's Classes as notice sees them. */
export type NoticeEnrollment = {
  id: string;
  studentId: string;
  batchId: string;
  batchName: string;
  courseName: string;
  classMode: "offline" | "online" | "hybrid";
  timezone: string;
  /** Effective Timings: Student-specific, or the Batch's. */
  timings: ScheduleSlot[];
  /** When the Enrollment began; its first Class date in the Batch timezone. */
  activeFrom: Date;
  /** Not ended or deleted, Batch open, Course and Student not removed. */
  active: boolean;
};

export type AbsenceNoticeRecord = {
  id: string;
  studentId: string;
  studentName: string;
  enrollment: NoticeEnrollment;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: AbsenceReason;
  note: string | null;
  givenAt: Date;
  givenBy: { userId: string; role: AbsenceGiverRole; name: string };
  withdrawnAt: Date | null;
};

export type NewAbsenceNotice = {
  id: string;
  studentId: string;
  enrollmentId: string;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: AbsenceReason;
  note: string | null;
  givenAt: Date;
  givenByUserId: string;
  givenByRole: AbsenceGiverRole;
  givenByName: string;
};

export type NewNotification = {
  id: string;
  recipientUserId: string;
  kind: NotificationKind;
  payload: AbsenceNoticeNotificationPayload;
  createdAt: Date;
};

export type LiveNoticeFilter = {
  studentIds?: readonly string[];
  /** Omit for every Batch in the Workspace. */
  batchIds?: readonly string[];
  /** Class dates from, inclusive (YYYY-MM-DD). */
  from: string;
  /** Class dates to, inclusive. */
  to?: string;
};

/** Persistence for Absence Notices, scoped to one Workspace per call. */
export type AbsenceNoticeStore = {
  /**
   * Runs `work` in one transaction holding each Batch's schedule lock, the
   * same lock Class Changes take, so a Class can't be cancelled or moved
   * while notice for it is checked and saved.
   */
  withBatchLocks<T>(
    workspaceId: string,
    batchIds: readonly string[],
    work: (store: AbsenceNoticeStore) => Promise<T>,
  ): Promise<T>;

  /** Students (not dropped) linked to a Student or Parent User, by name. */
  linkedStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<{ id: string; name: string }[]>;
  /** Active Enrollments of these Students. */
  activeEnrollments(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<NoticeEnrollment[]>;
  classExceptions(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassExceptions>;
  /** Notices not withdrawn, by Class date. */
  liveNotices(
    workspaceId: string,
    filter: LiveNoticeFilter,
  ): Promise<AbsenceNoticeRecord[]>;
  findNotice(
    workspaceId: string,
    id: string,
  ): Promise<AbsenceNoticeRecord | null>;
  /** Refuses a second live notice for an Enrollment and Class. */
  insertNotices(
    workspaceId: string,
    notices: readonly NewAbsenceNotice[],
  ): Promise<void>;
  /** False if the notice was already withdrawn. */
  withdrawNotice(
    workspaceId: string,
    id: string,
    by: { userId: string; role: AbsenceGiverRole },
    now: Date,
  ): Promise<boolean>;
  /** Batches an active Teacher linked to this User is assigned to. */
  assignedBatchIds(workspaceId: string, userId: string): Promise<string[]>;
  /** Users of the active Teachers assigned to these Batches. */
  batchTeacherUsers(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<{ batchId: string; userId: string }[]>;
  insertNotifications(
    workspaceId: string,
    notifications: readonly NewNotification[],
  ): Promise<void>;
};

/** Users live in identity, owned by @repo/auth. */
export type UserDirectory = {
  displayName(userId: string): Promise<string>;
  /** Account email addresses of members of the Workspace. */
  memberEmails(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

export type AbsenceNoticeMailer = {
  send(email: {
    to: string;
    kind: NotificationKind;
    payload: AbsenceNoticeNotificationPayload;
  }): Promise<void>;
};
