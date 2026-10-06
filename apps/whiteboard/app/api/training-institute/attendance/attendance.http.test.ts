import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listRegisters, POST as openRegister } from "./registers/route";
import { GET as getRegister } from "./registers/[id]/route";
import { POST as saveMarks } from "./registers/[id]/marks/route";
import { GET as getStudentAttendance } from "../students/[id]/attendance/route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const mockedAuth = vi.mocked(auth);
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const DAY = new Date(`${TODAY}T12:00:00.000Z`).getUTCDay();
const YESTERDAY = new Date(Date.parse(`${TODAY}T12:00:00.000Z`) - 86_400_000)
  .toISOString()
  .slice(0, 10);
const TOMORROW = new Date(Date.parse(`${TODAY}T12:00:00.000Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);

type RegisterJson = {
  id: string;
  batchId: string;
  date: string;
  marks: { enrollmentId: string; studentId: string; status: string }[];
  summary: {
    total: number;
    unmarked: number;
    present: number;
    complete: boolean;
  };
};

function session(
  userId: string | null,
  orgId: string | null,
  orgRole = "org:admin",
) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

function request(
  body: unknown,
  url = "http://localhost/api/training-institute/attendance/registers",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Student Attendance HTTP APIs", () => {
  let workspaceId: string;
  let batchId: string;
  let studentId: string;
  let enrollmentId: string;
  let teacherId: string;

  beforeEach(async () => {
    workspaceId = `org_${randomUUID()}`;
    batchId = randomUUID();
    studentId = randomUUID();
    enrollmentId = randomUUID();
    teacherId = randomUUID();
    session("user_owner", workspaceId);
    const courseId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
        name: "Morning",
        classMode: "offline",
        capacity: 10,
        timings: [{ daysOfWeek: [DAY], startTime: "10:00", endTime: "11:00" }],
      },
    });
    await prisma.trainingInstituteStudent.create({
      data: {
        id: studentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Asha",
        phone: "9876543210",
      },
    });
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id: enrollmentId,
        workspaceId,
        studentId,
        courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 1000,
        feePlanDueDates: [],
      },
    });
    await prisma.trainingInstituteTeacher.create({
      data: {
        id: teacherId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Meera",
        email: `${teacherId}@example.com`,
        kind: "centre_teacher",
        clerkUserId: "user_teacher",
        invitationStatus: "accepted",
      },
    });
  });

  it("opens today's Register once, marks Students, and audits corrections", async () => {
    const first = await openRegister(request({ batchId }));
    expect(first.status).toBe(201);
    const register = (await first.json()) as RegisterJson;
    expect(register).toMatchObject({
      batchId,
      date: TODAY,
      summary: { total: 1, unmarked: 1, complete: false },
    });
    expect(register.marks).toMatchObject([
      { enrollmentId, studentId, status: "unmarked" },
    ]);
    const second = await openRegister(request({ batchId }));
    expect(((await second.json()) as RegisterJson).id).toBe(register.id);

    const context = { params: Promise.resolve({ id: register.id }) };
    const saved = await saveMarks(
      request(
        { marks: [{ enrollmentId, status: "present" }] },
        `http://localhost/api/training-institute/attendance/registers/${register.id}/marks`,
      ),
      context,
    );
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as RegisterJson).summary).toMatchObject({
      present: 1,
      complete: true,
    });
    const corrected = await saveMarks(
      request(
        { marks: [{ enrollmentId, status: "late", note: "Arrived later" }] },
        `http://localhost/api/training-institute/attendance/registers/${register.id}/marks`,
      ),
      context,
    );
    expect(corrected.status).toBe(200);
    expect(
      await prisma.trainingInstituteAttendanceMarkChange.count({
        where: { mark: { registerId: register.id } },
      }),
    ).toBe(2);
    expect(
      (
        (await getRegister(
          new Request(
            `http://localhost/api/training-institute/attendance/registers/${register.id}`,
          ),
          context,
        ).then((r) => r.json())) as RegisterJson
      ).marks[0]?.status,
    ).toBe("late");
  });

  it("opens a missed day's Register using the current scheduled roster and reuses it", async () => {
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: {
        createdAt: new Date(`${YESTERDAY}T00:00:00.000Z`),
        timings: [
          { daysOfWeek: [(DAY + 6) % 7], startTime: "10:00", endTime: "11:00" },
        ],
      },
    });
    const first = await openRegister(request({ batchId, date: YESTERDAY }));
    expect(first.status).toBe(201);
    const register = (await first.json()) as RegisterJson;
    expect(register).toMatchObject({
      date: YESTERDAY,
      marks: [{ enrollmentId, studentId, status: "unmarked" }],
    });
    const second = await openRegister(request({ batchId, date: YESTERDAY }));
    expect(((await second.json()) as RegisterJson).id).toBe(register.id);
    expect(
      await prisma.trainingInstituteAttendanceRegister.count({
        where: { batchId },
      }),
    ).toBe(1);
    const saved = await saveMarks(
      request({ marks: [{ enrollmentId, status: "present" }] }),
      { params: Promise.resolve({ id: register.id }) },
    );
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as RegisterJson).summary.complete).toBe(true);
  });

  it("rejects future dates and dates before the Batch existed", async () => {
    expect(
      (await openRegister(request({ batchId, date: TOMORROW }))).status,
    ).toBe(400);
    expect(
      (await openRegister(request({ batchId, date: YESTERDAY }))).status,
    ).toBe(400);
    expect(
      await prisma.trainingInstituteAttendanceRegister.count({
        where: { batchId },
      }),
    ).toBe(0);
  });

  it("snapshots only scheduled Enrollments and keeps past roster after Enrollment ends", async () => {
    const otherStudentId = randomUUID();
    const otherEnrollmentId = randomUUID();
    const courseId = (
      await prisma.trainingInstituteBatch.findUniqueOrThrow({
        where: { id: batchId },
      })
    ).courseId;
    await prisma.trainingInstituteStudent.create({
      data: {
        id: otherStudentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Nina",
        phone: "9876543211",
      },
    });
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id: otherEnrollmentId,
        workspaceId,
        studentId: otherStudentId,
        courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "student",
        studentTimings: [
          { daysOfWeek: [(DAY + 1) % 7], startTime: "10:00", endTime: "11:00" },
        ],
        feePlanType: "one_time",
        feePlanAmountPaise: 1000,
        feePlanDueDates: [],
      },
    });
    const register = (await (
      await openRegister(request({ batchId }))
    ).json()) as RegisterJson;
    expect(register.marks.map((mark) => mark.enrollmentId)).toEqual([
      enrollmentId,
    ]);
    await prisma.trainingInstituteEnrollment.update({
      where: { id: enrollmentId },
      data: { endedAt: new Date() },
    });
    const fetched = await getRegister(
      new Request(
        `http://localhost/api/training-institute/attendance/registers/${register.id}`,
      ),
      { params: Promise.resolve({ id: register.id }) },
    );
    expect(
      ((await fetched.json()) as RegisterJson).marks.map(
        (mark) => mark.studentId,
      ),
    ).toEqual([studentId]);
  });

  it("limits Teacher access to assigned Batches and lets the Owner see Student history", async () => {
    session("user_teacher", workspaceId, "org:teacher");
    expect((await openRegister(request({ batchId }))).status).toBe(404);
    await prisma.trainingInstituteBatchTeacherAssignment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        teacherId,
        batchId,
        assignedByUserId: "user_owner",
      },
    });
    const created = await openRegister(request({ batchId }));
    expect(created.status).toBe(201);
    const register = (await created.json()) as RegisterJson;
    expect(
      (
        await listRegisters(
          new Request(
            `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}`,
          ),
        )
      ).status,
    ).toBe(200);
    session("user_owner", workspaceId);
    const history = await getStudentAttendance(
      new Request(
        `http://localhost/api/training-institute/students/${studentId}/attendance`,
      ),
      { params: Promise.resolve({ id: studentId }) },
    );
    expect(history.status).toBe(200);
    expect(
      ((await history.json()) as { items: { registerId: string }[] }).items[0]
        ?.registerId,
    ).toBe(register.id);
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: {
        createdAt: new Date(`${YESTERDAY}T00:00:00.000Z`),
        timings: [
          {
            daysOfWeek: [DAY, (DAY + 6) % 7],
            startTime: "10:00",
            endTime: "11:00",
          },
        ],
      },
    });
    session("user_teacher", workspaceId, "org:teacher");
    const earlier = await openRegister(request({ batchId, date: YESTERDAY }));
    expect(earlier.status).toBe(201);
    expect(((await earlier.json()) as RegisterJson).date).toBe(YESTERDAY);
    session("user_parent", workspaceId, "org:parent");
    expect(
      (
        await getStudentAttendance(
          new Request(
            `http://localhost/api/training-institute/students/${studentId}/attendance`,
          ),
          { params: Promise.resolve({ id: studentId }) },
        )
      ).status,
    ).toBe(403);
  });

  it("rejects foreign Workspace resources and invalid Marks", async () => {
    const register = (await (
      await openRegister(request({ batchId }))
    ).json()) as RegisterJson;
    const context = { params: Promise.resolve({ id: register.id }) };
    expect(
      (
        await saveMarks(
          request({
            marks: [{ enrollmentId: randomUUID(), status: "present" }],
          }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await saveMarks(
          request({ marks: [{ enrollmentId, status: "here" }] }),
          context,
        )
      ).status,
    ).toBe(400);
    session("user_other", `org_${randomUUID()}`);
    expect(
      (
        await getRegister(
          new Request(
            `http://localhost/api/training-institute/attendance/registers/${register.id}`,
          ),
          context,
        )
      ).status,
    ).toBe(404);
  });

  it("enforces Session, active Workspace, and Teacher assignment on every operation", async () => {
    session(null, null);
    expect((await openRegister(request({ batchId }))).status).toBe(401);
    session("user_owner", null);
    expect((await openRegister(request({ batchId }))).status).toBe(403);
    session("user_owner", workspaceId);
    const register = (await (
      await openRegister(request({ batchId }))
    ).json()) as RegisterJson;
    const context = { params: Promise.resolve({ id: register.id }) };
    session("user_teacher", workspaceId, "org:teacher");
    expect(
      (
        await getRegister(
          new Request(
            `http://localhost/api/training-institute/attendance/registers/${register.id}`,
          ),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await saveMarks(
          request({ marks: [{ enrollmentId, status: "present" }] }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await listRegisters(
          new Request(
            `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}`,
          ),
        )
      ).status,
    ).toBe(404);
    session("user_owner", workspaceId);
    expect(
      await prisma.trainingInstituteAttendanceMarkChange.count({
        where: { mark: { registerId: register.id } },
      }),
    ).toBe(0);
  });

  it("rejects an unscheduled or empty roster and does not create a Register", async () => {
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: {
        timings: [
          { daysOfWeek: [(DAY + 1) % 7], startTime: "10:00", endTime: "11:00" },
        ],
      },
    });
    expect((await openRegister(request({ batchId }))).status).toBe(409);
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: {
        timings: [{ daysOfWeek: [DAY], startTime: "10:00", endTime: "11:00" }],
      },
    });
    await prisma.trainingInstituteEnrollment.update({
      where: { id: enrollmentId },
      data: { endedAt: new Date() },
    });
    expect((await openRegister(request({ batchId }))).status).toBe(409);
    expect(
      await prisma.trainingInstituteAttendanceRegister.count({
        where: { batchId },
      }),
    ).toBe(0);
  });

  it("includes a Student scheduled by individual Timings when Batch Timings omit today", async () => {
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: {
        timings: [
          { daysOfWeek: [(DAY + 1) % 7], startTime: "10:00", endTime: "11:00" },
        ],
      },
    });
    await prisma.trainingInstituteEnrollment.update({
      where: { id: enrollmentId },
      data: {
        timingSource: "student",
        studentTimings: [
          { daysOfWeek: [DAY], startTime: "10:00", endTime: "11:00" },
        ],
      },
    });
    const response = await openRegister(request({ batchId }));
    expect(response.status).toBe(201);
    expect(
      ((await response.json()) as RegisterJson).marks.map(
        (mark) => mark.enrollmentId,
      ),
    ).toEqual([enrollmentId]);
  });

  it("saves atomically and does not audit an identical retry", async () => {
    const register = (await (
      await openRegister(request({ batchId }))
    ).json()) as RegisterJson;
    const context = { params: Promise.resolve({ id: register.id }) };
    const mark = { enrollmentId, status: "present" };
    expect(
      (await saveMarks(request({ marks: [mark, mark] }), context)).status,
    ).toBe(400);
    expect(
      (
        await saveMarks(
          request({
            marks: [mark, { enrollmentId: randomUUID(), status: "absent" }],
          }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      await prisma.trainingInstituteAttendanceMarkChange.count({
        where: { mark: { registerId: register.id } },
      }),
    ).toBe(0);
    expect((await saveMarks(request({ marks: [mark] }), context)).status).toBe(
      200,
    );
    expect((await saveMarks(request({ marks: [mark] }), context)).status).toBe(
      200,
    );
    expect(
      await prisma.trainingInstituteAttendanceMarkChange.count({
        where: { mark: { registerId: register.id } },
      }),
    ).toBe(1);
  });

  it("pages Batch Registers and Student history in both directions", async () => {
    const current = (await (
      await openRegister(request({ batchId }))
    ).json()) as RegisterJson;
    const previousId = randomUUID();
    const yesterday = new Date(`${TODAY}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.trainingInstituteAttendanceRegister.create({
      data: {
        id: previousId,
        workspaceId,
        batchId,
        date: yesterday,
        timezone: "Asia/Kolkata",
        createdByUserId: "user_owner",
        createdAt: yesterday,
        updatedAt: yesterday,
        marks: {
          create: [
            {
              id: randomUUID(),
              workspaceId,
              enrollmentId,
              studentId,
              studentNameSnapshot: "Asha",
              status: "present",
              createdAt: yesterday,
              updatedAt: yesterday,
            },
          ],
        },
      },
    });
    const firstPage = (await (
      await listRegisters(
        new Request(
          `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}&limit=1`,
        ),
      )
    ).json()) as { items: RegisterJson[]; total: number; nextCursor: string };
    expect(firstPage.items.map((item) => item.id)).toEqual([current.id]);
    expect(firstPage.total).toBe(2);
    const nextPage = (await (
      await listRegisters(
        new Request(
          `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}&limit=1&after=${encodeURIComponent(firstPage.nextCursor)}`,
        ),
      )
    ).json()) as { items: RegisterJson[]; prevCursor: string };
    expect(nextPage.items.map((item) => item.id)).toEqual([previousId]);
    const backPage = (await (
      await listRegisters(
        new Request(
          `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}&limit=1&before=${encodeURIComponent(nextPage.prevCursor)}`,
        ),
      )
    ).json()) as { items: RegisterJson[] };
    expect(backPage.items.map((item) => item.id)).toEqual([current.id]);
    const history = (await (
      await getStudentAttendance(
        new Request(
          `http://localhost/api/training-institute/students/${studentId}/attendance?limit=1`,
        ),
        { params: Promise.resolve({ id: studentId }) },
      )
    ).json()) as {
      items: { registerId: string }[];
      total: number;
      nextCursor: string;
    };
    expect(history.items[0]?.registerId).toBe(current.id);
    expect(history.total).toBe(2);
    const older = (await (
      await getStudentAttendance(
        new Request(
          `http://localhost/api/training-institute/students/${studentId}/attendance?limit=1&after=${encodeURIComponent(history.nextCursor)}`,
        ),
        { params: Promise.resolve({ id: studentId }) },
      )
    ).json()) as { items: { registerId: string }[] };
    expect(older.items[0]?.registerId).toBe(previousId);
  });
});
