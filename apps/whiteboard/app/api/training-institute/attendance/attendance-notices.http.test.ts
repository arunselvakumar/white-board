import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listRegisters, POST as openRegister } from "./registers/route";
import { GET as getRegister } from "./registers/[id]/route";
import { POST as saveMarks } from "./registers/[id]/marks/route";
import { GET as getStudentAttendance } from "../students/[id]/attendance/route";
import { GET as getFamilyHome } from "../home/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));
const mockedAuth = vi.mocked(getAuth);

// Monday 2026-10-12, 12:00 in Asia/Kolkata. The clock is fixed so the
// notices seeded for TODAY always match the Register the handler opens.
const NOW = new Date("2026-10-12T06:30:00.000Z");
const TODAY = "2026-10-12";
/** Rows that must exist before TODAY; Prisma's now() uses the real clock. */
const LAST_MONTH = new Date("2026-09-12T06:30:00.000Z");
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

type Notice = {
  noticeId: string;
  reason: string;
  note: string | null;
  givenAt: string;
  givenBy: { role: string; name: string };
};
type Mark = {
  enrollmentId: string;
  studentId: string;
  status: string;
  notice: Notice | null;
};
type Summary = {
  total: number;
  unmarked: number;
  present: number;
  absent: number;
  informedAbsent: number;
  late: number;
  excused: number;
  attended: number;
  complete: boolean;
};
type RegisterJson = {
  id: string;
  date: string;
  marks: Mark[];
  summary: Summary;
};

function session(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole = "owner",
  email = `${userId}@example.test`,
) {
  mockedAuth.mockResolvedValue(
    authStateFor({ userId, workspaceId, role, email, emailVerified: true }),
  );
}

