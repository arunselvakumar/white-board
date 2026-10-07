import type {
  ClassChangeFact,
  HolidayFact,
  ScheduleSlot,
} from "../domain/class-schedule";
import type { FamilyRole } from "./family-links";
import type {
  AttachmentMimeType,
  AttachmentView,
  ClassWorkBatchView,
} from "./class-work-views";

export type ClassWorkBatch = ClassWorkBatchView & {
  timings: ScheduleSlot[];
  createdAt: Date;
};

/** Student-specific Timings of an Enrollment in the Batch (home tuition). */
export type StudentTimingSource = {
  timings: ScheduleSlot[];
  from: Date;
  until: Date | null;
};

export type PosterRecord = {
  userId: string;
  role: "owner" | "teacher";
  teacherId: string | null;
  teacherName: string | null;
};

export type StudyMaterialRecord = {
  id: string;
  batchId: string;
  title: string;
  note: string | null;
  linkUrl: string | null;
  classDate: string | null;
  postedBy: PosterRecord;
  postedAt: Date;
  updatedAt: Date;
  removedAt: Date | null;
  attachments: AttachmentView[];
};

export type HomeworkRecord = {
  id: string;
  batchId: string;
  title: string;
  instructions: string;
  classDate: string;
  dueOn: string;
  postedBy: PosterRecord;
  postedAt: Date;
  updatedAt: Date;
  removedAt: Date | null;
  attachments: AttachmentView[];
};

export type SubmissionRecord = {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  note: string | null;
  submittedAt: Date;
  submittedByRole: "student" | "parent";
  updatedAt: Date;
  checkedAt: Date | null;
  remark: string | null;
  attachments: AttachmentView[];
};

/** A Student's Enrollment in a Batch, for access and the Teacher's list. */
export type BatchEnrollmentRecord = {
  studentId: string;
  studentName: string;
  batchId: string;
  createdAt: Date;
  endedAt: Date | null;
  studentDroppedAt: Date | null;
  batchClosedAt: Date | null;
};

export type AttachmentOwner =
  | { kind: "study_material"; id: string }
  | { kind: "homework"; id: string }
  | { kind: "submission"; id: string };

export type StoredAttachment = AttachmentView & {
  owner: AttachmentOwner | null;
  uploadedByUserId: string;
  uploadedAt: Date;
};

export type AttachmentFile = {
  name: string;
  mimeType: AttachmentMimeType;
  bytes: Uint8Array;
  owner: AttachmentOwner | null;
};

/** Persistence for Study Material, Homework, Submissions, and attachments. */
export type ClassWorkStore = {
  /** Runs `work` in one transaction; row locks last until it ends. */
  transaction<T>(work: (store: ClassWorkStore) => Promise<T>): Promise<T>;

  activeTeacherForUser(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; name: string } | null>;
  isAssigned(
    workspaceId: string,
    teacherId: string,
    batchId: string,
  ): Promise<boolean>;
  batch(workspaceId: string, batchId: string): Promise<ClassWorkBatch | null>;
  studentTimings(
    workspaceId: string,
    batchId: string,
  ): Promise<StudentTimingSource[]>;
  classExceptions(
    workspaceId: string,
    batchId: string,
  ): Promise<{ changes: ClassChangeFact[]; holidays: HolidayFact[] }>;

  /** Newest first. */
  studyMaterials(
    workspaceId: string,
    batchIds: readonly string[],
    includeRemoved: boolean,
  ): Promise<StudyMaterialRecord[]>;
  /** By Class date, then posting time, newest first. */
  homework(
    workspaceId: string,
    batchIds: readonly string[],
    includeRemoved: boolean,
  ): Promise<HomeworkRecord[]>;
  findStudyMaterial(
    workspaceId: string,
    id: string,
  ): Promise<StudyMaterialRecord | null>;
  findHomework(workspaceId: string, id: string): Promise<HomeworkRecord | null>;
  /** Locks the Homework row so Submissions and checks run one at a time. */
  lockHomework(workspaceId: string, id: string): Promise<void>;

  insertStudyMaterial(
    workspaceId: string,
    record: Omit<StudyMaterialRecord, "attachments" | "removedAt">,
  ): Promise<void>;
  updateStudyMaterial(
    workspaceId: string,
    id: string,
    content: Pick<
      StudyMaterialRecord,
      "title" | "note" | "linkUrl" | "classDate"
    >,
    userId: string,
    now: Date,
  ): Promise<void>;
  removeStudyMaterial(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void>;
  insertHomework(
    workspaceId: string,
    record: Omit<HomeworkRecord, "attachments" | "removedAt">,
  ): Promise<void>;
  updateHomework(
    workspaceId: string,
    id: string,
    content: Pick<
      HomeworkRecord,
      "title" | "instructions" | "classDate" | "dueOn"
    >,
    userId: string,
    now: Date,
  ): Promise<void>;
  removeHomework(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void>;

  /** Enrollments in these Batches that aren't deleted, ended ones included. */
  batchEnrollments(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<BatchEnrollmentRecord[]>;
  /** Live (not undone) Submissions to these Homework. */
  submissions(
    workspaceId: string,
    homeworkIds: readonly string[],
  ): Promise<SubmissionRecord[]>;
  liveSubmission(
    workspaceId: string,
    homeworkId: string,
    studentId: string,
  ): Promise<SubmissionRecord | null>;
  findSubmission(
    workspaceId: string,
    homeworkId: string,
    id: string,
  ): Promise<SubmissionRecord | null>;
  insertSubmission(
    workspaceId: string,
    record: {
      id: string;
      homeworkId: string;
      studentId: string;
      note: string | null;
      userId: string;
      role: "student" | "parent";
      now: Date;
    },
  ): Promise<void>;
  updateSubmission(
    workspaceId: string,
    id: string,
    change: {
      note: string | null;
      userId: string;
      role: "student" | "parent";
      now: Date;
    },
  ): Promise<void>;
  withdrawSubmission(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void>;
  /** Sets the remark; `checkedAt` stays the first check time on edits. */
  checkSubmission(
    workspaceId: string,
    id: string,
    remark: string | null,
    userId: string,
    checkedAt: Date,
  ): Promise<void>;

  /** Students linked to a Student or Parent User, dropped ones included. */
  familyStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<{ id: string; name: string; droppedAt: Date | null }[]>;
  /** Not-deleted Enrollments of these Students, with their Batch. */
  studentEnrollments(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<(BatchEnrollmentRecord & { batch: ClassWorkBatchView })[]>;

  /** Files attached to this item now, plus unattached uploads by this User. */
  attachmentsFor(
    workspaceId: string,
    owner: AttachmentOwner | null,
    ids: readonly string[],
    userId: string,
  ): Promise<StoredAttachment[]>;
  /** Attaches `attach` to the owner and soft-deletes `detach`. */
  setAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    change: { attach: string[]; detach: string[] },
    userId: string,
    now: Date,
  ): Promise<void>;
  insertUpload(
    workspaceId: string,
    upload: AttachmentView & { bytes: Uint8Array; userId: string; now: Date },
  ): Promise<void>;
  /** Deletes this User's unattached uploads made before `before`; counts the rest. */
  purgeUploads(
    workspaceId: string,
    userId: string,
    before: Date,
  ): Promise<number>;
  attachmentFile(
    workspaceId: string,
    id: string,
  ): Promise<AttachmentFile | null>;
  /** The Homework a Submission answers, and whose it is. */
  submissionOwner(
    workspaceId: string,
    submissionId: string,
  ): Promise<{
    homeworkId: string;
    studentId: string;
    withdrawn: boolean;
  } | null>;
};
