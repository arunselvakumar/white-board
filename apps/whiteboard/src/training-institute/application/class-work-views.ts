// Read models for Study Material, Homework, and Submissions (ADR-0033).
// The HTTP models and the client query types match these exactly.

import type { FamilyRole } from "./family-links";

/** The Owner, or a Teacher assigned to the Batch. */
export type ClassWorkStaff = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

/** A Student User or Parent User linked to Students by verified email. */
export type ClassWorkFamily = {
  workspaceId: string;
  userId: string;
  role: FamilyRole;
  verifiedEmails: readonly string[];
};

export type AttachmentMimeType = "application/pdf" | "image/jpeg" | "image/png";

export type AttachmentView = {
  id: string;
  name: string;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
};

export type PostedByView = {
  role: "owner" | "teacher";
  /** The Teacher's name when a Teacher posted it. */
  teacherName: string | null;
};

export type StudyMaterialView = {
  id: string;
  batchId: string;
  title: string;
  note: string | null;
  linkUrl: string | null;
  /** YYYY-MM-DD, the Class it goes with, if any. */
  classDate: string | null;
  postedBy: PostedByView;
  postedAt: string;
  updatedAt: string;
  /** Only the Owner ever sees a removed item. */
  removedAt: string | null;
  attachments: AttachmentView[];
};

export type HomeworkView = {
  id: string;
  batchId: string;
  title: string;
  instructions: string;
  /** YYYY-MM-DD, the Class the Homework follows from. */
  classDate: string;
  /** YYYY-MM-DD; due by the end of this date in the Batch's timezone. */
  dueOn: string;
  postedBy: PostedByView;
  postedAt: string;
  updatedAt: string;
  removedAt: string | null;
  attachments: AttachmentView[];
};

export type HomeworkCountsView = {
  /** Submitted on time, checked or not. */
  submitted: number;
  /** Submitted after the due date, checked or not. */
  late: number;
  /** Owed by a Student in the Batch and not submitted yet. */
  notSubmitted: number;
  checked: number;
};

export type StaffHomeworkView = HomeworkView & { counts: HomeworkCountsView };

export type ClassWorkBatchView = {
  id: string;
  name: string;
  courseName: string;
  classMode: "offline" | "online" | "hybrid";
  timezone: string;
  closed: boolean;
};

export type ClassDateView = {
  date: string;
  startTime: string;
  endTime: string;
};

export type BatchClassWorkView = {
  batch: ClassWorkBatchView;
  /** Today in the Batch's timezone. */
  today: string;
  /** False once the Batch is closed: nothing can be posted or edited. */
  canEdit: boolean;
  /** Classes that happen, the last 60 days and the next 14, newest first. */
  classDates: ClassDateView[];
  /** Newest first. */
  materials: StudyMaterialView[];
  /** By Class date, newest first. */
  homework: StaffHomeworkView[];
};

export type SubmissionView = {
  id: string;
  note: string | null;
  /** When it was first marked done; Late compares this with the due date. */
  submittedAt: string;
  submittedBy: "student" | "parent";
  updatedAt: string;
  late: boolean;
  checkedAt: string | null;
  remark: string | null;
  attachments: AttachmentView[];
};

export type HomeworkRosterStatus = "submitted" | "late" | "not_submitted";

export type HomeworkRosterRowView = {
  studentId: string;
  studentName: string;
  status: HomeworkRosterStatus;
  /** False for a Student who has since left the Batch. */
  inBatch: boolean;
  submission: SubmissionView | null;
};

export type HomeworkSubmissionsView = {
  batch: ClassWorkBatchView;
  today: string;
  homework: HomeworkView;
  counts: HomeworkCountsView;
  /** Not submitted first, then late, then submitted; by name within each. */
  students: HomeworkRosterRowView[];
};

/**
 * - due: owed, not submitted, due date not passed
 * - overdue: owed, not submitted, past the due date
 * - submitted / late: marked done, not checked yet
 * - checked: the Teacher checked it (see `submission.late` and `remark`)
 * - reference: not owed (due before the Student joined, or they left) and not submitted
 */
export type FamilyHomeworkStatus =
  "due" | "overdue" | "submitted" | "late" | "checked" | "reference";

export type FamilyBatchView = {
  id: string;
  name: string;
  courseName: string;
  timezone: string;
  /** Ended once the Student left the Batch, the Batch closed, or the Student was dropped. */
  access: "active" | "ended";
};

export type FamilyHomeworkView = Omit<HomeworkView, "removedAt"> & {
  status: FamilyHomeworkStatus;
  /** True while the Student is in the Batch and the Submission isn't checked. */
  canSubmit: boolean;
  submission: SubmissionView | null;
};

export type FamilyStudyMaterialView = Omit<StudyMaterialView, "removedAt">;

export type FamilyClassWorkStudentView = {
  id: string;
  name: string;
  batches: FamilyBatchView[];
  /** By Class date, newest first. */
  homework: FamilyHomeworkView[];
  /** Newest first. */
  materials: FamilyStudyMaterialView[];
};

export type FamilyClassWorkView = { students: FamilyClassWorkStudentView[] };
