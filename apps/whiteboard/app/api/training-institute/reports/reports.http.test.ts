import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import {
  authStateFor,
  clearOutbox,
  emailsTo,
  seedWorkspaceMember,
} from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ReportDocument } from "@/src/training-institute/application/report-document";

import { GET as getDashboard } from "../dashboard/route";
import { GET as listDues } from "../fee-dues/route";
import { GET as downloadReport } from "./[report]/download/route";
import { POST as emailReport } from "./[report]/email/route";
import { GET as getReport } from "./[report]/route";
import { POST as saveRemark } from "./remarks/route";
import { TrainingInstituteReportDocumentModel } from "./report-models";
import { GET as getCatalogue } from "./route";
import { GET as getSettings } from "./settings/route";
import { POST as updateSettings } from "./settings/update/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

// Monday 2 Nov 2026, 10:00 IST: October is "last month".
const PINNED_NOW = new Date("2026-11-02T04:30:00.000Z");

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  await seed();
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  clearOutbox();
});

const run = randomUUID().slice(0, 8);
const OWNER = `user_owner_${run}`;
const TEACHER = `user_teacher_${run}`;
const MEENA = `user_meena_${run}`;
const GONE = `user_gone_${run}`;
const PARENT = `user_parent_${run}`;
const STUDENT = `user_student_${run}`;
const PARENT_EMAIL = `parent_${run}@example.test`;
const PRIYA_EMAIL = `priya_${run}@example.test`;

const W = `org_${randomUUID()}`;
const OTHER_W = `org_${randomUUID()}`;
const id = () => randomUUID();
const ids = {
  course: id(),
  batchA: id(),
  batchC: id(),
  batchS: id(),
  teacher: id(),
  meena: id(),
  gone: id(),
  priya: id(),
  rohan: id(),
  karthik: id(),
  anu: id(),
  bala: id(),
  sam: id(),
  enrollPriya: id(),
  enrollRohan: id(),
  enrollKarthik: id(),
  enrollAnu: id(),
  enrollBala: id(),
  enrollSam: id(),
  otherStudent: id(),
};

type Role = WorkspaceRole;

function as(
  userId: string,
  role: Role,
  options: { email?: string; workspaceId?: string } = {},
) {
  mockedAuth.mockResolvedValue(
    authStateFor({
      userId,
      workspaceId: options.workspaceId ?? W,
      role,
      email: options.email,
      emailVerified: true,
    }),
  );
}

async function report(
  key: string,
  query: Record<string, string> = {},
): Promise<{ status: number; body: ReportDocument & { code?: string } }> {
  const url = new URL(`http://localhost/api/training-institute/reports/${key}`);
  for (const [name, value] of Object.entries(query))
    url.searchParams.set(name, value);
  const response = await getReport(new Request(url), {
    params: Promise.resolve({ report: key }),
  });
  const body = (await response.json()) as ReportDocument;
  if (response.status === 200) TrainingInstituteReportDocumentModel.parse(body);
  return { status: response.status, body };
}

function section(document: ReportDocument, sectionId: string, page = 0) {
  const found = document.pages[page]?.sections.find(
    (item) => item.id === sectionId,
  );
  if (found == null) throw new Error(`No section ${sectionId}`);
  return found;
}

function metric(
  document: ReportDocument,
  sectionId: string,
  label: string,
  page = 0,
) {
  const found = section(document, sectionId, page);
  if (found.kind !== "metrics") throw new Error("Not metrics");
  return found.items.find((item) => item.label === label)?.value;
}

function rows(document: ReportDocument, sectionId: string, page = 0) {
  const found = section(document, sectionId, page);
  if (found.kind !== "table") throw new Error("Not a table");
  return found.rows.map((item) =>
    Object.fromEntries(
      Object.entries(item.cells).map(([key, cell]) => [key, cell.text]),
    ),
  );
}

function allText(document: ReportDocument): string {
  return JSON.stringify(document);
}

