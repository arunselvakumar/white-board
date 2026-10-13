// What Reports read (Reports PRD §2 goal 6: only data Whiteboard already
// records). Everything is scoped to one Workspace; the handlers narrow it to
// what the viewer may see.

import type { AbsenceReason } from "../domain/absence-notice";
import type { AttendanceStatus } from "../domain/attendance-register";
import type { ClassChangeFact, HolidayFact } from "../domain/class-schedule";
import type { FeePlanDueDate } from "../domain/fee-plan";
import type { ReportSettings } from "../domain/report-settings";
import type { WeeklySlot } from "../domain/weekly-timings";
import type { ReportDocument } from "./report-document";

export type ClassModeValue = "offline" | "online" | "hybrid";
export type FamilyRoleValue = "student" | "parent";

export type ReportViewer =
  | { role: "owner"; workspaceId: string; userId: string }
  | {
      role: "teacher";
      workspaceId: string;
      userId: string;
      teacherId: string;
      teacherName: string;
    }
  | {
      role: FamilyRoleValue;
      workspaceId: string;
      userId: string;
      /** Linked Students; a Student User has at most one. */
      studentIds: string[];
    };

export type ReportCourse = { id: string; name: string; archived: boolean };

export type ReportBatch = {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  classMode: ClassModeValue;
  capacity: number;
  room: string | null;
  timings: WeeklySlot[];
  timezone: string;
  meetingOption: "external" | "whiteboard";
  closedAt: Date | null;
  createdAt: Date;
};

export type ReportStudent = {
  id: string;
  name: string;
  /** Parent's phone, or the Student's own when no parent phone is on file. */
  contactPhone: string | null;
  createdAt: Date;
  droppedAt: Date | null;
  /** Father, mother and Guardian email addresses (R18 email). */
  parentEmails: string[];
};

export type ReportEnrollment = {
  id: string;
  studentId: string;
  batchId: string;
  courseId: string;
  /** The Enrollment's own Class Mode, or the Batch's. */
  classMode: ClassModeValue;
  timingSource: "batch" | "student";
  /** Effective weekly Timings: Student-specific, or the Batch's. */
  timings: WeeklySlot[];
  createdAt: Date;
  endedAt: Date | null;
  feePlan: {
    type: "one_time" | "monthly" | "installments";
    amountPaise: number;
    concessionPaise: number;
    installmentCount: number | null;
    dueDates: FeePlanDueDate[];
  };
};

export type ReportTeacher = {
  id: string;
  name: string;
  kind: "centre_teacher" | "visiting_tutor";
  userId: string | null;
  deactivatedAt: Date | null;
};

export type ReportAssignment = {
  teacherId: string;
  batchId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
};

export type ReportStructure = {
  courses: ReportCourse[];
  batches: ReportBatch[];
  students: ReportStudent[];
  enrollments: ReportEnrollment[];
  teachers: ReportTeacher[];
  assignments: ReportAssignment[];
  changes: ClassChangeFact[];
  holidays: HolidayFact[];
};

/** One Student's latest saved mark on a Batch's register for a date. */
export type ReportMark = {
  batchId: string;
  date: string;
  enrollmentId: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  markedAt: Date | null;
  markedByUserId: string | null;
};

export type ReportOccurrence = {
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "starting" | "live" | "ended" | "failed";
  recordingStatus:
    "pending" | "requesting" | "recording" | "uploading" | "ready" | "error";
  startedByUserId: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Students who joined, from Whiteboard's own join records. */
  joins: { enrollmentId: string; studentId: string; joinedAt: Date }[];
};

/** A live (not withdrawn) Absence Notice. */
export type ReportNotice = {
  id: string;
  studentId: string;
  enrollmentId: string;
  batchId: string;
  date: string;
  startTime: string;
  reason: AbsenceReason;
  givenByRole: FamilyRoleValue;
  givenByName: string;
  givenAt: Date;
};

export type ReportPayment = {
  id: string;
  enrollmentId: string;
  amountPaise: number;
  method: "cash" | "upi" | "card" | "other";
  paidAt: Date;
  receiptNumber: string;
  recordedByUserId: string;
};

export type ReportFollowUp = {
  enrollmentId: string;
  channel: "phone" | "whatsapp_sms" | "in_person" | "other";
  loggedAt: Date;
  nextFollowUpOn: string | null;
  open: boolean;
};

