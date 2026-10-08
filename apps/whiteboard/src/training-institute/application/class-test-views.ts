// Read models for Tests and results (ADR-0037). The HTTP models and the
// client query types match these exactly.

import type { TestResultStatus, TestScope } from "../domain/class-test";
import type { PostedByView } from "./class-work-views";

export type ClassTestBatchView = {
  id: string;
  name: string;
  courseName: string;
  timezone: string;
  closed: boolean;
};

export type TestResultValueView = {
  status: TestResultStatus;
  /** Null unless scored. */
  marks: number | null;
  remark: string | null;
};

export type TestResultView = TestResultValueView & {
  /** Null when the Test has no pass mark or the Student wasn't scored. */
  passed: boolean | null;
  updatedAt: string;
};

export type TestStudentView = { id: string; name: string };

/** Numbers for staff. Average, highest, and lowest count scored results only. */
export type TestSummaryView = {
  listed: number;
  /** Listed Students with a result. */
  entered: number;
  tested: number;
  absent: number;
  exempt: number;
  /** Null for a single-student Test, which is left out of Batch numbers. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
  belowPass: (TestStudentView & { marks: number })[];
  absentStudents: TestStudentView[];
  exemptStudents: TestStudentView[];
};

export type ClassTestView = {
  id: string;
  batchId: string;
  name: string;
  /** YYYY-MM-DD in the Batch's timezone. */
  heldOn: string;
  maxMarks: number;
  passMarks: number | null;
  topic: string | null;
  scope: TestScope;
  /** The Student a single-student Test is for. */
  student: TestStudentView | null;
  createdBy: PostedByView;
  createdAt: string;
  updatedAt: string;
  /** Null while the Test is a draft. */
  publishedAt: string | null;
};

export type StaffClassTestView = ClassTestView & { summary: TestSummaryView };

/** A Student a Test can be set for: their time in the Batch as local dates. */
export type BatchTestStudentView = TestStudentView & {
  start: string;
  end: string | null;
};

export type BatchTestsView = {
  batch: ClassTestBatchView;
  /** Today in the Batch's timezone; the latest allowed Test date. */
  today: string;
  /** The day the Batch was created; the earliest allowed Test date. */
  firstDate: string;
  /** Whether a new Test can be created (the Batch is open). */
  canCreate: boolean;
  students: BatchTestStudentView[];
  /** Newest Test date first. */
  tests: StaffClassTestView[];
};

export type TestResultChangeView = {
  changedAt: string;
  changedBy: PostedByView;
  before: TestResultValueView;
  after: TestResultValueView;
};

export type TestRosterRowView = {
  student: TestStudentView;
  /** Null while blank. */
  result: TestResultView | null;
  /** Changes made after publishing, newest first. */
  history: TestResultChangeView[];
};

export type ClassTestDetailView = {
  batch: ClassTestBatchView;
  today: string;
  firstDate: string;
  test: StaffClassTestView;
  /** Only an unpublished Test can be deleted. */
  canDelete: boolean;
  /** Listed Students by name. */
  rows: TestRosterRowView[];
};

export type StudentTestHistoryItemView = ClassTestView & {
  batch: ClassTestBatchView;
  /** Null when the Student is listed on a draft but still blank. */
  result: TestResultView | null;
};

export type StudentTestHistoryView = {
  student: TestStudentView;
  /** Newest Test date first, drafts included. */
  tests: StudentTestHistoryItemView[];
};

/** A published result as the Student and linked Parents see it. */
export type FamilyTestResultView = {
  testId: string;
  batch: { id: string; name: string; courseName: string };
  name: string;
  heldOn: string;
  maxMarks: number;
  passMarks: number | null;
  topic: string | null;
  scope: TestScope;
  status: TestResultStatus;
  marks: number | null;
  passed: boolean | null;
  remark: string | null;
  publishedAt: string;
};

export type FamilyTestResultsView = {
  /** One item for a Student; one per linked Student for a Parent. */
  students: (TestStudentView & {
    /** Newest Test date first. */
    results: FamilyTestResultView[];
  })[];
};
