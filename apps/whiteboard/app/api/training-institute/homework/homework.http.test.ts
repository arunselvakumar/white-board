import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AttachmentView,
  BatchClassWorkView,
  FamilyClassWorkView,
  FamilyHomeworkView,
  HomeworkSubmissionsView,
  HomeworkView,
  StudyMaterialView,
  SubmissionView,
} from "@/src/training-institute/application/class-work-views";

import { GET as download } from "../attachments/[id]/route";
import { POST as upload } from "../attachments/route";
import { GET as batchClassWork } from "../batches/[id]/class-work/route";
import { POST as setHomework } from "../batches/[id]/homework/route";
import { POST as postMaterial } from "../batches/[id]/study-materials/route";
import { GET as familyClassWork } from "../home/homework/route";
import { POST as removeMaterial } from "../study-materials/[id]/remove/route";
import { POST as updateMaterial } from "../study-materials/[id]/update/route";
import { POST as removeHomework } from "./[id]/remove/route";
import { POST as checkSubmission } from "./[id]/submissions/[submissionId]/check/route";
import { GET as submissions } from "./[id]/submissions/route";
import { POST as submit } from "./[id]/submit/route";
import { POST as undo } from "./[id]/undo-submission/route";
import { POST as updateHomework } from "./[id]/update/route";
import {
  TrainingInstituteBatchClassWorkResponseModel,
  TrainingInstituteFamilyClassWorkResponseModel,
  TrainingInstituteHomeworkSubmissionsResponseModel,
} from "./class-work-models";

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
/** Monday to Saturday, so a Sunday has no Class. */
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];
const SUNDAY = "2026-09-27";

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
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    body: (type.includes("json")
      ? await response.json()
      : await response.arrayBuffer()) as T,
  };
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

async function png(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
}

async function pdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  return document.save();
}

