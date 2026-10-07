// Story fixtures for the Student and Parent Homework screens and Home cards.
// "Today" is Wed, 7 Oct 2026 in Asia/Kolkata.

import type {
  AttachmentView,
  FamilyBatchView,
  FamilyClassWorkStudentView,
  FamilyHomeworkView,
  FamilyStudyMaterialView,
  SubmissionView,
} from "@/src/queries/class-work";

/** 2026-10-07 09:00 in Asia/Kolkata. */
export const CLASS_WORK_NOW = new Date("2026-10-07T03:30:00.000Z");

export const ASHA_ID = "880e8400-e29b-41d4-a716-446655440000";
export const RAVI_ID = "770e8400-e29b-41d4-a716-446655440000";
export const PYTHON_BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";
export const TALLY_BATCH_ID = "440e8400-e29b-41d4-a716-446655440000";

const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

export const pythonBatch: FamilyBatchView = {
  id: PYTHON_BATCH_ID,
  name: "Python Evening",
  courseName: "Python",
  timezone: "Asia/Kolkata",
  access: "active",
};

export const tallyBatch: FamilyBatchView = {
  id: TALLY_BATCH_ID,
  name: "Tally Morning",
  courseName: "Tally",
  timezone: "Asia/Kolkata",
  access: "ended",
};

const worksheet: AttachmentView = {
  id: "a10e8400-e29b-41d4-a716-446655440001",
  name: "loops-worksheet.pdf",
  mimeType: "application/pdf",
  sizeBytes: 182_000,
};

const photo: AttachmentView = {
  id: "a10e8400-e29b-41d4-a716-446655440002",
  name: "my-answers.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 640_000,
};

const meena = { role: "teacher" as const, teacherName: "Meena Iyer" };

function homework(
  overrides: Partial<FamilyHomeworkView> &
    Pick<FamilyHomeworkView, "id" | "title" | "classDate" | "dueOn" | "status">,
): FamilyHomeworkView {
  return {
    batchId: PYTHON_BATCH_ID,
    instructions: "Write the programs in your notebook.",
    postedBy: meena,
    postedAt: at(overrides.classDate, "19:15"),
    updatedAt: at(overrides.classDate, "19:15"),
    attachments: [],
    canSubmit: true,
    submission: null,
    ...overrides,
  };
}

function submission(overrides: Partial<SubmissionView>): SubmissionView {
  return {
    id: "c10e8400-e29b-41d4-a716-446655440000",
    note: null,
    submittedAt: at("2026-10-02", "20:30"),
    submittedBy: "student",
    updatedAt: at("2026-10-02", "20:30"),
    late: false,
    checkedAt: null,
    remark: null,
    attachments: [],
    ...overrides,
  };
}

export const overdueHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440001",
  title: "Loops practice set",
  classDate: "2026-10-02",
  dueOn: "2026-10-05",
  status: "overdue",
  instructions:
    "Do questions 1 to 5 from the worksheet.\nShow the output for each one.",
  attachments: [worksheet],
});

export const dueTodayHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440002",
  title: "Functions worksheet",
  classDate: "2026-10-05",
  dueOn: "2026-10-07",
  status: "due",
  instructions:
    "Write a function that adds two numbers.\nThen write one that finds the larger of two numbers.",
  attachments: [worksheet],
});

export const dueLaterHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440003",
  title: "Lists and tuples",
  classDate: "2026-10-06",
  dueOn: "2026-10-09",
  status: "due",
});

/** Due more than 7 days out: on the Homework page, not on Home. */
export const dueFarHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440004",
  title: "Mini project: calculator",
  classDate: "2026-10-06",
  dueOn: "2026-10-20",
  status: "due",
});

export const submittedHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440005",
  title: "Variables recap",
  classDate: "2026-10-01",
  dueOn: "2026-10-03",
  status: "submitted",
  submission: submission({
    note: "Done in the blue notebook.",
    submittedBy: "parent",
    attachments: [photo],
  }),
});

