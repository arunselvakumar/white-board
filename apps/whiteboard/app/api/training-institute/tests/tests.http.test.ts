import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BatchTestsView,
  ClassTestDetailView,
  FamilyTestResultsView,
  StudentTestHistoryView,
} from "@/src/training-institute/application/class-test-views";

import {
  GET as batchTests,
  POST as createTest,
} from "../batches/[id]/tests/route";
import { GET as familyResults } from "../home/results/route";
import { GET as studentTests } from "../students/[id]/tests/route";
import { POST as deleteTest } from "./[id]/delete/route";
import { POST as publishTest } from "./[id]/publish/route";
import { POST as saveResults } from "./[id]/results/route";
import { GET as testDetail } from "./[id]/route";
import { POST as updateTest } from "./[id]/update/route";
import {
  TrainingInstituteBatchTestsResponseModel,
  TrainingInstituteClassTestDetailResponseModel,
  TrainingInstituteFamilyTestResultsResponseModel,
  TrainingInstituteStudentTestHistoryResponseModel,
} from "./class-test-models";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

// Wednesday 2026-09-30, noon in Asia/Kolkata.
const NOW = new Date("2026-09-30T06:30:00.000Z");
const TODAY = "2026-09-30";
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const DAYS_AGO = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

type Json = Record<string, unknown> & { code?: string; message?: string };
type Result<T = Json> = { status: number; body: T };

/** Without `email`, the User has no verified email to link Students by. */
function as(
  userId: string,
  orgId: string,
  orgRole: WorkspaceRole,
  email?: string,
) {
  mockedAuth.mockResolvedValue(
    authStateFor({
      userId,
      workspaceId: orgId,
      role: orgRole,
      ...(email == null ? { emailVerified: false } : { email }),
    }),
  );
}

async function read<T>(response: Response): Promise<Result<T>> {
  return { status: response.status, body: (await response.json()) as T };
}

function ctx<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