async function uploadFile(
  bytes: Uint8Array,
  mimeType: string,
  name = "file",
): Promise<Result<AttachmentView & Json>> {
  return read(
    await upload(
      new Request(
        `http://localhost/api/training-institute/attachments?name=${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "content-type": mimeType },
          body: Buffer.from(bytes),
        },
      ),
    ),
  );
}

describe("Homework and Study Material HTTP (ADR-0033)", () => {
  let workspaceId: string;
  let courseId: string;
  let batchId: string;
  let otherBatchId: string;
  let ashaId: string;
  let raviId: string;
  let meeraId: string;
  let kiranId: string;

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
  const ashaParent = () => {
    as("user_dad", workspaceId, "parent", "dad@example.com");
  };
  const ravi = () => {
    as("user_ravi", workspaceId, "student", "ravi@example.com");
  };
  const meera = () => {
    as("user_meera", workspaceId, "student", "meera@example.com");
  };
  const kiran = () => {
    as("user_kiran", workspaceId, "student", "kiran@example.com");
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
        classMode: "offline",
        capacity: 20,
        timings: [
          { daysOfWeek: MON_TO_SAT, startTime: "10:00", endTime: "11:00" },
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

  async function enroll(studentId: string, batch: string, daysAgo: number) {
    const id = randomUUID();
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id,
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
      },
    });
    return id;
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

  async function homework(
    input: Partial<{
      title: string;
      instructions: string;
      classDate: string;
      dueOn: string;
      attachmentIds: string[];
    }> = {},
    batch = batchId,
  ): Promise<Result<HomeworkView & Json>> {
    return read(
      await setHomework(
        post(`/b/${batch}/homework`, {
          title: "Chapter 3",
          instructions: "Exercises 1 to 5",
          classDate: day(-1),
          dueOn: day(1),
          ...input,
        }),
        ctx({ id: batch }),
      ),
    );
  }

  async function material(
    input: Record<string, unknown> = {},
    batch = batchId,
  ): Promise<Result<StudyMaterialView & Json>> {
    return read(
      await postMaterial(
        post(`/b/${batch}/study-materials`, {
          title: "Notes",
          note: "Read pages 4 to 9",
          ...input,
        }),
        ctx({ id: batch }),
      ),
    );
  }

  async function family(): Promise<FamilyClassWorkView> {
    const result = await read<FamilyClassWorkView>(await familyClassWork());
    expect(result.status).toBe(200);
    TrainingInstituteFamilyClassWorkResponseModel.parse(result.body);
    return result.body;
  }

  async function familyHomework(
    homeworkId: string,
    studentId: string,
  ): Promise<FamilyHomeworkView | undefined> {
    return (await family()).students
      .find((student) => student.id === studentId)
      ?.homework.find((item) => item.id === homeworkId);
  }

  async function submitAs(
    homeworkId: string,
    studentId: string,
    body: Record<string, unknown> = {},
  ): Promise<Result<FamilyHomeworkView & Json>> {
    return read(
      await submit(
        post(`/h/${homeworkId}/submit`, { studentId, ...body }),
        ctx({ id: homeworkId }),
      ),
    );
  }

  async function roster(
    homeworkId: string,
  ): Promise<Result<HomeworkSubmissionsView & Json>> {
    const result = await read<HomeworkSubmissionsView & Json>(
      await submissions(get(`/h/${homeworkId}`), ctx({ id: homeworkId })),
    );
    if (result.status === 200)
      TrainingInstituteHomeworkSubmissionsResponseModel.parse(result.body);
    return result;
  }

  async function overview(batch = batchId) {
    const result = await read<BatchClassWorkView & Json>(
      await batchClassWork(get(`/b/${batch}`), ctx({ id: batch })),
    );
    if (result.status === 200)
      TrainingInstituteBatchClassWorkResponseModel.parse(result.body);
    return result;
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
    raviId = await addStudent("Ravi", "ravi@example.com");
    meeraId = await addStudent("Meera", "meera@example.com");
    kiranId = await addStudent("Kiran", "kiran@example.com");
    await enroll(ashaId, batchId, 60);
    await enroll(raviId, otherBatchId, 60);
    await enroll(meeraId, batchId, 60);
    // Joins mid-month, five days ago.
    await enroll(kiranId, batchId, 5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets an assigned Teacher post, and every active Student and linked Parent see it", async () => {
    teacher();
    const file = await uploadFile(await pdf(), "application/pdf", "notes.pdf");
    expect(file.status).toBe(201);
    expect(file.body).toMatchObject({
      name: "notes.pdf",
      mimeType: "application/pdf",
    });
    const shared = await material({
      linkUrl: "https://example.com/slides",
      classDate: day(-1),
      attachmentIds: [file.body.id],
    });
    expect(shared.status).toBe(201);
    expect(shared.body).toMatchObject({
      postedBy: { role: "teacher", teacherName: "Lakshmi" },
      classDate: day(-1),
      attachments: [{ id: file.body.id, name: "notes.pdf" }],
    });
    const set = await homework();
    expect(set.status).toBe(201);

    for (const viewer of [asha, ashaParent]) {
      viewer();
      const view = await family();
      const student = view.students.find((item) => item.id === ashaId);
      expect(student?.batches).toEqual([
        expect.objectContaining({ id: batchId, access: "active" }),
      ]);
      expect(student?.materials.map((item) => item.id)).toEqual([
        shared.body.id,
      ]);
      expect(student?.homework).toEqual([
        expect.objectContaining({
          id: set.body.id,
          classDate: day(-1),
          dueOn: day(1),
          status: "due",
          canSubmit: true,
          submission: null,
        }),
      ]);
      const fileResponse = await download(
        get(`/a/${file.body.id}`),
        ctx({ id: file.body.id }),
      );
      expect(fileResponse.status).toBe(200);
      expect(fileResponse.headers.get("content-disposition")).toContain(
        "notes.pdf",
      );
    }

    // The owner sees every Batch's items too.
    owner();
    const ownerView = await overview();
    expect(ownerView.body.materials).toHaveLength(1);
    expect(ownerView.body.homework).toHaveLength(1);
    expect(ownerView.body.canEdit).toBe(true);
    // Newest first, from 14 days ahead (a Wednesday, so it has a Class).
    expect(ownerView.body.classDates[0]).toEqual({
      date: day(14),
      startTime: "10:00",
      endTime: "11:00",
    });
  });

  it("refuses Teachers who aren't assigned, families, and other Workspaces", async () => {
    otherTeacher();
    expect((await material()).body.code).toBe("CLASS_WORK_FORBIDDEN");
    expect((await homework()).status).toBe(403);
    expect((await overview()).status).toBe(403);

    teacher();
    expect((await homework({}, otherBatchId)).status).toBe(403);
    const set = await homework();
    otherTeacher();
    expect((await roster(set.body.id)).status).toBe(403);

    asha();
    expect((await material()).status).toBe(403);
    expect((await overview()).status).toBe(403);

    as("user_owner", `org_${randomUUID()}`, "owner");
    expect((await overview()).status).toBe(404);
    expect((await roster(set.body.id)).status).toBe(404);
  });

  it("hides a Batch's items from Students in other Batches", async () => {
    teacher();
    const file = await uploadFile(await png(), "image/png", "sheet.png");
    const set = await homework({ attachmentIds: [file.body.id] });
    ravi();
    const view = await family();
    expect(view.students[0]?.homework).toEqual([]);
    expect(
      (await download(get(`/a/${file.body.id}`), ctx({ id: file.body.id })))
        .status,
    ).toBe(404);
    expect((await submitAs(set.body.id, raviId)).status).toBe(404);
    // A Student can't submit for someone they aren't linked to.
    expect((await submitAs(set.body.id, ashaId)).status).toBe(404);
  });

  it("keeps items from while a dropped Student was enrolled, read-only", async () => {
    teacher();
    const before = await homework({ title: "Before" });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await prisma.trainingInstituteStudent.update({
      where: { id: meeraId },
      data: { droppedAt: new Date(), droppedByUserId: "user_owner" },
    });
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    teacher();
    const after = await homework({ title: "After" });

    meera();
    const student = (await family()).students[0];
    expect(student?.batches[0]?.access).toBe("ended");
    expect(student?.homework.map((item) => item.title)).toEqual(["Before"]);
    expect(student?.homework[0]).toMatchObject({
      status: "reference",
      canSubmit: false,
    });
    expect((await submitAs(before.body.id, meeraId)).body.code).toBe(
      "HOMEWORK_ACCESS_ENDED",
    );
    expect((await submitAs(after.body.id, meeraId)).status).toBe(404);

    teacher();
    const list = await roster(before.body.id);
    expect(list.body.students.map((row) => row.studentName)).not.toContain(
      "Meera",
    );
  });

  it("shows a late joiner earlier items without owing them", async () => {
    teacher();
    const old = await homework({
      title: "Old",
      classDate: day(-20),
      dueOn: day(-18),
    });
    const current = await homework({ title: "Current" });
    kiran();
    const items = (await family()).students[0]?.homework ?? [];
    expect(items.find((item) => item.id === old.body.id)?.status).toBe(
      "reference",
    );
    expect(items.find((item) => item.id === current.body.id)?.status).toBe(
      "due",
    );

    teacher();
    const oldList = await roster(old.body.id);
    expect(oldList.body.students.map((row) => row.studentName)).toEqual([
      "Asha",
      "Meera",
    ]);
    expect(oldList.body.counts.notSubmitted).toBe(2);

    // Submitting it anyway shows up for the Teacher.
    kiran();
    expect((await submitAs(old.body.id, kiranId)).body.status).toBe("late");
    teacher();
    const after = await roster(old.body.id);
    expect(
      after.body.students.find((row) => row.studentId === kiranId),
    ).toMatchObject({ status: "late", inBatch: true });
  });

  it("records who submitted, Late, and the Teacher's check and remark", async () => {
    teacher();
    const file = await uploadFile(await png(), "image/png", "work.png");
    expect(file.status).toBe(201);
    const set = await homework();
    const overdue = await homework({
      title: "Yesterday's",
      classDate: day(-2),
      dueOn: day(-1),
    });

    asha();
    expect((await familyHomework(overdue.body.id, ashaId))?.status).toBe(
      "overdue",
    );
    const attachedByTeacher = await submitAs(set.body.id, ashaId, {
      attachmentIds: [file.body.id],
    });
    // The upload belongs to the Teacher, not Asha.
    expect(attachedByTeacher.body.code).toBe("ATTACHMENT_INVALID");

    const work = await uploadFile(await png(), "image/png", "my-work.png");
    const done = await submitAs(set.body.id, ashaId, {
      note: "Done",
      attachmentIds: [work.body.id],
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: "submitted",
      submission: {
        submittedBy: "student",
        late: false,
        note: "Done",
        attachments: [{ id: work.body.id }],
      },
    });

    // A Parent changes it before it's checked; it stays the Student's.
    ashaParent();
    const changed = await submitAs(set.body.id, ashaId, {
      note: "Done, page 2 too",
      attachmentIds: [work.body.id],
    });
    expect(changed.body.submission).toMatchObject({
      submittedBy: "student",
      note: "Done, page 2 too",
      submittedAt: done.body.submission?.submittedAt,
    });
    const late = await submitAs(overdue.body.id, ashaId);
    expect(late.body).toMatchObject({
      status: "late",
      submission: { submittedBy: "parent", late: true },
    });

    teacher();
    const list = await roster(set.body.id);
    expect(list.body.counts).toEqual({
      submitted: 1,
      late: 0,
      notSubmitted: 2,
      checked: 0,
    });
    expect(list.body.students.map((row) => row.status)).toEqual([
      "not_submitted",
      "not_submitted",
      "submitted",
    ]);
    const row = list.body.students.find((item) => item.studentId === ashaId);
    expect(row?.submission?.submittedBy).toBe("student");
    expect((await roster(overdue.body.id)).body.counts.late).toBe(1);
    const teacherDownload = await download(
      get(`/a/${work.body.id}`),
      ctx({ id: work.body.id }),
    );
    expect(teacherDownload.status).toBe(200);

    const submissionId = row?.submission?.id ?? "";
    const checked = await read<SubmissionView & Json>(
      await checkSubmission(
        post(`/h/${set.body.id}/s/${submissionId}/check`, {
          remark: " Neat work ",
        }),
        ctx({ id: set.body.id, submissionId }),
      ),
    );
    expect(checked.body).toMatchObject({ remark: "Neat work" });
    expect(checked.body.checkedAt).not.toBeNull();
    expect((await overview()).body.homework[1]?.counts.checked ?? 0).toBe(0);

    for (const viewer of [asha, ashaParent]) {
      viewer();
      expect(await familyHomework(set.body.id, ashaId)).toMatchObject({
        status: "checked",
        canSubmit: false,
        submission: { remark: "Neat work" },
      });
      expect((await submitAs(set.body.id, ashaId)).body.code).toBe(
        "HOMEWORK_SUBMISSION_CHECKED",
      );
      const undone = await read<Json>(
        await undo(
          post(`/h/${set.body.id}/undo`, { studentId: ashaId }),
          ctx({ id: set.body.id }),
        ),
      );
      expect(undone.body.code).toBe("HOMEWORK_SUBMISSION_CHECKED");
    }

    // Changing the remark keeps the first check time.
    teacher();
    const edited = await read<SubmissionView & Json>(
      await checkSubmission(
        post(`/h/${set.body.id}/s/${submissionId}/check`, { remark: null }),
        ctx({ id: set.body.id, submissionId }),
      ),
    );
    expect(edited.body).toMatchObject({
      remark: null,
      checkedAt: checked.body.checkedAt,
    });
    // Another Batch's Teacher can't check it.
    otherTeacher();
    expect(
      (
        await checkSubmission(
          post(`/x`, { remark: "x" }),
          ctx({ id: set.body.id, submissionId }),
        )
      ).status,
    ).toBe(403);
  });

  it("lets a Student undo before it's checked", async () => {
    teacher();
    const set = await homework();
    asha();
    await submitAs(set.body.id, ashaId);
    const undone = await read<FamilyHomeworkView & Json>(
      await undo(
        post(`/h/${set.body.id}/undo`, { studentId: ashaId }),
        ctx({ id: set.body.id }),
      ),
    );
    expect(undone.body).toMatchObject({ status: "due", submission: null });
    const again = await read<Json>(
      await undo(
        post(`/h/${set.body.id}/undo`, { studentId: ashaId }),
        ctx({ id: set.body.id }),
      ),
    );
    expect(again.body.code).toBe("HOMEWORK_NOT_SUBMITTED");
    // Submitting again starts a new Submission.
    expect((await submitAs(set.body.id, ashaId)).body.status).toBe("submitted");
    teacher();
    expect((await roster(set.body.id)).body.counts.submitted).toBe(1);
  });

  it("needs a Class date the Batch has, and a due date on or after it", async () => {
    teacher();
    expect(
      (await homework({ classDate: SUNDAY, dueOn: day(1) })).body.code,
    ).toBe("CLASS_DATE_INVALID");
    expect(
      (await homework({ classDate: day(-1), dueOn: day(-2) })).body.code,
    ).toBe("HOMEWORK_DUE_BEFORE_CLASS");
    expect((await material({ classDate: SUNDAY })).body.code).toBe(
      "CLASS_DATE_INVALID",
    );
    await prisma.trainingInstituteClassChange.create({
      data: {
        id: randomUUID(),
        workspaceId,
        batchId,
        classDate: new Date(`${day(-1)}T00:00:00.000Z`),
        startTime: "10:00",
        endTime: "11:00",
        kind: "cancelled",
        createdByUserId: "user_owner",
        updatedByUserId: "user_owner",
      },
    });
    expect((await homework()).body.code).toBe("CLASS_DATE_INVALID");
    const view = await overview();
    const dates = view.body.classDates.map((item) => item.date);
    expect(dates).not.toContain(day(-1));
    expect(dates).not.toContain(SUNDAY);
    expect(dates).toContain(day(-2));
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("shows edits to families and hides removed items from everyone but the Owner", async () => {
    teacher();
    const file = await uploadFile(await pdf(), "application/pdf", "q.pdf");
    const set = await homework({ attachmentIds: [file.body.id] });
    const edited = await read<HomeworkView & Json>(
      await updateHomework(
        post(`/h/${set.body.id}/update`, {
          title: "Chapter 3, revised",
          instructions: "Exercises 1 to 3",
          classDate: day(-2),
          dueOn: day(2),
          attachmentIds: [],
        }),
        ctx({ id: set.body.id }),
      ),
    );
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      title: "Chapter 3, revised",
      classDate: day(-2),
      dueOn: day(2),
      attachments: [],
    });
    asha();
    expect(await familyHomework(set.body.id, ashaId)).toMatchObject({
      instructions: "Exercises 1 to 3",
      dueOn: day(2),
    });
    // The detached file is gone.
    expect(
      (await download(get(`/a/${file.body.id}`), ctx({ id: file.body.id })))
        .status,
    ).toBe(404);

    teacher();
    const shared = await material();
    expect(
      (
        await removeHomework(
          post(`/h/${set.body.id}/remove`),
          ctx({ id: set.body.id }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await removeMaterial(post(`/m/remove`), ctx({ id: shared.body.id })))
        .status,
    ).toBe(200);
    expect((await overview()).body.homework).toEqual([]);
    expect((await roster(set.body.id)).status).toBe(404);
    expect(
      (
        await updateMaterial(
          post(`/m/update`, { title: "x", note: "y" }),
          ctx({ id: shared.body.id }),
        )
      ).status,
    ).toBe(404);

    asha();
    const student = (await family()).students[0];
    expect(student?.homework).toEqual([]);
    expect(student?.materials).toEqual([]);
    expect((await submitAs(set.body.id, ashaId)).status).toBe(404);

    owner();
    const kept = await overview();
    expect(kept.body.homework[0]).toMatchObject({ id: set.body.id });
    expect(kept.body.homework[0]?.removedAt).not.toBeNull();
    expect(kept.body.materials[0]?.removedAt).not.toBeNull();
    expect((await roster(set.body.id)).status).toBe(200);
    const refused = await read<Json>(
      await updateMaterial(
        post(`/m/update`, { title: "x", note: "y" }),
        ctx({ id: shared.body.id }),
      ),
    );
    expect(refused).toMatchObject({
      status: 409,
      body: { code: "STUDY_MATERIAL_REMOVED" },
    });
  });

  it("closes a Batch to new items but keeps it readable", async () => {
    teacher();
    const set = await homework();
    asha();
    await submitAs(set.body.id, ashaId);
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: { closedAt: new Date(), closedByUserId: "user_owner" },
    });
    teacher();
    expect((await homework()).body.code).toBe("BATCH_CLOSED");
    expect((await material()).status).toBe(409);
    const view = await overview();
    expect(view.body).toMatchObject({
      canEdit: false,
      batch: { closed: true },
    });
    const list = await roster(set.body.id);
    const submissionId = list.body.students.find(
      (row) => row.studentId === ashaId,
    )?.submission?.id;
    expect(
      (
        await checkSubmission(
          post(`/c`, { remark: "Good" }),
          ctx({ id: set.body.id, submissionId: submissionId ?? "" }),
        )
      ).status,
    ).toBe(200);
    asha();
    expect(await familyHomework(set.body.id, ashaId)).toMatchObject({
      status: "checked",
      submission: { remark: "Good" },
    });
  });

  it("validates Study Material and files", async () => {
    teacher();
    expect((await material({ note: null })).body.code).toBe(
      "STUDY_MATERIAL_EMPTY",
    );
    expect(
      (await material({ note: null, linkUrl: "javascript:alert(1)" })).body
        .code,
    ).toBe("LINK_URL_INVALID");
    expect(
      (await material({ note: null, linkUrl: "https://x.org" })).status,
    ).toBe(201);

    expect((await uploadFile(await png(), "image/gif")).body.code).toBe(
      "ATTACHMENT_TYPE_INVALID",
    );
    expect((await uploadFile(await png(), "application/pdf")).body.code).toBe(
      "ATTACHMENT_FILE_INVALID",
    );
    expect(
      (await uploadFile(new Uint8Array(4 * 1024 * 1024 + 1), "image/png"))
        .status,
    ).toBe(413);
    // A streamed body with no Content-Length stops at the limit too.
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const streamed = await upload(
      new Request("http://localhost/api/training-institute/attachments", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            sent += 1;
            if (sent > 64) controller.close();
            else controller.enqueue(chunk);
          },
        }),
        duplex: "half",
      } as RequestInit),
    );
    expect(streamed.status).toBe(413);
    expect(sent).toBeLessThan(10);

    const ids: string[] = [];
    for (let index = 0; index < 6; index += 1)
      ids.push(
        (await uploadFile(await png(), "image/png", `p${index}.png`)).body.id,
      );
    expect((await material({ attachmentIds: ids })).status).toBe(400);
    const five = await material({ attachmentIds: ids.slice(0, 5) });
    expect(five.body.attachments).toHaveLength(5);
    // An attached file can't be attached to something else.
    expect((await material({ attachmentIds: [ids[0]] })).body.code).toBe(
      "ATTACHMENT_INVALID",
    );
    expect((await material({ attachmentIds: [randomUUID()] })).body.code).toBe(
      "ATTACHMENT_INVALID",
    );
  });
});
