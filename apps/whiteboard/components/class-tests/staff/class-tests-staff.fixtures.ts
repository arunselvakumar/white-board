// Story data for the staff Test screens. A DCA Batch with seven Students:
// Ravi left on 1 Oct and Sanjay joined that day.

import type {
  BatchTestStudentView,
  BatchTestsView,
  ClassTestBatchView,
  ClassTestDetailView,
  StaffClassTestView,
  TestResultView,
  TestRosterRowView,
  TestSummaryView,
} from "@/src/queries/class-tests";

export const TODAY = "2026-10-07";
export const FIRST_DATE = "2026-08-03";
export const BATCH_ID = "660e8400-e29b-41d4-a716-446655440001";
export const OWNER_TESTS = `/batches/${BATCH_ID}/tests`;
export const TEACHER_TESTS = `/teacher/batches/${BATCH_ID}/tests`;
export const TEACHER_STUDENTS = `/teacher/batches/${BATCH_ID}/students`;

export const UNIT_2_ID = "b20e8400-e29b-41d4-a716-446655440002";
export const UNIT_1_ID = "b20e8400-e29b-41d4-a716-446655440001";
export const RETEST_ID = "b20e8400-e29b-41d4-a716-446655440003";

export const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

export const batch: ClassTestBatchView = {
  id: BATCH_ID,
  name: "DCA Weekday 10–11",
  courseName: "DCA",
  timezone: "Asia/Kolkata",
  closed: false,
};

export const meena = { role: "teacher" as const, teacherName: "Meena Iyer" };
export const owner = { role: "owner" as const, teacherName: null };

const id = (n: number) => `880e8400-e29b-41d4-a716-44665544000${String(n)}`;

export const arjun = { id: id(1), name: "Arjun Nair" };
export const asha = { id: id(2), name: "Asha Menon" };
export const divya = { id: id(3), name: "Divya Raj" };
export const fathima = { id: id(4), name: "Fathima Begum" };
export const priya = { id: id(5), name: "Priya Sharma" };
export const ravi = { id: id(6), name: "Ravi Kumar" };
export const sanjay = { id: id(7), name: "Sanjay Pillai" };

export const students: BatchTestStudentView[] = [
  { ...arjun, start: "2026-08-03", end: null },
  { ...asha, start: "2026-08-03", end: null },
  { ...divya, start: "2026-08-10", end: null },
  { ...fathima, start: "2026-08-03", end: null },
  { ...priya, start: "2026-08-03", end: null },
  { ...ravi, start: "2026-08-03", end: "2026-10-01" },
  { ...sanjay, start: "2026-10-01", end: null },
];

function summary(overrides: Partial<TestSummaryView> = {}): TestSummaryView {
  return {
    listed: 6,
    entered: 6,
    tested: 6,
    absent: 0,
    exempt: 0,
    average: null,
    highest: null,
    lowest: null,
    belowPass: [],
    absentStudents: [],
    exemptStudents: [],
    ...overrides,
  };
}

/** Draft, partly entered: 4 of 6 entered. */
export const unit2: StaffClassTestView = {
  id: UNIT_2_ID,
  batchId: BATCH_ID,
  name: "Unit test 2: IF and VLOOKUP",
  heldOn: "2026-10-06",
  maxMarks: 50,
  passMarks: 20,
  topic: "IF, nested IF, and VLOOKUP with exact match.",
  scope: "batch",
  student: null,
  createdBy: meena,
  createdAt: at("2026-10-06", "11:05"),
  updatedAt: at("2026-10-06", "11:05"),
  publishedAt: null,
  summary: summary({
    entered: 4,
    tested: 3,
    absent: 1,
    average: 31.5,
    highest: 44,
    lowest: 12.5,
    belowPass: [{ ...divya, marks: 12.5 }],
    absentStudents: [fathima],
  }),
};

