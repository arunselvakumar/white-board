import type { TestDetails, TestResult, TestScope } from "../domain/class-test";
import type { BatchEnrollmentRecord, PosterRecord } from "./class-work-ports";
import type { FamilyRole } from "./family-links";
import type { ClassTestBatchView, TestStudentView } from "./class-test-views";

export type ClassTestBatch = ClassTestBatchView & { createdAt: Date };

export type ClassTestRecord = TestDetails & {
  id: string;
  batchId: string;
  scope: TestScope;
  student: TestStudentView | null;
  createdBy: PosterRecord;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type TestResultRecord = TestResult & {
  id: string;
  testId: string;
  studentId: string;
  studentName: string;
  updatedAt: Date;
};

export type TestResultChangeRecord = {
  resultId: string;
  before: TestResult;
  after: TestResult;
  changedBy: { role: "owner" | "teacher"; teacherName: string | null };
  changedAt: Date;
};

/** A published result with its Test and Batch, for the family. */
export type FamilyTestResultRecord = {
  result: TestResultRecord;
  test: ClassTestRecord;
  batch: ClassTestBatchView;
};

/** Persistence for Tests, results, and the change history. */
export type ClassTestStore = {
  /** Runs `work` in one transaction; row locks last until it ends. */
  transaction<T>(work: (store: ClassTestStore) => Promise<T>): Promise<T>;

  activeTeacherForUser(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; name: string } | null>;
  isAssigned(
    workspaceId: string,
    teacherId: string,
    batchId: string,
  ): Promise<boolean>;
  /** Batches the Teacher is assigned to now. */
  assignedBatchIds(workspaceId: string, teacherId: string): Promise<string[]>;
  batch(workspaceId: string, batchId: string): Promise<ClassTestBatch | null>;
  batches(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassTestBatch[]>;
  student(
    workspaceId: string,
    studentId: string,
  ): Promise<TestStudentView | null>;

  /** Enrollments in these Batches that aren't deleted, ended ones included. */
  batchEnrollments(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<BatchEnrollmentRecord[]>;
  /** Batches this Student has had an Enrollment in. */
  studentBatchIds(workspaceId: string, studentId: string): Promise<string[]>;

  /** Tests in these Batches that aren't deleted. */
  tests(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassTestRecord[]>;
  findTest(workspaceId: string, id: string): Promise<ClassTestRecord | null>;
  /** Locks the Test row so saves and publishing run one at a time. */
  lockTest(workspaceId: string, id: string): Promise<void>;
  insertTest(
    workspaceId: string,
    record: Omit<ClassTestRecord, "updatedAt" | "publishedAt">,
  ): Promise<void>;
  updateTest(
    workspaceId: string,
    id: string,
    details: TestDetails,
    userId: string,
    now: Date,
  ): Promise<void>;
  publishTest(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void>;
  deleteTest(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void>;

  /** Results on these Tests, of Students that aren't deleted. */
  results(
    workspaceId: string,
    testIds: readonly string[],
  ): Promise<TestResultRecord[]>;
  insertResult(
    workspaceId: string,
    record: {
      id: string;
      testId: string;
      studentId: string;
      result: TestResult;
      userId: string;
      now: Date;
    },
  ): Promise<void>;
  updateResult(
    workspaceId: string,
    id: string,
    result: TestResult,
    userId: string,
    now: Date,
  ): Promise<void>;
  deleteResult(workspaceId: string, id: string): Promise<void>;
  insertChange(
    workspaceId: string,
    change: {
      id: string;
      resultId: string;
      before: TestResult;
      after: TestResult;
      changedBy: PosterRecord;
      now: Date;
    },
  ): Promise<void>;
  /** Newest first. */
  changes(
    workspaceId: string,
    resultIds: readonly string[],
  ): Promise<TestResultChangeRecord[]>;

  /** Students linked to a Student or Parent User, dropped ones included. */
  familyStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<TestStudentView[]>;
  /** Published results of these Students on Tests that aren't deleted. */
  publishedResults(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<FamilyTestResultRecord[]>;
};
