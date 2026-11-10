// Story fixtures for a Student's Test history (ADR-0038).

import type {
  ClassTestBatchView,
  StudentTestHistoryItemView,
  StudentTestHistoryView,
} from "@/src/queries/class-tests";

export const HISTORY_STUDENT_ID = "880e8400-e29b-41d4-a716-446655440001";
export const HISTORY_BATCH_ID = "660e8400-e29b-41d4-a716-446655440001";
export const HISTORY_TALLY_BATCH_ID = "660e8400-e29b-41d4-a716-446655440002";

const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

export const dcaBatch: ClassTestBatchView = {
  id: HISTORY_BATCH_ID,
  name: "DCA Weekday 10–11",
  courseName: "DCA",
  timezone: "Asia/Kolkata",
  closed: false,
};

export const tallyBatch: ClassTestBatchView = {
  id: HISTORY_TALLY_BATCH_ID,
  name: "Tally Evening",
  courseName: "Tally Prime",
  timezone: "Asia/Kolkata",
  closed: false,
};

const student = { id: HISTORY_STUDENT_ID, name: "Asha Rao" };

function historyItem(
  overrides: Partial<StudentTestHistoryItemView> & {
    id: string;
    name: string;
    heldOn: string;
  },
): StudentTestHistoryItemView {
  const batch = overrides.batch ?? dcaBatch;
  return {
    batchId: batch.id,
    batch,
    maxMarks: 50,
    passMarks: 20,
    topic: null,
    scope: "batch",
    student: null,
    createdBy: { role: "teacher", teacherName: "Meena Iyer" },
    createdAt: at(overrides.heldOn),
    updatedAt: at(overrides.heldOn),
    publishedAt: at(overrides.heldOn, "18:00"),
    result: null,
    ...overrides,
  };
}

/** Saved but not published: families can't see it yet. */
export const draftTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440001",
  name: "Excel formulas quiz",
  heldOn: "2026-10-07",
  publishedAt: null,
  result: {
    status: "scored",
    marks: 41.5,
    remark: null,
    passed: true,
    updatedAt: at("2026-10-07", "12:00"),
  },
});

/** A draft where this Student is still blank. */
export const blankDraftTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440002",
  name: "Tally vouchers practical",
  heldOn: "2026-10-06",
  batch: tallyBatch,
  maxMarks: 100,
  passMarks: 40,
  publishedAt: null,
  result: null,
});

export const failedTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440003",
  name: "MS Word unit test",
  heldOn: "2026-10-01",
  result: {
    status: "scored",
    marks: 14,
    remark: "Revise mail merge and page setup.",
    passed: false,
    updatedAt: at("2026-10-01", "18:00"),
  },
});

export const singleStudentTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440004",
  name: "MS Word unit test (re-test)",
  heldOn: "2026-10-03",
  scope: "student",
  student,
  result: {
    status: "scored",
    marks: 34,
    remark: "Much better. Mail merge is clear now.",
    passed: true,
    updatedAt: at("2026-10-03", "18:00"),
  },
});

export const absentTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440005",
  name: "Typing speed test",
  heldOn: "2026-09-24",
  maxMarks: 20,
  passMarks: null,
  result: {
    status: "absent",
    marks: null,
    remark: "Was unwell.",
    passed: null,
    updatedAt: at("2026-09-24", "18:00"),
  },
});

export const exemptTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440006",
  name: "Tally basics quiz",
  heldOn: "2026-09-18",
  batch: tallyBatch,
  maxMarks: 25,
  passMarks: 10,
  result: {
    status: "exempt",
    marks: null,
    remark: "Joined after this topic.",
    passed: null,
    updatedAt: at("2026-09-18", "18:00"),
  },
});

/** Scored, no pass mark. */
export const noPassMarkTest = historyItem({
  id: "b10e8400-e29b-41d4-a716-446655440007",
  name: "Computer basics quiz",
  heldOn: "2026-09-10",
  maxMarks: 10,
  passMarks: null,
  result: {
    status: "scored",
    marks: 9,
    remark: null,
    passed: null,
    updatedAt: at("2026-09-10", "18:00"),
  },
});

/** Newest first, as the server sends it. */
export function historyView(
  overrides: Partial<StudentTestHistoryView> = {},
): StudentTestHistoryView {
  return {
    student,
    tests: [
      draftTest,
      blankDraftTest,
      singleStudentTest,
      failedTest,
      absentTest,
      exemptTest,
      noPassMarkTest,
    ],
    ...overrides,
  };
}