const at = (iso: string) => new Date(iso);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const WEEKDAYS = [
  { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
];

/** October 2026 weekdays held for Batch A (Diwali 20–21, 6 cancelled, 14 → 17). */
function heldOctoberDates(): string[] {
  const dates: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const value = `2026-10-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (
      ["2026-10-06", "2026-10-14", "2026-10-20", "2026-10-21"].includes(value)
    )
      continue;
    dates.push(value);
  }
  dates.push("2026-10-17");
  return dates.sort();
}

async function register(
  batchId: string,
  day: string,
  marks: {
    enrollmentId: string;
    studentId: string;
    status: string;
    markedAt?: Date;
    by?: string;
  }[],
) {
  const registerId = id();
  await prisma.trainingInstituteAttendanceRegister.create({
    data: {
      id: registerId,
      workspaceId: W,
      batchId,
      date: date(day),
      timezone: "Asia/Kolkata",
      createdByUserId: OWNER,
    },
  });
  for (const mark of marks)
    await prisma.trainingInstituteAttendanceMark.create({
      data: {
        id: id(),
        workspaceId: W,
        registerId,
        enrollmentId: mark.enrollmentId,
        studentId: mark.studentId,
        studentNameSnapshot: "Student",
        status: mark.status as never,
        markedAt:
          mark.status === "unmarked"
            ? null
            : (mark.markedAt ?? at(`${day}T06:00:00.000Z`)),
        markedByUserId:
          mark.status === "unmarked" ? null : (mark.by ?? TEACHER),
      },
    });
}

async function student(
  studentId: string,
  name: string,
  extra: {
    email?: string;
    parentEmail?: string;
    droppedAt?: Date;
    workspaceId?: string;
  } = {},
) {
  await prisma.trainingInstituteStudent.create({
    data: {
      id: studentId,
      workspaceId: extra.workspaceId ?? W,
      createdByUserId: OWNER,
      name,
      phone: "9876500000",
      email: extra.email ?? null,
      guardianPhone: "9000000001",
      droppedAt: extra.droppedAt ?? null,
      createdAt: at("2026-09-10T05:00:00.000Z"),
      profileDetails:
        extra.parentEmail == null
          ? {}
          : { father: { name: "Father", email: extra.parentEmail } },
    },
  });
}

async function enroll(
  enrollmentId: string,
  studentId: string,
  batchId: string,
  extra: {
    createdAt: string;
    endedAt?: string;
    amountPaise?: number;
    dueDates?: { dueOn: string; amountPaise: number }[];
    classModeOverride?: "offline" | "online" | "hybrid";
  },
) {
  const amount = extra.amountPaise ?? 0;
  await prisma.trainingInstituteEnrollment.create({
    data: {
      id: enrollmentId,
      workspaceId: W,
      studentId,
      courseId: ids.course,
      batchId,
      createdByUserId: OWNER,
      timingSource: "batch",
      classModeOverride: extra.classModeOverride ?? null,
      createdAt: at(extra.createdAt),
      endedAt: extra.endedAt == null ? null : at(extra.endedAt),
      feePlanType: "one_time",
      feePlanAmountPaise: amount,
      feePlanDueDates: extra.dueDates ?? [
        { dueOn: "2026-10-01", amountPaise: amount },
      ],
    },
  });
}

async function seed() {
  await seedWorkspaceMember({
    workspaceId: W,
    userId: OWNER,
    role: "owner",
    workspaceName: "Sunrise Computer Centre",
  });
  for (const [userId, role] of [
    [TEACHER, "teacher"],
    [MEENA, "teacher"],
    [GONE, "teacher"],
    [STUDENT, "student"],
    [PARENT, "parent"],
  ] as const)
    await seedWorkspaceMember({ workspaceId: W, userId, role });
  await prisma.trainingInstituteCourse.create({
    data: {
      id: ids.course,
      workspaceId: W,
      createdByUserId: OWNER,
      name: "DCA",
      defaultFeeAmountPaise: 1_000_000,
    },
  });
  const batch = (
    batchId: string,
    name: string,
    extra: Record<string, unknown>,
  ) =>
    prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId: W,
        courseId: ids.course,
        createdByUserId: OWNER,
        name,
        classMode: "offline",
        capacity: 20,
        timings: WEEKDAYS,
        createdAt: at("2026-09-01T03:00:00.000Z"),
        ...extra,
      },
    });
  await batch(ids.batchA, "DCA Weekday 9–11", {});
  await batch(ids.batchC, "Python Online", {
    classMode: "online",
    meetingOption: "whiteboard",
    timings: [
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: "17:00", endTime: "18:00" },
    ],
  });
  await batch(ids.batchS, "Saturday Batch", {
    timings: [{ daysOfWeek: [6], startTime: "16:00", endTime: "18:00" }],
  });
  const teacher = (
    teacherId: string,
    name: string,
    userId: string,
    extra = {},
  ) =>
    prisma.trainingInstituteTeacher.create({
      data: {
        id: teacherId,
        workspaceId: W,
        createdByUserId: OWNER,
        name,
        email: `${userId}@example.test`,
        kind: "centre_teacher",
        userId,
        ...extra,
      },
    });
  await teacher(ids.teacher, "Lakshmi", TEACHER);
  await teacher(ids.meena, "Meena", MEENA, { kind: "visiting_tutor" });
  await teacher(ids.gone, "Gone", GONE, {
    deactivatedAt: at("2026-10-01T00:00:00.000Z"),
  });
  const assign = (teacherId: string, batchId: string, assignedAt: string) =>
    prisma.trainingInstituteBatchTeacherAssignment.create({
      data: {
        id: id(),
        workspaceId: W,
        teacherId,
        batchId,
        assignedByUserId: OWNER,
        assignedAt: at(assignedAt),
      },
    });
  // Lakshmi takes Batch A from 10 Oct only.
  await assign(ids.teacher, ids.batchA, "2026-10-10T03:00:00.000Z");
  await assign(ids.meena, ids.batchS, "2026-09-20T03:00:00.000Z");
  await assign(ids.gone, ids.batchA, "2026-09-20T03:00:00.000Z");

  await student(ids.priya, "Priya", {
    email: PRIYA_EMAIL,
    parentEmail: PARENT_EMAIL,
  });
  await student(ids.rohan, "Rohan", {
    parentEmail: PARENT_EMAIL,
    droppedAt: at("2026-10-25T06:00:00.000Z"),
  });
  await student(ids.karthik, "Karthik");
  await student(ids.anu, "Anu");
  await student(ids.bala, "Bala");
  await student(ids.sam, "Sam");
  await student(ids.otherStudent, "Other Workspace Student", {
    workspaceId: OTHER_W,
  });

  await enroll(ids.enrollPriya, ids.priya, ids.batchA, {
    createdAt: "2026-09-15T05:00:00.000Z",
    amountPaise: 1_000_000,
    dueDates: [
      { dueOn: "2026-10-05", amountPaise: 500_000 },
      { dueOn: "2026-11-05", amountPaise: 500_000 },
    ],
  });
  await enroll(ids.enrollRohan, ids.rohan, ids.batchA, {
    createdAt: "2026-09-15T05:00:00.000Z",
    endedAt: "2026-10-25T06:00:00.000Z",
    amountPaise: 400_000,
    dueDates: [{ dueOn: "2026-10-05", amountPaise: 400_000 }],
  });
  for (const [enrollmentId, studentId] of [
    [ids.enrollKarthik, ids.karthik],
    [ids.enrollAnu, ids.anu],
    [ids.enrollBala, ids.bala],
  ] as const)
    await enroll(enrollmentId, studentId, ids.batchC, {
      createdAt: "2026-10-01T03:00:00.000Z",
      amountPaise: enrollmentId === ids.enrollKarthik ? 200_000 : 0,
    });
  await enroll(ids.enrollSam, ids.sam, ids.batchS, {
    createdAt: "2026-09-20T03:00:00.000Z",
  });

  await prisma.trainingInstituteHoliday.create({
    data: {
      id: id(),
      workspaceId: W,
      startDate: date("2026-10-20"),
      endDate: date("2026-10-21"),
      reason: "Diwali",
      createdByUserId: OWNER,
    },
  });
  const change = (data: Record<string, unknown>) =>
    prisma.trainingInstituteClassChange.create({
      data: {
        id: id(),
        workspaceId: W,
        createdByUserId: OWNER,
        updatedByUserId: OWNER,
        ...data,
      } as never,
    });
  await change({
    batchId: ids.batchA,
    classDate: date("2026-10-06"),
    startTime: "09:00",
    endTime: "11:00",
    kind: "cancelled",
    reason: "power cut",
  });
  await change({
    batchId: ids.batchA,
    classDate: date("2026-10-14"),
    startTime: "09:00",
    endTime: "11:00",
    kind: "moved",
    movedToDate: date("2026-10-17"),
    movedToStartTime: "09:00",
    movedToEndTime: "11:00",
  });
  await change({
    batchId: ids.batchS,
    classDate: date("2026-10-10"),
    startTime: "16:00",
    endTime: "18:00",
    kind: "cancelled",
    reason: "exam hall booked",
  });

  // Priya's October: Present 13, Late 2, Informed absent 1, Uninformed 2, Excused 1.
  const statuses = [
    ...Array<string>(13).fill("present"),
    "late",
    "late",
    "informed_absent",
    "absent",
    "absent",
    "excused",
  ];
  const held = heldOctoberDates();
  for (const [index, day] of held.entries())
    await register(ids.batchA, day, [
      {
        enrollmentId: ids.enrollPriya,
        studentId: ids.priya,
        status: statuses[index] ?? "present",
      },
      ...(day <= "2026-10-24"
        ? [
            {
              enrollmentId: ids.enrollRohan,
              studentId: ids.rohan,
              status: day >= "2026-10-12" ? "absent" : "present",
            },
          ]
        : []),
    ]);
  const informedDay = held[15] ?? "";
  await prisma.trainingInstituteAbsenceNotice.create({
    data: {
      id: id(),
      workspaceId: W,
      studentId: ids.priya,
      enrollmentId: ids.enrollPriya,
      batchId: ids.batchA,
      classDate: date(informedDay),
      startTime: "09:00",
      endTime: "11:00",
      reason: "sick",
      givenAt: at("2026-10-01T03:00:00.000Z"),
      givenByUserId: PARENT,
      givenByRole: "parent",
      givenByName: "Father",
    },
  });
  // A notice for the cancelled Class no longer applies.
  await prisma.trainingInstituteAbsenceNotice.create({
    data: {
      id: id(),
      workspaceId: W,
      studentId: ids.priya,
      enrollmentId: ids.enrollPriya,
      batchId: ids.batchA,
      classDate: date("2026-10-06"),
      startTime: "09:00",
      endTime: "11:00",
      reason: "exam",
      givenAt: at("2026-10-01T03:00:00.000Z"),
      givenByUserId: STUDENT,
      givenByRole: "student",
      givenByName: "Priya",
    },
  });

  // Meena's Saturdays: 3 Oct and 17 Oct saved the same day, 24 Oct on Monday.
  for (const [day, markedAt] of [
    ["2026-10-03", "2026-10-03T12:00:00.000Z"],
    ["2026-10-17", "2026-10-17T12:00:00.000Z"],
    ["2026-10-24", "2026-10-26T05:00:00.000Z"],
  ] as const)
    await register(ids.batchS, day, [
      {
        enrollmentId: ids.enrollSam,
        studentId: ids.sam,
        status: "present",
        markedAt: at(markedAt),
        by: MEENA,
      },
    ]);

  // Python Online: a hosted Class on 14 Oct that two of three joined.
  const occurrence = id();
  await prisma.trainingInstituteClassOccurrence.create({
    data: {
      id: occurrence,
      workspaceId: W,
      batchId: ids.batchC,
      classDate: date("2026-10-14"),
      startTime: "17:00",
      endTime: "18:00",
      status: "ended",
      recordingStatus: "error",
      startedByUserId: OWNER,
      startedAt: at("2026-10-14T11:30:00.000Z"),
      endedAt: at("2026-10-14T12:30:00.000Z"),
    },
  });
  for (const enrollmentId of [ids.enrollKarthik, ids.enrollAnu])
    await prisma.trainingInstituteClassJoin.create({
      data: {
        id: id(),
        workspaceId: W,
        occurrenceId: occurrence,
        enrollmentId,
        userId: STUDENT,
        role: "student",
        firstJoinedAt: at("2026-10-14T11:31:00.000Z"),
        lastJoinedAt: at("2026-10-14T11:31:00.000Z"),
      },
    });

  // Fees: R-0002 was deleted as a mistake.
  const payment = (
    receiptNumber: string,
    enrollmentId: string,
    amountPaise: number,
    method: string,
    paidAt: string,
    deletedAt?: string,
  ) =>
    prisma.trainingInstituteFeePayment.create({
      data: {
        id: id(),
        workspaceId: W,
        enrollmentId,
        recordedByUserId: OWNER,
        amountPaise,
        method: method as never,
        paidAt: at(paidAt),
        receiptNumber,
        deletedAt: deletedAt == null ? null : at(deletedAt),
      },
    });
  await payment(
    "R-0001",
    ids.enrollPriya,
    500_000,
    "cash",
    "2026-10-04T06:00:00.000Z",
  );
  await payment(
    "R-0002",
    ids.enrollKarthik,
    100_000,
    "cash",
    "2026-10-11T06:00:00.000Z",
    "2026-10-11T07:00:00.000Z",
  );
  await payment(
    "R-0003",
    ids.enrollKarthik,
    200_000,
    "upi",
    "2026-10-12T06:00:00.000Z",
  );

  // An Enquiry on 28 Sep that became Karthik's admission on 3 Oct.
  const enquiry = id();
  await prisma.trainingInstituteEnquiry.create({
    data: {
      id: enquiry,
      workspaceId: W,
      createdByUserId: OWNER,
      prospectName: "Karthik",
      phone: "9876500001",
      courseId: ids.course,
      stage: "joined",
      createdAt: at("2026-09-28T06:00:00.000Z"),
      convertedAt: at("2026-10-03T06:00:00.000Z"),
      convertedStudentId: ids.karthik,
      convertedEnrollmentId: ids.enrollKarthik,
    },
  });
  await prisma.trainingInstituteEnquiryDemo.create({
    data: {
      id: id(),
      workspaceId: W,
      enquiryId: enquiry,
      kind: "one_to_one",
      teacherId: ids.meena,
      demoDate: date("2026-09-30"),
      startTime: "10:00",
      endTime: "11:00",
      timezone: "Asia/Kolkata",
      feeKind: "paid",
      feeAmountPaise: 20_000,
      feePaidAt: at("2026-10-01T06:00:00.000Z"),
      attendance: "attended",
      createdByUserId: OWNER,
    },
  });

  // Tests: a published Unit 1 (Priya 34 → 38), a draft, and Rohan's re-test.
  const unit1 = id();
  await prisma.trainingInstituteClassTest.create({
    data: {
      id: unit1,
      workspaceId: W,
      batchId: ids.batchA,
      scope: "batch",
      name: "Unit 1",
      heldOn: date("2026-10-08"),
      maxMarks: 50,
      passMarks: 20,
      createdByUserId: OWNER,
      createdByRole: "owner",
      updatedByUserId: OWNER,
      publishedAt: at("2026-10-09T06:00:00.000Z"),
    },
  });
  const priyaResult = id();
  await prisma.trainingInstituteTestResult.create({
    data: {
      id: priyaResult,
      workspaceId: W,
      testId: unit1,
      studentId: ids.priya,
      status: "scored",
      marks: 38,
      updatedByUserId: OWNER,
    },
  });
  await prisma.trainingInstituteTestResultChange.create({
    data: {
      id: id(),
      workspaceId: W,
      resultId: priyaResult,
      oldStatus: "scored",
      newStatus: "scored",
      oldMarks: 34,
      newMarks: 38,
      changedByUserId: OWNER,
      changedByRole: "owner",
    },
  });
  await prisma.trainingInstituteTestResult.create({
    data: {
      id: id(),
      workspaceId: W,
      testId: unit1,
      studentId: ids.rohan,
      status: "scored",
      marks: 12,
      updatedByUserId: OWNER,
    },
  });
  await prisma.trainingInstituteClassTest.create({
    data: {
      id: id(),
      workspaceId: W,
      batchId: ids.batchA,
      scope: "batch",
      name: "Draft Test",
      heldOn: date("2026-10-09"),
      maxMarks: 50,
      createdByUserId: OWNER,
      createdByRole: "owner",
      updatedByUserId: OWNER,
    },
  });
  const retest = id();
  await prisma.trainingInstituteClassTest.create({
    data: {
      id: retest,
      workspaceId: W,
      batchId: ids.batchA,
      scope: "student",
      studentId: ids.rohan,
      name: "Unit 1",
      heldOn: date("2026-10-19"),
      maxMarks: 50,
      passMarks: 20,
      createdByUserId: OWNER,
      createdByRole: "owner",
      updatedByUserId: OWNER,
      publishedAt: at("2026-10-19T06:00:00.000Z"),
    },
  });
  await prisma.trainingInstituteTestResult.create({
    data: {
      id: id(),
      workspaceId: W,
      testId: retest,
      studentId: ids.rohan,
      status: "scored",
      marks: 49,
      updatedByUserId: OWNER,
    },
  });

  // Homework due 16 Oct: Priya's parent marked it done; Rohan didn't.
  const homework = id();
  await prisma.trainingInstituteHomework.create({
    data: {
      id: homework,
      workspaceId: W,
      batchId: ids.batchA,
      title: "Typing practice",
      instructions: "Two pages.",
      classDate: date("2026-10-15"),
      dueOn: date("2026-10-16"),
      postedByUserId: OWNER,
      postedByRole: "owner",
      updatedByUserId: OWNER,
      createdAt: at("2026-10-15T06:00:00.000Z"),
    },
  });
  await prisma.trainingInstituteHomeworkSubmission.create({
    data: {
      id: id(),
      workspaceId: W,
      homeworkId: homework,
      studentId: ids.priya,
      submittedAt: at("2026-10-16T06:00:00.000Z"),
      submittedByUserId: PARENT,
      submittedByRole: "parent",
      updatedByUserId: PARENT,
      updatedByRole: "parent",
      checkedAt: at("2026-10-17T06:00:00.000Z"),
      checkedByUserId: TEACHER,
      remark: "Neat work",
    },
  });
}

describe("R1 Student attendance", () => {
  it("counts Priya's October as the PRD example does", async () => {
    as(OWNER, "owner");
    const { status, body } = await report("student-attendance", {
      studentId: ids.priya,
      period: "last_month",
    });
    expect(status).toBe(200);
    expect(body.instituteName).toBe("Sunrise Computer Centre");
    expect(body.period?.label).toBe("1 Oct 2026 – 31 Oct 2026");
    expect(metric(body, "summary", "Classes held")).toBe("19");
    expect(metric(body, "summary", "Attendance")).toBe("83% (15 of 18)");
    expect(metric(body, "summary", "Informed absent")).toBe("1");
    expect(metric(body, "summary", "Uninformed absent")).toBe("2");
    expect(metric(body, "summary", "Excused")).toBe("1");
    expect(metric(body, "summary", "Not marked")).toBe("0");
    const statuses = rows(body, "classes").map((item) => item["status"]);
    expect(statuses).toContain("Holiday: Diwali");
    expect(statuses).toContain("Cancelled: power cut");
    expect(statuses).toContain("Moved to Sat 17 Oct, 9 AM – 11 AM");
    expect(statuses).toContain("Informed absent: Sick (notice by parent)");
  });

  it("shows the empty state for a period with no Classes", async () => {
    as(OWNER, "owner");
    const { body } = await report("student-attendance", {
      studentId: ids.priya,
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(body.emptyText).toBe("No classes in this period for Priya.");
    expect(body.pages).toEqual([]);
  });

  it("asks staff to choose a Student", async () => {
    as(OWNER, "owner");
    const { status, body } = await report("student-attendance");
    expect(status).toBe(400);
    expect(body.code).toBe("REPORT_STUDENT_REQUIRED");
  });
});

describe("who sees what (Reports §4)", () => {
  it("never crosses Workspaces", async () => {
    as(OWNER, "owner");
    const { status } = await report("student-attendance", {
      studentId: ids.otherStudent,
    });
    expect(status).toBe(404);
  });

  it("keeps Teachers out of fees, enquiries and the monthly review", async () => {
    as(TEACHER, "teacher");
    for (const key of [
      "collections",
      "dues",
      "receipts",
      "fee-statement",
      "enquiry-funnel",
      "monthly-review",
    ]) {
      const { status } = await report(key);
      expect(status, key).toBe(403);
    }
  });

  it("shows a Teacher only their own Batches, from the day they were assigned", async () => {
    as(TEACHER, "teacher");
    const other = await report("attendance-register", {
      batchId: ids.batchS,
      period: "last_month",
    });
    expect(other.status).toBe(404);
    const own = await report("attendance-register", {
      batchId: ids.batchA,
      period: "last_month",
    });
    expect(own.status).toBe(200);
    const register = section(own.body, "register");
    if (register.kind !== "table") throw new Error("table");
    const dates = register.columns
      .map((column) => column.key)
      .filter((key) => /^\d{4}-/.test(key));
    expect(dates[0]).toBe("2026-10-12");
    expect(dates).not.toContain("2026-10-09");
  });

  it("never shows a Teacher phone numbers", async () => {
    as(TEACHER, "teacher");
    const teacherView = await report("low-attendance", {
      period: "last_month",
    });
    expect(allText(teacherView.body)).not.toContain("9000000001");
    expect(allText(teacherView.body)).not.toContain('"Phone"');
    as(OWNER, "owner");
    const ownerView = await report("low-attendance", {
      period: "last_month",
      includeEnded: "true",
    });
    expect(allText(ownerView.body)).toContain("9000000001");
  });

  it("gives a Teacher only their own R6 numbers and no pay", async () => {
    as(TEACHER, "teacher");
    const { body } = await report("teacher-classes", {
      period: "last_month",
      teacherId: ids.meena,
    });
    const teachers = rows(body, "teachers").map((item) => item["teacher"]);
    expect(teachers).toEqual(["Lakshmi"]);
    expect(allText(body)).not.toMatch(/₹|pay rate/i);
  });

  it("refuses a deactivated Teacher", async () => {
    as(GONE, "teacher");
    const response = await getCatalogue();
    expect(response.status).toBe(403);
    const { status } = await report("attendance-register", {
      batchId: ids.batchA,
    });
    expect(status).toBe(403);
  });

  it("lets a Parent see each linked child and nobody else", async () => {
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const priya = await report("student-attendance", {
      studentId: ids.priya,
      period: "last_month",
    });
    expect(priya.status).toBe(200);
    expect(priya.body.subject).toBe("Priya");
    const rohan = await report("student-attendance", {
      studentId: ids.rohan,
      period: "last_month",
    });
    expect(rohan.body.subject).toBe("Rohan");
    const karthik = await report("student-attendance", {
      studentId: ids.karthik,
    });
    expect(karthik.status).toBe(404);
    for (const key of [
      "attendance-register",
      "collections",
      "low-attendance",
      "batch-tests",
    ]) {
      const { status } = await report(key, { batchId: ids.batchA });
      expect(status, key).toBe(403);
    }
  });

  it("keeps a Student to themself, whatever they ask for", async () => {
    as(STUDENT, "student", { email: PRIYA_EMAIL });
    const { status, body } = await report("student-attendance", {
      studentId: ids.rohan,
      period: "last_month",
    });
    expect(status).toBe(200);
    expect(body.subject).toBe("Priya");
  });

  it("never shows families an average, highest score, rank or staff history", async () => {
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const { body } = await report("test-results", {
      studentId: ids.priya,
      period: "last_month",
    });
    expect(rows(body, "results")[0]).toMatchObject({
      marks: "38/50",
      result: "Pass",
    });
    const text = allText(body);
    expect(text).not.toMatch(
      /Average|Highest|Lowest|Rank|Change history|Rohan/,
    );
    expect(text).not.toContain("Draft Test");
  });
});

describe("R2–R5 attendance", () => {
  it("prints the register with codes, shaded dates and per-date counts", async () => {
    as(OWNER, "owner");
    const { body } = await report("attendance-register", {
      batchId: ids.batchA,
      period: "last_month",
    });
    expect(body.orientation).toBe("landscape");
    const register = section(body, "register");
    if (register.kind !== "table") throw new Error("table");
    const holiday = register.columns.find(
      (column) => column.key === "2026-10-20",
    );
    expect(holiday).toMatchObject({ tone: "shaded", detail: "Holiday" });
    expect(
      register.columns.find((column) => column.key === "2026-10-14"),
    ).toMatchObject({
      detail: "Moved",
    });
    const priya = register.rows.find(
      (item) => item.cells["student"]?.text === "Priya",
    );
    expect(priya?.cells["2026-10-01"]?.text).toBe("P");
    expect(priya?.cells["percent"]?.text).toBe("83%");
    // Rohan left on 25 Oct: past months include ended Enrollments, blank after.
    const rohan = register.rows.find(
      (item) => item.cells["student"]?.text === "Rohan (ended)",
    );
    expect(rohan?.cells["2026-10-30"]?.text).toBe("");
    expect(register.totals?.cells["2026-10-01"]?.text).toBe("2/2");
  });

  it("lists low attendance, absences in a row, and moves with the threshold", async () => {
    as(OWNER, "owner");
    const before = await report("low-attendance", {
      period: "last_month",
      includeEnded: "true",
    });
    expect(rows(before.body, "below").map((item) => item["student"])).toEqual([
      "Rohan",
    ]);
    expect(
      rows(before.body, "in-a-row").map((item) => item["student"]),
    ).toContain("Rohan");
    const update = await updateSettings(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          thresholdPercent: 85,
          absentInARow: 3,
          minimumClasses: 4,
          academicYearStartMonth: 6,
        }),
      }),
    );
    expect(update.status).toBe(200);
    const after = await report("low-attendance", {
      period: "last_month",
      includeEnded: "true",
    });
    expect(rows(after.body, "below").map((item) => item["student"])).toEqual([
      "Rohan",
      "Priya",
    ]);
    await updateSettings(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          thresholdPercent: 75,
          absentInARow: 3,
          minimumClasses: 4,
          academicYearStartMonth: 6,
        }),
      }),
    );
  });

  it("keeps Report settings to the Owner", async () => {
    as(TEACHER, "teacher");
    expect((await getSettings()).status).toBe(403);
  });

  it("splits informed and uninformed absences and labels stale notices", async () => {
    as(OWNER, "owner");
    const { body } = await report("absence-notices", { period: "last_month" });
    const priya = rows(body, "students").find(
      (item) => item["student"] === "Priya",
    );
    expect(priya).toMatchObject({ informed: "1", uninformed: "2" });
    expect(rows(body, "exceptions")[0]).toMatchObject({
      outcome: "Notice no longer applies",
    });
  });

  it("lists past unmarked registers but not Holidays or today's Class before it ends", async () => {
    as(OWNER, "owner");
    const { body } = await report("pending-attendance", {
      period: "custom",
      from: "2026-10-19",
      to: "2026-11-02",
    });
    const pending = rows(body, "pending").filter(
      (item) => item["batch"] === "Python Online",
    );
    const dates = pending.map((item) => item["date"]);
    expect(dates).toContain("Mon 19 Oct");
    expect(dates).not.toContain("Tue 20 Oct");
    expect(dates).not.toContain("Mon 2 Nov");
    expect(pending[0]).toMatchObject({ status: "Not marked" });
  });
});

describe("R6 Teacher classes", () => {
  it("matches Meena's example", async () => {
    as(OWNER, "owner");
    const { body } = await report("teacher-classes", {
      teacherId: ids.meena,
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-28",
    });
    expect(rows(body, "teachers")[0]).toMatchObject({
      teacher: "Meena",
      scheduled: "4",
      cancelled: "1",
      conducted: "3",
      noRecord: "0",
      hours: "6 h",
      onTime: "67%",
      demos: "0",
    });
  });

  it('says "No record", never "Missed"', async () => {
    as(OWNER, "owner");
    const { body } = await report("teacher-classes", { period: "last_month" });
    const text = allText(body);
    expect(text).toContain("No record");
    expect(text).not.toContain("Missed");
  });
});

describe("Fees R8–R11", () => {
  it("keeps R9's total equal to the Owner Dashboard and the dues list", async () => {
    as(OWNER, "owner");
    const { body } = await report("dues");
    expect(metric(body, "summary", "Total outstanding")).toBe("₹9,000");
    const dashboard = (await (await getDashboard()).json()) as {
      outstandingDuesPaise: number;
    };
    expect(dashboard.outstandingDuesPaise).toBe(900_000);
    const dues = (await (
      await listDues(new Request("http://localhost/api?filter=all"))
    ).json()) as { totalRemainingPaise: number };
    expect(dues.totalRemainingPaise).toBe(900_000);
    const table = rows(body, "dues");
    expect(
      table.find((item) => item["student"] === "Rohan (ended)"),
    ).toMatchObject({
      outstanding: "₹4,000",
      group: "16–30 days overdue",
    });
    expect(table.find((item) => item["student"] === "Priya")).toMatchObject({
      group: "Due soon",
    });
  });

  it("keeps R10's total equal to R8's course fees and flags a missing Receipt", async () => {
    as(OWNER, "owner");
    const collections = await report("collections", { period: "last_month" });
    const receipts = await report("receipts", { period: "last_month" });
    expect(metric(collections.body, "summary", "Course fees collected")).toBe(
      "₹7,000",
    );
    expect(metric(collections.body, "summary", "Cash")).toBe("₹5,000");
    expect(metric(collections.body, "summary", "UPI")).toBe("₹2,000");
    expect(
      metric(collections.body, "summary", "Demo fees (not course fees)"),
    ).toBe("₹200");
    expect(metric(collections.body, "summary", "Grand total")).toBe("₹7,200");
    expect(metric(receipts.body, "summary", "Total")).toBe("₹7,000");
    expect(metric(receipts.body, "summary", "Missing receipt numbers")).toBe(
      "Receipt R-0002 missing",
    );
    expect(allText(receipts.body)).not.toMatch(/GST report"/);
  });

  it("gives a Parent their child's fee statement as a PDF, with no way to pay", async () => {
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const { body } = await report("fee-statement", { studentId: ids.priya });
    expect(metric(body, `plan-${ids.enrollPriya}`, "Balance due")).toBe(
      "₹5,000",
    );
    expect(allText(body)).not.toMatch(/follow-up|Pay now/i);
    const url = new URL("http://localhost/api?format=pdf");
    url.searchParams.set("studentId", ids.priya);
    const response = await downloadReport(new Request(url), {
      params: Promise.resolve({ report: "fee-statement" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("shows paid demo fees apart on the admitted Student's statement", async () => {
    as(OWNER, "owner");
    const { body } = await report("fee-statement", { studentId: ids.karthik });
    expect(rows(body, "demo-fees")[0]).toMatchObject({ amount: "₹200" });
  });
});

describe("Enquiries, online, tests and homework", () => {
  it("counts an Enquiry in its month and the admission in the month converted", async () => {
    as(OWNER, "owner");
    const september = await report("enquiry-funnel", {
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(metric(september.body, "summary", "Enquiries received")).toBe("1");
    expect(metric(september.body, "summary", "Admitted")).toBe("0");
    const october = await report("enquiry-funnel", { period: "last_month" });
    expect(metric(october.body, "summary", "Admitted")).toBe("1");
  });

  it("shows a Teacher demos booked with them, without amounts", async () => {
    as(MEENA, "teacher");
    const { body } = await report("demo-classes", {
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(rows(body, "demos")).toHaveLength(1);
    expect(allText(body)).not.toContain("₹");
  });

  it("gives the join rate for hosted Classes and flags failed recordings", async () => {
    as(OWNER, "owner");
    const { body } = await report("online-classes", {
      period: "custom",
      from: "2026-10-14",
      to: "2026-10-14",
    });
    const held = rows(body, "classes")[0];
    expect(held).toMatchObject({
      joined: "2 of 3 (67%)",
      missing: "Bala",
      recording: "Failed",
    });
    expect(metric(body, "summary", "Failed recordings")).toBe("1");
  });

  it("shows the latest published marks, history for staff, re-tests apart", async () => {
    as(OWNER, "owner");
    const results = await report("test-results", {
      studentId: ids.priya,
      period: "last_month",
    });
    expect(rows(results.body, "results")[0]).toMatchObject({ marks: "38/50" });
    expect(rows(results.body, "changes")[0]).toMatchObject({
      old: "34",
      new: "38",
    });
    const batch = await report("batch-tests", {
      batchId: ids.batchA,
      period: "last_month",
    });
    expect(rows(batch.body, "tests")).toHaveLength(1);
    expect(rows(batch.body, "tests")[0]).toMatchObject({
      average: "25",
      highest: "38",
      lowest: "12",
    });
    expect(rows(batch.body, "single")[0]).toMatchObject({ marks: "49/50" });
  });

  it("labels a parent's submission and counts what is overdue", async () => {
    as(OWNER, "owner");
    const staff = await report("homework", { period: "last_month" });
    expect(rows(staff.body, "items")[0]).toMatchObject({
      expected: "2",
      onTime: "1",
      checked: "1",
    });
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const family = await report("homework", {
      studentId: ids.priya,
      period: "last_month",
    });
    expect(rows(family.body, "homework")[0]).toMatchObject({
      by: "Marked done by parent",
      remark: "Neat work",
    });
  });
});

describe("R18 monthly report, remarks and email", () => {
  async function remark(userId: string, role: Role, text: string) {
    as(userId, role);
    return saveRemark(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ studentId: ids.priya, month: "2026-10", text }),
      }),
    );
  }

  it("shows Owner and Teacher remarks; the Teacher's copy has no fees", async () => {
    expect((await remark(OWNER, "owner", "Good month.")).status).toBe(204);
    expect(
      (await remark(TEACHER, "teacher", "Needs practice in Tally.")).status,
    ).toBe(204);
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const family = await report("monthly-student", {
      studentId: ids.priya,
      month: "2026-10",
    });
    const remarks = section(family.body, "remarks");
    expect(remarks.kind === "notes" && remarks.lines).toEqual([
      `${OWNER} (Owner): Good month.`,
      "Lakshmi (Teacher): Needs practice in Tally.",
    ]);
    expect(metric(family.body, "fees", "Balance due")).toBe("₹5,000");
    as(TEACHER, "teacher");
    const teacherCopy = await report("monthly-student", {
      studentId: ids.priya,
      month: "2026-10",
    });
    expect(
      teacherCopy.body.pages[0]?.sections.some((item) => item.id === "fees"),
    ).toBe(false);
  });

  it("refuses a remark from a Teacher outside the Student's Batches", async () => {
    expect((await remark(MEENA, "teacher", "Hello")).status).toBe(404);
  });

  it("produces one page per Student for a whole Batch", async () => {
    as(OWNER, "owner");
    const { body } = await report("monthly-student", {
      batchId: ids.batchA,
      month: "2026-10",
    });
    expect(body.pages.map((page) => page.heading)).toEqual(["Priya", "Rohan"]);
    expect(JSON.stringify(body.pages[0])).not.toContain("Rohan");
  });

  it("emails each parent only their own child's report after confirming", async () => {
    as(OWNER, "owner");
    const send = (body: unknown) =>
      emailReport(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ report: "monthly-student" }) },
      );
    expect(
      (await send({ to: "parents", query: { batchId: ids.batchC } })).status,
    ).toBe(400);
    const response = await send({
      to: "parents",
      confirmed: true,
      query: { batchId: ids.batchC, month: "2026-10" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sent: [],
      notSent: [
        { studentName: "Anu", reason: "not sent: no email" },
        { studentName: "Bala", reason: "not sent: no email" },
        { studentName: "Karthik", reason: "not sent: no email" },
      ],
    });
    const single = await send({
      to: "parents",
      confirmed: true,
      query: { studentId: ids.priya, month: "2026-10" },
    });
    expect(((await single.json()) as { sent: unknown[] }).sent).toEqual([
      { studentName: "Priya", email: PARENT_EMAIL },
    ]);
    const emails = emailsTo(PARENT_EMAIL);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.attachments?.[0]?.contentType).toBe("application/pdf");
  });

  it("lets only the Owner send email", async () => {
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const response = await emailReport(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ to: "self", confirmed: true, query: {} }),
      }),
      { params: Promise.resolve({ report: "monthly-student" }) },
    );
    expect(response.status).toBe(403);
  });
});

describe("R7, R19 and downloads", () => {
  it("shows seats taken and free", async () => {
    as(OWNER, "owner");
    const { body } = await report("batch-strength", { period: "last_month" });
    const python = rows(body, "batches").find(
      (item) => item["batch"] === "Python Online",
    );
    expect(python).toMatchObject({
      seats: "3/20",
      free: "17",
      utilisation: "15%",
    });
    const dca = rows(body, "batches").find(
      (item) => item["batch"] === "DCA Weekday 9–11",
    );
    expect(dca).toMatchObject({ seats: "1/20", left: "1" });
  });

  it("compares this month with last month and links each figure", async () => {
    as(OWNER, "owner");
    const { body } = await report("monthly-review", { month: "2026-10" });
    const fees = section(body, "fees");
    if (fees.kind !== "metrics") throw new Error("metrics");
    expect(fees.items[0]).toMatchObject({
      label: "Course fees collected",
      value: "₹7,000",
      detail: "Last month: ₹0",
      link: { report: "collections" },
    });
  });

  it("downloads Excel for staff reports and refuses formats a role doesn't get", async () => {
    as(OWNER, "owner");
    const url = new URL("http://localhost/api?format=xlsx&period=last_month");
    url.searchParams.set("batchId", ids.batchA);
    const response = await downloadReport(new Request(url), {
      params: Promise.resolve({ report: "attendance-register" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    as(PARENT, "parent", { email: PARENT_EMAIL });
    const refused = await downloadReport(
      new Request("http://localhost/api?format=xlsx"),
      { params: Promise.resolve({ report: "fee-statement" }) },
    );
    expect(refused.status).toBe(403);
  });

  it("lists only the role's reports", async () => {
    as(TEACHER, "teacher");
    const body = (await (await getCatalogue()).json()) as {
      items: { key: string }[];
    };
    const keys = body.items.map((item) => item.key);
    expect(keys).toContain("attendance-register");
    expect(keys).not.toContain("collections");
    expect(keys).not.toContain("enquiry-funnel");
  });
});