function post(body: unknown): Request {
  return new Request(
    "http://localhost/api/training-institute/attendance/registers",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("Attendance and Absence Notices HTTP", () => {
  let workspaceId: string;
  let batchId: string;
  let ashaId: string;
  let ashaEnrollmentId: string;
  let raviId: string;
  let raviEnrollmentId: string;

  async function addStudent(name: string, email: string) {
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    const { courseId } = await prisma.trainingInstituteBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    await prisma.trainingInstituteStudent.create({
      data: {
        id: studentId,
        workspaceId,
        createdByUserId: "user_owner",
        name,
        phone: "9876543210",
        email,
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
        createdAt: LAST_MONTH,
      },
    });
    return { studentId, enrollmentId };
  }

  async function giveNotice(
    studentId: string,
    enrollmentId: string,
    overrides: Partial<{
      startTime: string;
      endTime: string;
      withdrawnAt: Date;
      givenByRole: "student" | "parent";
      givenByName: string;
    }> = {},
  ): Promise<string> {
    const id = randomUUID();
    await prisma.trainingInstituteAbsenceNotice.create({
      data: {
        id,
        workspaceId,
        studentId,
        enrollmentId,
        batchId,
        classDate: day(TODAY),
        startTime: overrides.startTime ?? "10:00",
        endTime: overrides.endTime ?? "11:00",
        reason: "sick",
        note: "Fever since last night",
        givenAt: new Date("2026-09-01T10:00:00.000Z"),
        givenByUserId: "user_parent",
        givenByRole: overrides.givenByRole ?? "parent",
        givenByName: overrides.givenByName ?? "Lakshmi",
        withdrawnAt: overrides.withdrawnAt ?? null,
        withdrawnByUserId: overrides.withdrawnAt ? "user_parent" : null,
        withdrawnByRole: overrides.withdrawnAt ? "parent" : null,
      },
    });
    return id;
  }

  async function open(): Promise<RegisterJson> {
    const response = await openRegister(post({ batchId }));
    expect(response.status).toBe(201);
    return (await response.json()) as RegisterJson;
  }

  async function get(id: string): Promise<RegisterJson> {
    const response = await getRegister(
      new Request(
        `http://localhost/api/training-institute/attendance/registers/${id}`,
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as RegisterJson;
  }

  const noticeOf = (register: RegisterJson | undefined, enrollmentId: string) =>
    register?.marks.find((mark) => mark.enrollmentId === enrollmentId)?.notice;

  async function changeClass(
    data: Partial<{
      kind: "cancelled" | "moved";
      movedToDate: Date;
      movedToStartTime: string;
      movedToEndTime: string;
    }>,
  ) {
    await prisma.trainingInstituteClassChange.create({
      data: {
        id: randomUUID(),
        workspaceId,
        batchId,
        classDate: day(TODAY),
        startTime: "10:00",
        endTime: "11:00",
        kind: data.kind ?? "cancelled",
        movedToDate: data.movedToDate ?? null,
        movedToStartTime: data.movedToStartTime ?? null,
        movedToEndTime: data.movedToEndTime ?? null,
        createdByUserId: "user_owner",
        updatedByUserId: "user_owner",
      },
    });
  }

  beforeEach(async () => {
    // Only Date is faked; Prisma's timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    workspaceId = `org_${randomUUID()}`;
    batchId = randomUUID();
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
        timings: [
          { daysOfWeek: EVERY_DAY, startTime: "10:00", endTime: "11:00" },
        ],
        createdAt: LAST_MONTH,
      },
    });
    ({ studentId: ashaId, enrollmentId: ashaEnrollmentId } = await addStudent(
      "Asha",
      `asha-${randomUUID()}@example.com`,
    ));
    ({ studentId: raviId, enrollmentId: raviEnrollmentId } = await addStudent(
      "Ravi",
      `ravi-${randomUUID()}@example.com`,
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags a Student with a live notice and leaves every mark Unmarked", async () => {
    const noticeId = await giveNotice(raviId, raviEnrollmentId);
    const register = await open();
    expect(register.summary).toMatchObject({
      total: 2,
      unmarked: 2,
      informedAbsent: 0,
    });
    expect(register.marks.map((mark) => mark.status)).toEqual([
      "unmarked",
      "unmarked",
    ]);
    expect(noticeOf(register, ashaEnrollmentId)).toBeNull();
    expect(noticeOf(register, raviEnrollmentId)).toEqual({
      noticeId,
      reason: "sick",
      note: "Fever since last night",
      givenAt: "2026-09-01T10:00:00.000Z",
      givenBy: { role: "parent", name: "Lakshmi" },
    });
    // Nothing is marked in the database by a notice.
    expect(
      await prisma.trainingInstituteAttendanceMark.count({
        where: { registerId: register.id, status: { not: "unmarked" } },
      }),
    ).toBe(0);
    // The Batch's list of Registers carries the flag too.
    const list = (await (
      await listRegisters(
        new Request(
          `http://localhost/api/training-institute/attendance/registers?batchId=${batchId}`,
        ),
      )
    ).json()) as { items: RegisterJson[] };
    expect(noticeOf(list.items[0], raviEnrollmentId)?.noticeId).toBe(noticeId);
  });

  it("does not flag a withdrawn notice, an ended Enrollment, or another Workspace's notice", async () => {
    await giveNotice(raviId, raviEnrollmentId, { withdrawnAt: new Date() });
    const register = await open();
    expect(noticeOf(register, raviEnrollmentId)).toBeNull();

    await giveNotice(ashaId, ashaEnrollmentId, {
      givenByRole: "student",
      givenByName: "Asha",
    });
    expect(noticeOf(await get(register.id), ashaEnrollmentId)).toMatchObject({
      givenBy: { role: "student", name: "Asha" },
    });
    await prisma.trainingInstituteEnrollment.update({
      where: { id: ashaEnrollmentId },
      data: { endedAt: new Date() },
    });
    expect(noticeOf(await get(register.id), ashaEnrollmentId)).toBeNull();

    session("user_other", `org_${randomUUID()}`);
    expect(
      (
        await getRegister(
          new Request(
            `http://localhost/api/training-institute/attendance/registers/${register.id}`,
          ),
          { params: Promise.resolve({ id: register.id }) },
        )
      ).status,
    ).toBe(404);
  });

  it("drops the flag when the Class is cancelled or is a Holiday", async () => {
    await giveNotice(raviId, raviEnrollmentId);
    const register = await open();
    expect(noticeOf(register, raviEnrollmentId)).not.toBeNull();

    await prisma.trainingInstituteHoliday.create({
      data: {
        id: randomUUID(),
        workspaceId,
        startDate: day(TODAY),
        endDate: day(TODAY),
        createdByUserId: "user_owner",
      },
    });
    expect(noticeOf(await get(register.id), raviEnrollmentId)).toBeNull();
    await prisma.trainingInstituteHoliday.deleteMany({
      where: { workspaceId },
    });
    expect(noticeOf(await get(register.id), raviEnrollmentId)).not.toBeNull();

    await changeClass({ kind: "cancelled" });
    expect(noticeOf(await get(register.id), raviEnrollmentId)).toBeNull();
  });

  it("drops the flag when the Class is moved and flags a notice for its new time", async () => {
    const register = await open();
    await giveNotice(raviId, raviEnrollmentId);
    await changeClass({
      kind: "moved",
      movedToDate: day(TODAY),
      movedToStartTime: "16:00",
      movedToEndTime: "17:00",
    });
    expect(noticeOf(await get(register.id), raviEnrollmentId)).toBeNull();

    const movedNotice = await giveNotice(ashaId, ashaEnrollmentId, {
      startTime: "16:00",
      endTime: "17:00",
    });
    expect(noticeOf(await get(register.id), ashaEnrollmentId)?.noticeId).toBe(
      movedNotice,
    );
  });

  it("saves Informed absent and counts it apart in the summary, Student history, and family Home", async () => {
    await giveNotice(raviId, raviEnrollmentId);
    const register = await open();
    const saved = await saveMarks(
      post({
        marks: [
          { enrollmentId: ashaEnrollmentId, status: "absent" },
          { enrollmentId: raviEnrollmentId, status: "informed_absent" },
        ],
      }),
      { params: Promise.resolve({ id: register.id }) },
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as RegisterJson;
    expect(body.summary).toEqual({
      total: 2,
      unmarked: 0,
      present: 0,
      absent: 1,
      informedAbsent: 1,
      late: 0,
      excused: 0,
      attended: 0,
      complete: true,
    });
    // The flag stays on the saved Register.
    expect(noticeOf(body, raviEnrollmentId)).not.toBeNull();

    const history = await getStudentAttendance(
      new Request(
        `http://localhost/api/training-institute/students/${raviId}/attendance`,
      ),
      { params: Promise.resolve({ id: raviId }) },
    );
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      items: [{ registerId: register.id, status: "informed_absent" }],
      summary: { total: 1, absent: 0, informedAbsent: 1, attended: 0 },
    });

    const raviEmail = (
      await prisma.trainingInstituteStudent.findUniqueOrThrow({
        where: { id: raviId },
      })
    ).email;
    session("user_ravi", workspaceId, "student", raviEmail ?? "");
    const home = await getFamilyHome();
    expect(home.status).toBe(200);
    expect(await home.json()).toMatchObject({
      students: [
        {
          id: raviId,
          recentAttendance: [{ date: TODAY, status: "informed_absent" }],
        },
      ],
    });
  });
});