/** Published, every Student has a result. */
export const unit1: StaffClassTestView = {
  id: UNIT_1_ID,
  batchId: BATCH_ID,
  name: "Unit test 1: Excel basics",
  heldOn: "2026-09-22",
  maxMarks: 50,
  passMarks: 20,
  topic: null,
  scope: "batch",
  student: null,
  createdBy: owner,
  createdAt: at("2026-09-22", "17:30"),
  updatedAt: at("2026-09-22", "17:30"),
  publishedAt: at("2026-09-23", "09:15"),
  summary: summary({
    listed: 6,
    entered: 6,
    tested: 4,
    absent: 1,
    exempt: 1,
    average: 35.4,
    highest: 47,
    lowest: 18,
    belowPass: [{ ...ravi, marks: 18 }],
    absentStudents: [divya],
    exemptStudents: [priya],
  }),
};

/** A re-test for Ravi, published. */
export const retest: StaffClassTestView = {
  id: RETEST_ID,
  batchId: BATCH_ID,
  name: "Unit test 1 re-test",
  heldOn: "2026-09-29",
  maxMarks: 50,
  passMarks: 20,
  topic: null,
  scope: "student",
  student: ravi,
  createdBy: meena,
  createdAt: at("2026-09-29", "12:00"),
  updatedAt: at("2026-09-29", "12:00"),
  publishedAt: at("2026-09-29", "18:00"),
  summary: summary({
    listed: 1,
    entered: 1,
    tested: 1,
  }),
};

export function batchTestsView(
  overrides: Partial<BatchTestsView> = {},
): BatchTestsView {
  return {
    batch,
    today: TODAY,
    firstDate: FIRST_DATE,
    canCreate: true,
    students,
    tests: [unit2, retest, unit1],
    ...overrides,
  };
}

function scored(
  marks: number,
  passMarks: number | null,
  remark: string | null = null,
): TestResultView {
  return {
    status: "scored",
    marks,
    remark,
    passed: passMarks == null ? null : marks >= passMarks,
    updatedAt: at("2026-10-06", "12:00"),
  };
}

function other(status: "absent" | "exempt"): TestResultView {
  return {
    status,
    marks: null,
    remark: null,
    passed: null,
    updatedAt: at("2026-10-06", "12:00"),
  };
}

function row(
  student: { id: string; name: string },
  result: TestResultView | null,
  history: TestRosterRowView["history"] = [],
): TestRosterRowView {
  return { student, result, history };
}

/** Unit test 2 as a draft: Arjun and Sanjay are still blank. */
export function draftDetail(
  overrides: Partial<ClassTestDetailView> = {},
): ClassTestDetailView {
  return {
    batch,
    today: TODAY,
    firstDate: FIRST_DATE,
    test: unit2,
    canDelete: true,
    rows: [
      row(arjun, null),
      row(asha, scored(44, 20, "Neat work.")),
      row(divya, scored(12.5, 20)),
      row(fathima, other("absent")),
      row(priya, scored(38, 20)),
      row(sanjay, null),
    ],
    ...overrides,
  };
}

/** Unit test 2 with every row filled, ready to publish. */
export function completeDraftDetail(): ClassTestDetailView {
  const view = draftDetail();
  return {
    ...view,
    test: {
      ...unit2,
      summary: { ...unit2.summary, entered: 6, tested: 5 },
    },
    rows: [
      row(arjun, scored(29, 20)),
      ...view.rows.slice(1, 5),
      row(sanjay, other("exempt")),
    ],
  };
}

/** Unit test 1, published; Asha's marks were corrected from 34 to 38. */
export function publishedDetail(
  overrides: Partial<ClassTestDetailView> = {},
): ClassTestDetailView {
  return {
    batch,
    today: TODAY,
    firstDate: FIRST_DATE,
    test: unit1,
    canDelete: false,
    rows: [
      row(arjun, scored(41, 20)),
      row(asha, scored(38, 20, "Retotalled."), [
        {
          changedAt: at("2026-09-25", "16:40"),
          changedBy: meena,
          before: { status: "scored", marks: 34, remark: null },
          after: { status: "scored", marks: 38, remark: "Retotalled." },
        },
      ]),
      row(divya, other("absent")),
      row(fathima, scored(47, 20)),
      row(priya, other("exempt")),
      row(ravi, scored(18, 20)),
    ],
    ...overrides,
  };
}
