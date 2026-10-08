import { queryOptions } from "@tanstack/react-query";

import type {
  BatchTestsView,
  ClassTestDetailView,
  FamilyTestResultsView,
  StudentTestHistoryView,
} from "@/src/training-institute/application/class-test-views";

import { apiJson } from "./http";

export type {
  BatchTestStudentView,
  BatchTestsView,
  ClassTestBatchView,
  ClassTestDetailView,
  ClassTestView,
  FamilyTestResultView,
  FamilyTestResultsView,
  StaffClassTestView,
  StudentTestHistoryItemView,
  StudentTestHistoryView,
  TestResultChangeView,
  TestResultValueView,
  TestResultView,
  TestRosterRowView,
  TestStudentView,
  TestSummaryView,
} from "@/src/training-institute/application/class-test-views";
export type {
  TestResultStatus,
  TestScope,
} from "@/src/training-institute/domain/class-test";

const BASE = "/api/training-institute";

/** Whole numbers, 1 to 1000 (ADR-0037). */
export const TEST_MAX_MARKS_LIMIT = 1000;
export const TEST_NAME_MAX = 200;
export const TEST_TOPIC_MAX = 1000;
export const TEST_REMARK_MAX = 500;
/** Latest published results on Student Home and Parent Home. */
export const HOME_RESULT_COUNT = 5;

export type ClassTestInput = {
  name: string;
  /** YYYY-MM-DD, from the Batch's first day through today. */
  heldOn: string;
  maxMarks: number;
  passMarks: number | null;
  topic: string | null;
};

export type CreateClassTestInput = ClassTestInput & {
  /** Set for a single-student Test, such as a re-test. */
  studentId: string | null;
};

export type TestResultInput = {
  studentId: string;
  /** Null leaves the Student blank; only a draft allows it. */
  status: "scored" | "absent" | "exempt" | null;
  /** Whole or half marks; null unless scored. */
  marks: number | null;
  remark: string | null;
};

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const classTestQueries = {
  key: {
    all: ["class-tests"] as const,
    batch: (batchId: string) => ["class-tests", "batch", batchId] as const,
    detail: (testId: string) => ["class-tests", "detail", testId] as const,
    student: (studentId: string) =>
      ["class-tests", "student", studentId] as const,
    family: ["class-tests", "family"] as const,
  },
  /** A Batch's Tests with staff numbers (Owner or assigned Teacher). */
  batch: (batchId: string) =>
    queryOptions({
      queryKey: classTestQueries.key.batch(batchId),
      queryFn: () =>
        apiJson<BatchTestsView>(`${BASE}/batches/${batchId}/tests`),
    }),
  /** One Test with every listed Student's result and change history. */
  detail: (testId: string) =>
    queryOptions({
      queryKey: classTestQueries.key.detail(testId),
      queryFn: () => apiJson<ClassTestDetailView>(`${BASE}/tests/${testId}`),
    }),
  /** A Student's Test history, drafts included (Owner: every Batch). */
  student: (studentId: string) =>
    queryOptions({
      queryKey: classTestQueries.key.student(studentId),
      queryFn: () =>
        apiJson<StudentTestHistoryView>(`${BASE}/students/${studentId}/tests`),
    }),
  /** `sessionScope` keeps one User's cache from showing for another. */
  family: (sessionScope: string) =>
    queryOptions({
      queryKey: [...classTestQueries.key.family, sessionScope] as const,
      queryFn: () => apiJson<FamilyTestResultsView>(`${BASE}/home/results`),
    }),
};

export function createClassTest(
  batchId: string,
  input: CreateClassTestInput,
): Promise<ClassTestDetailView> {
  return post(`/batches/${batchId}/tests`, input);
}

export function updateClassTest(
  testId: string,
  input: ClassTestInput,
): Promise<ClassTestDetailView> {
  return post(`/tests/${testId}/update`, input);
}

/** Saves results. Never publishes. */
export function saveTestResults(
  testId: string,
  results: TestResultInput[],
): Promise<ClassTestDetailView> {
  return post(`/tests/${testId}/results`, { results });
}

export function publishClassTest(testId: string): Promise<ClassTestDetailView> {
  return post(`/tests/${testId}/publish`);
}

export function deleteClassTest(testId: string): Promise<{ id: string }> {
  return post(`/tests/${testId}/delete`);
}

/** 37.5 stays 37.5; 38 shows as 38. */
export function formatMarks(marks: number): string {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(1);
}