export type ReportEnquiry = {
  id: string;
  prospectName: string;
  createdAt: Date;
  createdByUserId: string;
  courseId: string | null;
  subject: string | null;
  preferredClassMode: ClassModeValue | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceRetired: boolean;
  stage:
    | "new"
    | "follow_up"
    | "demo_scheduled"
    | "demo_attended"
    | "joined"
    | "not_interested";
  notInterestedReason: string | null;
  closedAt: Date | null;
  convertedAt: Date | null;
  convertedStudentId: string | null;
  nextFollowUpOn: string | null;
  followUps: number;
};

export type ReportDemo = {
  id: string;
  enquiryId: string;
  prospectName: string;
  kind: "batch" | "one_to_one";
  batchId: string | null;
  teacherId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  feeKind: "free" | "paid";
  feeAmountPaise: number | null;
  feePaidAt: Date | null;
  attendance: "unmarked" | "attended" | "missed";
  cancelledAt: Date | null;
};

export type ReportTestResult = {
  studentId: string;
  status: "scored" | "absent" | "exempt";
  marks: number | null;
  remark: string | null;
  changes: {
    oldStatus: "scored" | "absent" | "exempt";
    newStatus: "scored" | "absent" | "exempt";
    oldMarks: number | null;
    newMarks: number | null;
    changedAt: Date;
    changedByUserId: string;
  }[];
};

/** A published Test (drafts never reach Reports). */
export type ReportTest = {
  id: string;
  batchId: string;
  scope: "batch" | "student";
  studentId: string | null;
  name: string;
  heldOn: string;
  maxMarks: number;
  passMarks: number | null;
  topic: string | null;
  results: ReportTestResult[];
};

export type ReportHomework = {
  id: string;
  batchId: string;
  title: string;
  classDate: string;
  dueOn: string;
  postedAt: Date;
  removedAt: Date | null;
  /** Live Submissions; an undone Submission isn't one. */
  submissions: {
    studentId: string;
    submittedAt: Date;
    submittedByRole: FamilyRoleValue;
    checkedAt: Date | null;
    remark: string | null;
  }[];
};

export type ReportRemark = {
  studentId: string;
  month: string;
  authorUserId: string;
  authorRole: "owner" | "teacher";
  authorName: string;
  text: string;
  updatedAt: Date;
};

export type DateRange = { from: string; to: string };

export type ReportSource = {
  instituteName(workspaceId: string): Promise<string>;
  settings(workspaceId: string): Promise<ReportSettings>;
  saveSettings(
    workspaceId: string,
    settings: ReportSettings,
    userId: string,
  ): Promise<void>;
  /** The Teacher record of a signed-in Teacher, unless deactivated. */
  activeTeacher(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; name: string } | null>;
  /** Students a Student or Parent User is linked to by verified email. */
  familyStudentIds(
    workspaceId: string,
    role: FamilyRoleValue,
    verifiedEmails: readonly string[],
  ): Promise<string[]>;
  structure(workspaceId: string): Promise<ReportStructure>;
  marks(workspaceId: string, range: DateRange): Promise<ReportMark[]>;
  occurrences(
    workspaceId: string,
    range: DateRange,
  ): Promise<ReportOccurrence[]>;
  notices(workspaceId: string, range: DateRange): Promise<ReportNotice[]>;
  /** Every live Fee Payment; deleted ones never appear. */
  payments(workspaceId: string): Promise<ReportPayment[]>;
  followUps(workspaceId: string): Promise<ReportFollowUp[]>;
  enquiries(workspaceId: string): Promise<ReportEnquiry[]>;
  demos(workspaceId: string): Promise<ReportDemo[]>;
  /** Published Tests held in the range. */
  tests(workspaceId: string, range: DateRange): Promise<ReportTest[]>;
  /** Homework due in the range, removed items included. */
  homework(workspaceId: string, range: DateRange): Promise<ReportHomework[]>;
  remarks(
    workspaceId: string,
    month: string,
    studentIds: readonly string[],
  ): Promise<ReportRemark[]>;
  saveRemark(input: {
    workspaceId: string;
    studentId: string;
    month: string;
    authorUserId: string;
    authorRole: "owner" | "teacher";
    authorName: string;
    text: string | null;
    now: Date;
  }): Promise<void>;
  userNames(userIds: readonly string[]): Promise<Map<string, string>>;
};

export type ReportAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export type ReportMailer = {
  send(input: {
    to: string;
    subject: string;
    heading: string;
    lines: string[];
    attachment: ReportAttachment;
  }): Promise<void>;
};

export type ReportRenderer = {
  pdf(document: ReportDocument): Promise<Uint8Array>;
  xlsx(document: ReportDocument): Uint8Array;
};
