// Story fixtures for the Student and Parent Results page and the Home card.
// Each Student has only their own published results, newest Test date first,
// exactly as GET /api/training-institute/home/results returns them.

import {
  ASHA_ID,
  PYTHON_BATCH_ID,
  RAVI_ID,
  TALLY_BATCH_ID,
} from "@/components/class-work/family/family-class-work.fixtures";
import type {
  FamilyTestResultView,
  FamilyTestResultsView,
} from "@/src/queries/class-tests";

import type { FamilyResultsStudent } from "./family-results-format";

const python = {
  id: PYTHON_BATCH_ID,
  name: "Python Evening",
  courseName: "Python",
};
const tally = {
  id: TALLY_BATCH_ID,
  name: "Tally Morning",
  courseName: "Tally",
};

const published = (date: string) =>
  new Date(`${date}T19:00:00+05:30`).toISOString();

function result(
  overrides: Partial<FamilyTestResultView> &
    Pick<FamilyTestResultView, "testId" | "name" | "heldOn">,
): FamilyTestResultView {
  return {
    batch: python,
    maxMarks: 50,
    passMarks: 20,
    topic: null,
    scope: "batch",
    status: "scored",
    marks: 30,
    passed: true,
    remark: null,
    publishedAt: published(overrides.heldOn),
    ...overrides,
  };
}

export const functionsTest = result({
  testId: "d10e8400-e29b-41d4-a716-446655440001",
  name: "Functions test",
  heldOn: "2026-10-06",
  topic: "Functions, arguments, and return values",
  marks: 42,
  passed: true,
  remark: "Neat work on default arguments.",
});

/** A single-student Test: Asha's re-test after failing the Loops test. */
export const loopsRetest = result({
  testId: "d10e8400-e29b-41d4-a716-446655440002",
  name: "Loops re-test",
  heldOn: "2026-10-02",
  scope: "student",
  maxMarks: 25,
  passMarks: 10,
  marks: 18,
  passed: true,
  remark: "Much better. Keep practising nested loops.",
});

export const loopsTest = result({
  testId: "d10e8400-e29b-41d4-a716-446655440003",
  name: "Loops test",
  heldOn: "2026-09-28",
  maxMarks: 25,
  passMarks: 10,
  marks: 8,
  passed: false,
  remark: "Revise for and while loops before the re-test.",
});

/** No pass mark, half marks. */
export const variablesQuiz = result({
  testId: "d10e8400-e29b-41d4-a716-446655440004",
  name: "Variables quiz",
  heldOn: "2026-09-21",
  maxMarks: 20,
  passMarks: null,
  marks: 15.5,
  passed: null,
});

export const tallyAbsent = result({
  testId: "d10e8400-e29b-41d4-a716-446655440005",
  batch: tally,
  name: "Tally basics",
  heldOn: "2026-09-15",
  status: "absent",
  marks: null,
  passed: null,
  remark: "Missed this one; talk to the Teacher about a re-test.",
});

export const tallyExempt = result({
  testId: "d10e8400-e29b-41d4-a716-446655440006",
  batch: tally,
  name: "Ledgers test",
  heldOn: "2026-09-10",
  status: "exempt",
  marks: null,
  passed: null,
});

export const ashaResults: FamilyResultsStudent = {
  id: ASHA_ID,
  name: "Asha Kumar",
  results: [
    functionsTest,
    loopsRetest,
    loopsTest,
    variablesQuiz,
    tallyAbsent,
    tallyExempt,
  ],
};

export const gstTest = result({
  testId: "d10e8400-e29b-41d4-a716-446655440007",
  batch: tally,
  name: "GST entries",
  heldOn: "2026-10-05",
  maxMarks: 40,
  passMarks: 16,
  marks: 31,
  passed: true,
  remark: "Good.",
});

export const raviResults: FamilyResultsStudent = {
  id: RAVI_ID,
  name: "Ravi Kumar",
  results: [gstTest],
};

export const raviWithoutResults: FamilyResultsStudent = {
  ...raviResults,
  results: [],
};

export const studentResultsView: FamilyTestResultsView = {
  students: [ashaResults],
};

/** Words that would compare a Student with others; never on family screens. */
export const COMPARISON_WORDS =
  /\b(average|highest|lowest|rank|ranked|ranking|topper|class position)\b/i;