export const lateHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440006",
  title: "If and else",
  classDate: "2026-09-28",
  dueOn: "2026-09-30",
  status: "late",
  submission: submission({
    id: "c10e8400-e29b-41d4-a716-446655440006",
    submittedAt: at("2026-10-01", "21:00"),
    updatedAt: at("2026-10-01", "21:00"),
    late: true,
  }),
});

export const checkedHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440007",
  title: "Print statements",
  classDate: "2026-09-23",
  dueOn: "2026-09-25",
  status: "checked",
  canSubmit: false,
  postedBy: { role: "owner", teacherName: null },
  submission: submission({
    id: "c10e8400-e29b-41d4-a716-446655440007",
    note: "All five done.",
    submittedAt: at("2026-09-24", "18:30"),
    updatedAt: at("2026-09-24", "18:30"),
    checkedAt: at("2026-09-26", "11:00"),
    remark: "Good work. Check question 4 again.",
    attachments: [photo],
  }),
});

/** Due before the Student joined: not owed, can still be submitted. */
export const referenceHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440008",
  title: "Install Python",
  classDate: "2026-09-10",
  dueOn: "2026-09-12",
  status: "reference",
});

/** From a Batch the Student has left. */
export const endedHomework = homework({
  id: "b10e8400-e29b-41d4-a716-446655440009",
  batchId: TALLY_BATCH_ID,
  title: "Ledger entries",
  classDate: "2026-09-15",
  dueOn: "2026-09-17",
  status: "reference",
  canSubmit: false,
  postedBy: { role: "teacher", teacherName: "Suresh Rao" },
});

const longNote = [
  "Read pages 12 to 18 before the next Class.",
  "Try every example in the Python shell.",
  "Write down any error you see.",
  "Bring your notebook on Friday.",
  "We will go through the exercises together.",
].join("\n");

export const loopsNotes: FamilyStudyMaterialView = {
  id: "d10e8400-e29b-41d4-a716-446655440001",
  batchId: PYTHON_BATCH_ID,
  title: "Loops notes",
  note: longNote,
  linkUrl: "https://www.docs.python.org/3/tutorial/controlflow.html",
  classDate: "2026-10-05",
  postedBy: meena,
  postedAt: at("2026-10-05", "19:20"),
  updatedAt: at("2026-10-05", "19:20"),
  attachments: [worksheet],
};

export const cheatSheet: FamilyStudyMaterialView = {
  id: "d10e8400-e29b-41d4-a716-446655440002",
  batchId: PYTHON_BATCH_ID,
  title: "Keyboard shortcuts",
  note: "Keep this next to your keyboard.",
  linkUrl: null,
  classDate: null,
  postedBy: { role: "owner", teacherName: null },
  postedAt: at("2026-09-29", "09:00"),
  updatedAt: at("2026-09-29", "09:00"),
  attachments: [],
};

export const tallyNotes: FamilyStudyMaterialView = {
  id: "d10e8400-e29b-41d4-a716-446655440003",
  batchId: TALLY_BATCH_ID,
  title: "Tally shortcuts",
  note: null,
  linkUrl: "https://example.com/tally",
  classDate: null,
  postedBy: { role: "teacher", teacherName: "Suresh Rao" },
  postedAt: at("2026-09-14", "09:00"),
  updatedAt: at("2026-09-14", "09:00"),
  attachments: [],
};

export const ashaClassWork: FamilyClassWorkStudentView = {
  id: ASHA_ID,
  name: "Asha Kumar",
  batches: [pythonBatch, tallyBatch],
  homework: [
    dueLaterHomework,
    dueFarHomework,
    dueTodayHomework,
    overdueHomework,
    submittedHomework,
    lateHomework,
    checkedHomework,
    endedHomework,
    referenceHomework,
  ],
  materials: [loopsNotes, cheatSheet, tallyNotes],
};

export const raviClassWork: FamilyClassWorkStudentView = {
  id: RAVI_ID,
  name: "Ravi Kumar",
  batches: [{ ...pythonBatch, id: "330e8400-e29b-41d4-a716-446655440000" }],
  homework: [],
  materials: [],
};