function post(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

const get = (path: string) => new Request(`http://localhost${path}`);

type Entry = {
  studentId: string;
  status: "scored" | "absent" | "exempt" | null;
  marks?: number | null;
  remark?: string | null;
  /** Left out, the result's current updatedAt is sent, as a fresh page would. */
  expectedUpdatedAt?: string | null;
};

describe("Class tests HTTP (ADR-0038)", () => {
  let workspaceId: string;
  let courseId: string;
  let batchId: string;
  let otherBatchId: string;
  let ashaId: string;
  let raviId: string;
  let meeraId: string;
  let kiranId: string;
  let latecomerId: string;
  let leaverId: string;

  const owner = () => {
    as("user_owner", workspaceId, "owner");
  };
  const teacher = () => {
    as("user_teacher", workspaceId, "teacher");
  };
  const otherTeacher = () => {
    as("user_teacher_2", workspaceId, "teacher");
  };
  const asha = () => {
    as("user_asha", workspaceId, "student", "asha@example.com");
  };
  const ravi = () => {
    as("user_ravi", workspaceId, "student", "ravi@example.com");
  };
  const kiran = () => {
    as("user_kiran", workspaceId, "student", "kiran@example.com");
  };
  /** Father of Asha and of Ravi. */
  const parent = () => {
    as("user_dad", workspaceId, "parent", "dad@example.com");
  };

  async function addBatch(name: string, createdDaysAgo = 120) {
    const id = randomUUID();
    await prisma.trainingInstituteBatch.create({
      data: {
        id,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
        name,
        classMode: "hybrid",
        capacity: 20,
        timings: [
          { daysOfWeek: [1, 3, 5], startTime: "10:00", endTime: "11:00" },
        ],
        createdAt: DAYS_AGO(createdDaysAgo),
      },
    });
    return id;
  }

  async function addStudent(name: string, email: string, father?: string) {
    const id = randomUUID();
    await prisma.trainingInstituteStudent.create({
      data: {
        id,
        workspaceId,
        createdByUserId: "user_owner",
        name,
        phone: "9876543210",
        email,
        profileDetails: father == null ? {} : { father: { email: father } },
      },
    });
    return id;
  }

  async function enroll(
    studentId: string,
    batch: string,
    daysAgo: number,
    endedDaysAgo?: number,
  ) {
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        studentId,
        courseId,
        batchId: batch,
        createdByUserId: "user_owner",
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 100000,
        feePlanDueDates: [],
        createdAt: DAYS_AGO(daysAgo),
        endedAt: endedDaysAgo == null ? null : DAYS_AGO(endedDaysAgo),
      },
    });
  }

  async function addTeacher(userId: string, name: string) {
    const id = randomUUID();
    await prisma.trainingInstituteTeacher.create({
      data: {
        id,
        workspaceId,
        createdByUserId: "user_owner",
        name,
        email: `${userId}@example.com`,
        kind: "centre_teacher",
        userId,
        invitationStatus: "accepted",
      },
    });
    return id;
  }

  async function create(
    input: Record<string, unknown> = {},
    batch = batchId,
  ): Promise<Result<ClassTestDetailView & Json>> {
    const result = await read<ClassTestDetailView & Json>(
      await createTest(
        post(`/b/${batch}/tests`, {
          name: "Weekly test 3",
          heldOn: day(-2),
          maxMarks: 50,
          passMarks: 18,
          topic: "Loops and lists",
          ...input,
        }),
        ctx({ id: batch }),
      ),
    );
    if (result.status === 201)
      TrainingInstituteClassTestDetailResponseModel.parse(result.body);
    return result;
  }

  async function save(
    testId: string,
    results: Entry[],
  ): Promise<Result<ClassTestDetailView & Json>> {
    const saved = await prisma.trainingInstituteTestResult.findMany({
      where: { testId },
      select: { studentId: true, updatedAt: true },
    });
    const loaded = new Map(
      saved.map((row) => [row.studentId, row.updatedAt.toISOString()]),
    );
    const body = results.map((entry) => ({
      ...entry,
      expectedUpdatedAt:
        entry.expectedUpdatedAt === undefined
          ? (loaded.get(entry.studentId) ?? null)
          : entry.expectedUpdatedAt,
    }));
    const result = await read<ClassTestDetailView & Json>(
      await saveResults(
        post(`/t/${testId}/results`, { results: body }),
        ctx({ id: testId }),
      ),
    );
    if (result.status === 200)
      TrainingInstituteClassTestDetailResponseModel.parse(result.body);
    return result;
  }

  async function publish(testId: string) {
    return read<ClassTestDetailView & Json>(
      await publishTest(post(`/t/${testId}/publish`), ctx({ id: testId })),
    );
  }

  async function detail(testId: string) {
    const result = await read<ClassTestDetailView & Json>(
      await testDetail(get(`/t/${testId}`), ctx({ id: testId })),
    );
    if (result.status === 200)
      TrainingInstituteClassTestDetailResponseModel.parse(result.body);
    return result;
  }

  async function overview(batch = batchId) {
    const result = await read<BatchTestsView & Json>(
      await batchTests(get(`/b/${batch}/tests`), ctx({ id: batch })),
    );
    if (result.status === 200)
      TrainingInstituteBatchTestsResponseModel.parse(result.body);
    return result;
  }

  async function history(studentId: string) {
    const result = await read<StudentTestHistoryView & Json>(
      await studentTests(get(`/s/${studentId}/tests`), ctx({ id: studentId })),
    );
    if (result.status === 200)
      TrainingInstituteStudentTestHistoryResponseModel.parse(result.body);
    return result;
  }

  async function family(): Promise<Result<FamilyTestResultsView & Json>> {
    const result = await read<FamilyTestResultsView & Json>(
      await familyResults(),
    );
    if (result.status === 200)
      TrainingInstituteFamilyTestResultsResponseModel.parse(result.body);
    return result;
  }

  const fullMarks = (): Entry[] => [
    { studentId: ashaId, status: "scored", marks: 34, remark: "Revise loops" },
    { studentId: raviId, status: "scored", marks: 41.5 },
    { studentId: meeraId, status: "absent", remark: "Was unwell" },
    { studentId: leaverId, status: "exempt" },
  ];

  /** A whole-batch Test with every listed Student's result, published. */
  async function publishedTest(): Promise<string> {
    owner();
    const created = await create();
    expect(created.status).toBe(201);
    const id = created.body.test.id;
    expect((await save(id, fullMarks())).status).toBe(200);
    expect((await publish(id)).status).toBe(200);
    return id;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    workspaceId = `org_${randomUUID()}`;
    courseId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 100000,
      },
    });
    batchId = await addBatch("Morning");
    otherBatchId = await addBatch("Evening");
    const teacherId = await addTeacher("user_teacher", "Lakshmi");
    await addTeacher("user_teacher_2", "Suresh");
    await prisma.trainingInstituteBatchTeacherAssignment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        teacherId,
        batchId,
        assignedByUserId: "user_owner",
      },
    });
    ashaId = await addStudent("Asha", "asha@example.com", "dad@example.com");
    raviId = await addStudent("Ravi", "ravi@example.com", "dad@example.com");
    meeraId = await addStudent("Meera", "meera@example.com");
    kiranId = await addStudent("Kiran", "kiran@example.com");
    latecomerId = await addStudent("Latha", "latha@example.com");
    leaverId = await addStudent("Gopal", "gopal@example.com");
    await enroll(ashaId, batchId, 60);
    await enroll(raviId, batchId, 60);
    await enroll(meeraId, batchId, 60);
    await enroll(kiranId, otherBatchId, 60);
    // Joined after the Test date; left the day after it.
    await enroll(latecomerId, batchId, 1);
    await enroll(leaverId, batchId, 60, 1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a whole-batch draft listing the Students in the Batch on the Test date", async () => {
    owner();
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.test).toMatchObject({
      name: "Weekly test 3",
      heldOn: day(-2),
      maxMarks: 50,
      passMarks: 18,
      topic: "Loops and lists",
      scope: "batch",
      student: null,
      publishedAt: null,
      createdBy: { role: "owner", teacherName: null },
    });
    expect(created.body.canDelete).toBe(true);
    expect(created.body.rows.map((row) => row.student.name)).toEqual([
      "Asha",
      "Gopal",
      "Meera",
      "Ravi",
    ]);
    expect(created.body.rows.every((row) => row.result == null)).toBe(true);
  });

  it("saves marks, absences, and exemptions as a draft and publishes them", async () => {
    teacher();
    const created = await create();
    expect(created.body.test.createdBy).toEqual({
      role: "teacher",
      teacherName: "Lakshmi",
    });
    const id = created.body.test.id;

    const partial = await save(id, fullMarks().slice(0, 2));
    expect(partial.status).toBe(200);
    expect(partial.body.test.publishedAt).toBeNull();
    expect(partial.body.test.summary).toMatchObject({ listed: 4, entered: 2 });

    const blank = await publish(id);
    expect(blank.status).toBe(409);
    expect(blank.body.code).toBe("CLASS_TEST_RESULTS_INCOMPLETE");
    expect(blank.body.message).toBe(
      "Enter a result for Gopal, Meera before publishing.",
    );

    const full = await save(id, fullMarks());
    expect(
      full.body.rows.find((row) => row.student.id === raviId)?.result,
    ).toMatchObject({ status: "scored", marks: 41.5, passed: true });
    expect(
      full.body.rows.find((row) => row.student.id === meeraId)?.result,
    ).toMatchObject({
      status: "absent",
      marks: null,
      passed: null,
      remark: "Was unwell",
    });

    const published = await publish(id);
    expect(published.status).toBe(200);
    expect(published.body.test.publishedAt).toBe(NOW.toISOString());
    expect(published.body.canDelete).toBe(false);
    expect((await publish(id)).body.code).toBe("CLASS_TEST_ALREADY_PUBLISHED");
  });

  it("clears a draft result back to blank, but not a published one", async () => {
    owner();
    const id = (await create()).body.test.id;
    await save(id, [{ studentId: ashaId, status: "scored", marks: 30 }]);
    const cleared = await save(id, [{ studentId: ashaId, status: null }]);
    expect(
      cleared.body.rows.find((row) => row.student.id === ashaId)?.result,
    ).toBeNull();

    const publishedId = await publishedTest();
    const refused = await save(publishedId, [
      { studentId: ashaId, status: null },
    ]);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("CLASS_TEST_RESULT_REQUIRED");
  });

  it("rejects marks below zero or over the maximum with a clear message", async () => {
    owner();
    const id = (await create()).body.test.id;
    const over = await save(id, [
      { studentId: ashaId, status: "scored", marks: 51 },
    ]);
    expect(over.status).toBe(400);
    expect(over.body).toMatchObject({
      code: "CLASS_TEST_MARKS_OUT_OF_RANGE",
      message: "Marks for Asha must be from 0 to 50.",
      details: { studentId: ashaId },
    });
    const under = await save(id, [
      { studentId: raviId, status: "scored", marks: -1 },
    ]);
    expect(under.body.message).toBe("Marks for Ravi must be from 0 to 50.");
    expect(
      (await save(id, [{ studentId: raviId, status: "absent", marks: 10 }]))
        .body.code,
    ).toBe("CLASS_TEST_MARKS_NOT_ALLOWED");
    // A bad entry saves nothing.
    expect(
      (
        await save(id, [
          { studentId: ashaId, status: "scored", marks: 20 },
          { studentId: raviId, status: "scored", marks: 60 },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await detail(id)).body.rows.every((row) => row.result == null),
    ).toBe(true);
  });

  it("lists neither late joiners nor Students from other Batches", async () => {
    owner();
    const id = (await create()).body.test.id;
    for (const studentId of [latecomerId, kiranId]) {
      const refused = await save(id, [
        { studentId, status: "scored", marks: 10 },
      ]);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("CLASS_TEST_STUDENT_NOT_LISTED");
    }
  });

  it("creates a single-student re-test that lists only that Student and stays out of Batch numbers", async () => {
    const batchTestId = await publishedTest();
    const retest = await create({
      name: "Weekly test 3 re-test",
      heldOn: day(-1),
      studentId: ashaId,
    });
    expect(retest.status).toBe(201);
    expect(retest.body.test).toMatchObject({
      scope: "student",
      student: { id: ashaId, name: "Asha" },
    });
    expect(retest.body.rows.map((row) => row.student.id)).toEqual([ashaId]);
    const retestId = retest.body.test.id;
    await save(retestId, [{ studentId: ashaId, status: "scored", marks: 48 }]);
    await publish(retestId);

    const batch = await overview();
    expect(batch.status).toBe(200);
    const listed = batch.body.tests.map((test) => test.id);
    expect(listed).toEqual([retestId, batchTestId]);
    expect(batch.body.tests[0]?.summary).toMatchObject({
      listed: 1,
      tested: 1,
      average: null,
      highest: null,
      lowest: null,
    });
    expect(batch.body.tests[1]?.summary).toMatchObject({
      listed: 4,
      tested: 2,
      absent: 1,
      exempt: 1,
      average: 37.8,
      highest: 41.5,
      lowest: 34,
      belowPass: [],
      absentStudents: [{ id: meeraId, name: "Meera" }],
      exemptStudents: [{ id: leaverId, name: "Gopal" }],
    });

    expect((await history(raviId)).body.tests.map((test) => test.id)).toEqual([
      batchTestId,
    ]);
    expect((await history(ashaId)).body.tests.map((test) => test.id)).toEqual([
      retestId,
      batchTestId,
    ]);
  });

  it("refuses a single-student Test for a Student not in the Batch on that date", async () => {
    owner();
    const late = await create({ studentId: latecomerId });
    expect(late.status).toBe(400);
    expect(late.body).toMatchObject({
      code: "CLASS_TEST_STUDENT_NOT_IN_BATCH",
      message: "Latha wasn't in this Batch on that date.",
    });
    expect((await create({ studentId: kiranId })).body.message).toBe(
      "That Student isn't in this Batch.",
    );
  });

  it("names Students below the pass mark in the Batch view", async () => {
    owner();
    const id = (await create({ passMarks: 35 })).body.test.id;
    await save(id, fullMarks());
    const summary = (await overview()).body.tests[0]?.summary;
    expect(summary?.belowPass).toEqual([
      { id: ashaId, name: "Asha", marks: 34 },
    ]);
  });

  it("keeps Tests and marks hidden from Students and Parents until published", async () => {
    owner();
    const id = (await create()).body.test.id;
    await save(id, fullMarks());

    for (const who of [asha, parent]) {
      who();
      const result = await family();
      expect(result.status).toBe(200);
      expect(result.body.students.every((s) => s.results.length === 0)).toBe(
        true,
      );
      expect((await detail(id)).status).toBe(403);
      expect((await overview()).status).toBe(403);
    }
  });

  it("shows the Student and linked Parents only the Student's own published result", async () => {
    await publishedTest();

    asha();
    const own = await family();
    expect(own.body.students).toHaveLength(1);
    expect(own.body.students[0]).toMatchObject({ id: ashaId, name: "Asha" });
    expect(own.body.students[0]?.results).toEqual([
      expect.objectContaining({
        name: "Weekly test 3",
        heldOn: day(-2),
        maxMarks: 50,
        passMarks: 18,
        status: "scored",
        marks: 34,
        passed: true,
        remark: "Revise loops",
        batch: { id: batchId, name: "Morning", courseName: "Python" },
      }),
    ]);
    const body = JSON.stringify(own.body);
    for (const leak of [
      "41.5",
      "average",
      "highest",
      "lowest",
      "Ravi",
      "Meera",
    ])
      expect(body).not.toContain(leak);

    // A Parent of two Students sees each separately.
    parent();
    const both = await family();
    expect(both.body.students.map((s) => s.name)).toEqual(["Asha", "Ravi"]);
    expect(both.body.students[1]?.results[0]).toMatchObject({
      marks: 41.5,
      remark: null,
    });

    kiran();
    expect((await family()).body.students[0]?.results).toEqual([]);
  });

  it("lets a Teacher correct a published mark without approval and logs the change", async () => {
    const id = await publishedTest();
    teacher();
    const corrected = await save(id, [
      {
        studentId: ashaId,
        status: "scored",
        marks: 38,
        remark: "Revise loops",
      },
    ]);
    expect(corrected.status).toBe(200);
    const row = corrected.body.rows.find((r) => r.student.id === ashaId);
    expect(row?.result?.marks).toBe(38);
    expect(row?.history).toEqual([
      {
        changedAt: NOW.toISOString(),
        changedBy: { role: "teacher", teacherName: "Lakshmi" },
        before: { status: "scored", marks: 34, remark: "Revise loops" },
        after: { status: "scored", marks: 38, remark: "Revise loops" },
      },
    ]);
    // An unchanged save logs nothing.
    await save(id, [
      {
        studentId: ashaId,
        status: "scored",
        marks: 38,
        remark: "Revise loops",
      },
    ]);
    expect(
      (await detail(id)).body.rows.find((r) => r.student.id === ashaId)
        ?.history,
    ).toHaveLength(1);

    for (const who of [asha, parent]) {
      who();
      const seen = (await family()).body.students.find((s) => s.id === ashaId);
      expect(seen?.results[0]?.marks).toBe(38);
      expect(JSON.stringify(seen)).not.toContain("history");
    }
  });

  it("doesn't log edits to a draft", async () => {
    owner();
    const id = (await create()).body.test.id;
    await save(id, [{ studentId: ashaId, status: "scored", marks: 30 }]);
    const edited = await save(id, [
      { studentId: ashaId, status: "scored", marks: 31 },
    ]);
    expect(
      edited.body.rows.find((r) => r.student.id === ashaId)?.history,
    ).toEqual([]);
  });

  it("edits a published Test's name and topic, but not its date, maximum, or pass mark", async () => {
    const id = await publishedTest();
    const details = {
      name: "Weekly test 3 (Loops)",
      heldOn: day(-2),
      maxMarks: 50,
      passMarks: 18,
      topic: null,
    };
    const edited = await read<ClassTestDetailView & Json>(
      await updateTest(post(`/t/${id}/update`, details), ctx({ id })),
    );
    expect(edited.status).toBe(200);
    expect(edited.body.test).toMatchObject({
      name: "Weekly test 3 (Loops)",
      maxMarks: 50,
      passMarks: 18,
      topic: null,
    });
    // Moving the pass mark would turn Asha's 34 into a fail with no record.
    for (const change of [{ passMarks: 40 }, { maxMarks: 60 }]) {
      const locked = await read<Json>(
        await updateTest(
          post(`/t/${id}/update`, { ...details, ...change }),
          ctx({ id }),
        ),
      );
      expect(locked.status).toBe(409);
      expect(locked.body.code).toBe("CLASS_TEST_MARKS_LOCKED");
    }
    const moved = await read<Json>(
      await updateTest(
        post(`/t/${id}/update`, { ...details, heldOn: day(-3) }),
        ctx({ id }),
      ),
    );
    expect(moved.status).toBe(409);
    expect(moved.body.code).toBe("CLASS_TEST_DATE_LOCKED");
  });

  it("changes a draft's maximum, but not below a mark already entered", async () => {
    owner();
    const id = (await create()).body.test.id;
    await save(id, [{ studentId: raviId, status: "scored", marks: 41.5 }]);
    const details = { name: "Weekly test 3", heldOn: day(-2), passMarks: 18 };
    const lowered = await read<ClassTestDetailView & Json>(
      await updateTest(
        post(`/t/${id}/update`, { ...details, maxMarks: 45 }),
        ctx({ id }),
      ),
    );
    expect(lowered.body.test.maxMarks).toBe(45);
    const tooLow = await read<Json>(
      await updateTest(
        post(`/t/${id}/update`, { ...details, maxMarks: 40 }),
        ctx({ id }),
      ),
    );
    expect(tooLow.status).toBe(409);
    expect(tooLow.body.code).toBe("CLASS_TEST_MAX_BELOW_MARKS");
  });

  it("refuses a save from a stale page instead of undoing someone else's change", async () => {
    const id = await publishedTest();
    const loaded = (await detail(id)).body.rows.find(
      (row) => row.student.id === raviId,
    )?.result?.updatedAt;
    expect(loaded).toBeDefined();

    // The Teacher corrects Ravi a minute later.
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    teacher();
    expect(
      (await save(id, [{ studentId: raviId, status: "scored", marks: 44 }]))
        .status,
    ).toBe(200);

    // The Owner's page still shows Ravi as first loaded.
    owner();
    const stale = await save(id, [
      {
        studentId: raviId,
        status: "scored",
        marks: 41.5,
        expectedUpdatedAt: loaded ?? null,
      },
    ]);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: "CLASS_TEST_RESULT_CHANGED",
      details: { studentId: raviId },
    });
    expect(
      (await detail(id)).body.rows.find((row) => row.student.id === raviId)
        ?.result?.marks,
    ).toBe(44);

    // A draft row the page loaded as blank can't wipe a result saved since.
    const draftId = (await create({ name: "Mock" })).body.test.id;
    await save(draftId, [{ studentId: ashaId, status: "scored", marks: 20 }]);
    const blanked = await save(draftId, [
      { studentId: ashaId, status: null, expectedUpdatedAt: null },
    ]);
    expect(blanked.body.code).toBe("CLASS_TEST_RESULT_CHANGED");
  });

  it("moves a draft's date only where every saved result still fits", async () => {
    owner();
    const id = (await create()).body.test.id;
    await save(id, [{ studentId: leaverId, status: "exempt" }]);
    const details = { name: "Weekly test 3", maxMarks: 50 };
    // Gopal left yesterday, so today's date would drop his saved result.
    const refused = await read<Json>(
      await updateTest(
        post(`/t/${id}/update`, { ...details, heldOn: TODAY }),
        ctx({ id }),
      ),
    );
    expect(refused.body).toMatchObject({
      code: "CLASS_TEST_STUDENT_NOT_IN_BATCH",
      message: "Gopal wasn't in this Batch on that date.",
    });
    await save(id, [{ studentId: leaverId, status: null }]);
    const moved = await read<ClassTestDetailView & Json>(
      await updateTest(
        post(`/t/${id}/update`, { ...details, heldOn: TODAY }),
        ctx({ id }),
      ),
    );
    expect(moved.status).toBe(200);
    expect(moved.body.rows.map((row) => row.student.name)).toEqual([
      "Asha",
      "Latha",
      "Meera",
      "Ravi",
    ]);
  });

  it("refuses future and pre-Batch dates and new Tests in a closed Batch", async () => {
    owner();
    expect((await create({ heldOn: day(1) })).body.code).toBe(
      "CLASS_TEST_DATE_IN_FUTURE",
    );
    expect((await create({ heldOn: day(-121) })).body.code).toBe(
      "CLASS_TEST_DATE_BEFORE_BATCH",
    );
    expect((await create({ maxMarks: 0 })).body.code).toBe(
      "CLASS_TEST_MAX_MARKS_INVALID",
    );
    expect((await create({ passMarks: 51 })).body.code).toBe(
      "CLASS_TEST_PASS_MARKS_INVALID",
    );
    const id = (await create()).body.test.id;
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: { closedAt: NOW, closedByUserId: "user_owner" },
    });
    const closed = await create();
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("BATCH_CLOSED");
    expect((await overview()).body.canCreate).toBe(false);
    // Marks in a closed Batch can still be entered and corrected.
    expect((await save(id, fullMarks())).status).toBe(200);
    expect((await publish(id)).status).toBe(200);
  });

  it("deletes only an unpublished Test", async () => {
    owner();
    const draftId = (await create()).body.test.id;
    await save(draftId, fullMarks());
    const deleted = await read<Json>(
      await deleteTest(post(`/t/${draftId}/delete`), ctx({ id: draftId })),
    );
    expect(deleted).toEqual({ status: 200, body: { id: draftId } });
    expect((await detail(draftId)).status).toBe(404);
    expect((await overview()).body.tests).toEqual([]);

    const publishedId = await publishedTest();
    const refused = await read<Json>(
      await deleteTest(
        post(`/t/${publishedId}/delete`),
        ctx({ id: publishedId }),
      ),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CLASS_TEST_PUBLISHED");
  });

  it("keeps a leaver's results and lists a published Test exactly as published", async () => {
    const id = await publishedTest();
    // Gopal left after the Test; his result stays on it and in his history.
    expect(
      (await detail(id)).body.rows.find((r) => r.student.id === leaverId)
        ?.result?.status,
    ).toBe("exempt");
    await prisma.trainingInstituteStudent.update({
      where: { id: leaverId },
      data: { droppedAt: NOW, droppedByUserId: "user_owner" },
    });
    expect((await history(leaverId)).body.tests).toHaveLength(1);
    expect((await detail(id)).body.rows).toHaveLength(4);
  });

  it("shows a Student's history to the Owner and assigned Teachers, drafts included", async () => {
    const publishedId = await publishedTest();
    const draftId = (await create({ name: "Mock exam", heldOn: day(-1) })).body
      .test.id;
    const elsewhere = (
      await create({ name: "Evening test", heldOn: day(-3) }, otherBatchId)
    ).body.test.id;
    await enroll(ashaId, otherBatchId, 30);

    const own = await history(ashaId);
    expect(own.status).toBe(200);
    expect(own.body.student).toEqual({ id: ashaId, name: "Asha" });
    expect(
      own.body.tests.map((test) => [test.id, test.publishedAt != null]),
    ).toEqual([
      [draftId, false],
      [publishedId, true],
      [elsewhere, false],
    ]);
    expect(own.body.tests[0]?.result).toBeNull();
    expect(own.body.tests[1]?.result?.marks).toBe(34);

    // Lakshmi teaches Morning only, so the Evening Test is left out.
    teacher();
    expect((await history(ashaId)).body.tests.map((test) => test.id)).toEqual([
      draftId,
      publishedId,
    ]);
    // Kiran was never in Lakshmi's Batches.
    expect((await history(kiranId)).status).toBe(403);
  });

  it("keeps unassigned Teachers, Students, Parents, and other Workspaces out", async () => {
    const id = await publishedTest();

    otherTeacher();
    expect((await overview()).status).toBe(403);
    expect((await detail(id)).status).toBe(403);
    expect((await create()).status).toBe(403);
    expect(
      (await save(id, [{ studentId: ashaId, status: "absent" }])).status,
    ).toBe(403);
    expect((await publish(id)).status).toBe(403);
    expect((await history(ashaId)).status).toBe(403);

    for (const who of [ravi, parent]) {
      who();
      expect((await create()).status).toBe(403);
      expect(
        (await save(id, [{ studentId: ashaId, status: "absent" }])).status,
      ).toBe(403);
      expect((await history(ashaId)).status).toBe(403);
    }

    owner();
    expect((await family()).status).toBe(403);

    const otherWorkspace = `org_${randomUUID()}`;
    as("user_owner_2", otherWorkspace, "owner");
    expect((await overview()).status).toBe(404);
    expect((await detail(id)).status).toBe(404);
    expect(
      (await save(id, [{ studentId: ashaId, status: "absent" }])).status,
    ).toBe(404);
    expect((await history(ashaId)).status).toBe(404);
    as("user_asha", otherWorkspace, "student", "asha@example.com");
    expect((await family()).body.students).toEqual([]);
  });
});
