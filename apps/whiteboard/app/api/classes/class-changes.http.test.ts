import { randomUUID } from "node:crypto";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { POST as openRegister } from "../attendance/registers/route";
import { POST as updateBatchSchedule } from "../batches/[id]/schedule/route";
import { POST as setEnrollmentTimings } from "../enrollments/[id]/timings/route";
import { POST as saveMarks } from "../attendance/registers/[id]/marks/route";
import { GET as getCalendar } from "../calendar/route";
import { GET as getDashboard } from "../dashboard/route";
import { POST as declareHoliday } from "../holidays/route";
import { POST as removeHoliday } from "../holidays/[id]/remove/route";
import { GET as getClass } from "./[batchId]/[date]/[startTime]/route";
import { POST as cancelClass } from "./[batchId]/[date]/[startTime]/cancel/route";
import { POST as moveClass } from "./[batchId]/[date]/[startTime]/move/route";
import { POST as restoreClass } from "./[batchId]/[date]/[startTime]/restore/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);
const mockedClerkClient = vi.mocked(clerkClient);
const getUser = vi.fn();

// Pin the clock to 10:00 IST today so "today" tests run at any hour.
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const PINNED_NOW = new Date(`${TODAY}T04:30:00.000Z`);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

type Json = Record<string, unknown> & { code?: string };

function session(
  userId: string | null,
  orgId: string | null,
  orgRole = "org:admin",
) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

function verifiedEmail(emailAddress: string) {
  getUser.mockResolvedValue({
    firstName: "Test",
    lastName: null,
    username: null,
    emailAddresses: [{ emailAddress, verification: { status: "verified" } }],
  });
}

function post(body?: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function classContext(batchId: string, date: string, startTime: string) {
  return { params: Promise.resolve({ batchId, date, startTime }) };
}

async function json(
  response: Response,
): Promise<{ status: number; body: Json }> {
  return {
    status: response.status,
    body: response.status === 204 ? {} : ((await response.json()) as Json),
  };
}

async function cancel(
  batchId: string,
  date: string,
  startTime: string,
  reason?: string,
) {
  return json(
    await cancelClass(
      post(reason === undefined ? {} : { reason }),
      classContext(batchId, date, startTime),
    ),
  );
}

async function move(
  batchId: string,
  date: string,
  startTime: string,
  to: { date: string; startTime: string; endTime: string; reason?: string },
) {
  return json(
    await moveClass(post(to), classContext(batchId, date, startTime)),
  );
}

async function restore(batchId: string, date: string, startTime: string) {
  return json(
    await restoreClass(post(), classContext(batchId, date, startTime)),
  );
}

type CalendarJson = {
  classChanges: {
    batchId: string;
    date: string;
    startTime: string;
    kind: string;
    reason: string | null;
    movedTo: { date: string; startTime: string; endTime: string } | null;
  }[];
  holidays: { id: string; startDate: string; endDate: string }[];
};

async function calendar(): Promise<CalendarJson> {
  return (await getCalendar()).json() as Promise<CalendarJson>;
}

async function seedWorkspace(timings: unknown) {
  const workspaceId = `org_${randomUUID()}`;
  const courseId = randomUUID();
  const batchId = randomUUID();
  const batchStudentId = randomUUID();
  const homeStudentId = randomUUID();
  const homeEnrollmentId = randomUUID();
  const batchEnrollmentId = randomUUID();
  await prisma.course.create({
    data: {
      id: courseId,
      workspaceId,
      createdByUserId: "user_owner",
      name: "DCA",
      defaultFeeAmountPaise: 0,
    },
  });
  await prisma.batch.create({
    data: {
      id: batchId,
      workspaceId,
      courseId,
      createdByUserId: "user_owner",
      name: "DCA Weekday 9–11",
      classMode: "online",
      meetingOption: "external",
      joinUrl: "https://meet.google.com/example",
      capacity: 20,
      timings: timings as never,
      createdAt: new Date(Date.now() - 30 * 86_400_000),
    },
  });
  await prisma.student.createMany({
    data: [
      {
        id: batchStudentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Asha",
        phone: "9876543210",
        email: "asha@example.com",
      },
      {
        id: homeStudentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Ravi",
        phone: "9876543211",
        email: "ravi@example.com",
      },
    ],
  });
  const enrollment = {
    workspaceId,
    courseId,
    batchId,
    createdByUserId: "user_owner",
    feePlanType: "one_time" as const,
    feePlanAmountPaise: 0,
    feePlanDueDates: [{ dueOn: day(30), amountPaise: 0 }],
    createdAt: new Date(Date.now() - 30 * 86_400_000),
  };
  await prisma.enrollment.createMany({
    data: [
      {
        ...enrollment,
        id: batchEnrollmentId,
        studentId: batchStudentId,
        timingSource: "batch",
      },
      {
        ...enrollment,
        id: homeEnrollmentId,
        studentId: homeStudentId,
        timingSource: "student",
        studentTimings: [
          {
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime: "17:00",
            endTime: "18:00",
          },
        ],
      },
    ],
  });
  const teacherId = randomUUID();
  await prisma.teacher.createMany({
    data: [
      {
        id: teacherId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Meera",
        email: `${teacherId}@example.com`,
        kind: "centre_teacher",
        clerkUserId: "user_teacher",
      },
      {
        id: randomUUID(),
        workspaceId,
        createdByUserId: "user_owner",
        name: "Kumar",
        email: `${randomUUID()}@example.com`,
        kind: "centre_teacher",
        clerkUserId: "user_other_teacher",
      },
    ],
  });
  await prisma.batchTeacherAssignment.create({
    data: {
      id: randomUUID(),
      workspaceId,
      teacherId,
      batchId,
      assignedByUserId: "user_owner",
    },
  });
  return { workspaceId, batchId, batchEnrollmentId, homeEnrollmentId };
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe("Class changes HTTP", () => {
  let workspaceId: string;
  let batchId: string;
  let homeEnrollmentId: string;

  beforeEach(async () => {
    getUser.mockReset();
    verifiedEmail("owner@example.com");
    mockedClerkClient.mockResolvedValue({ users: { getUser } } as never);
    ({ workspaceId, batchId, homeEnrollmentId } = await seedWorkspace([
      { daysOfWeek: EVERY_DAY, startTime: "09:00", endTime: "11:00" },
    ]));
    session("user_owner", workspaceId);
  });

  it("cancels a Class for everyone and restores it before it happens", async () => {
    const cancelled = await cancel(batchId, day(7), "09:00", "  Pongal ");
    expect(cancelled).toMatchObject({
      status: 200,
      body: { batchId, date: day(7), kind: "cancelled", reason: "Pongal" },
    });

    expect((await calendar()).classChanges).toMatchObject([
      { date: day(7), startTime: "09:00", kind: "cancelled", reason: "Pongal" },
    ]);
    session("user_student", workspaceId, "org:student");
    verifiedEmail("asha@example.com");
    expect((await calendar()).classChanges).toMatchObject([
      { date: day(7), kind: "cancelled" },
    ]);
    const detail = await json(
      await getClass(post(), classContext(batchId, day(7), "09:00")),
    );
    expect(detail.body).toMatchObject({
      status: "cancelled",
      classChange: { status: "cancelled", reason: "Pongal" },
    });

    session("user_owner", workspaceId);
    expect((await cancel(batchId, day(7), "09:00")).body.code).toBe(
      "CLASS_ALREADY_CANCELLED",
    );
    expect((await restore(batchId, day(7), "09:00")).status).toBe(204);
    expect((await calendar()).classChanges).toEqual([]);
    expect((await restore(batchId, day(7), "09:00")).body.code).toBe(
      "CLASS_NOT_CHANGED",
    );
  });

  it("moves a Class, then moves or cancels it from its new slot", async () => {
    const moved = await move(batchId, day(7), "09:00", {
      date: day(10),
      startTime: "16:00",
      endTime: "18:00",
    });
    expect(moved).toMatchObject({
      status: 200,
      body: {
        kind: "moved",
        movedTo: { date: day(10), startTime: "16:00", endTime: "18:00" },
      },
    });
    const rescheduled = await json(
      await getClass(post(), classContext(batchId, day(10), "16:00")),
    );
    expect(rescheduled.body).toMatchObject({
      status: "scheduled",
      endTime: "18:00",
      rescheduledFrom: { date: day(7), startTime: "09:00" },
    });

    expect(
      (
        await move(batchId, day(8), "09:00", {
          date: day(10),
          startTime: "16:00",
          endTime: "17:00",
        })
      ).body.code,
    ).toBe("CLASS_MOVE_TARGET_TAKEN");
    expect(
      (
        await move(batchId, day(8), "09:00", {
          date: day(9),
          startTime: "09:00",
          endTime: "10:00",
        })
      ).body.code,
    ).toBe("CLASS_MOVE_TARGET_TAKEN");
    expect((await cancel(batchId, day(7), "09:00")).body.code).toBe(
      "CLASS_ALREADY_MOVED",
    );

    expect(
      (
        await move(batchId, day(10), "16:00", {
          date: day(11),
          startTime: "15:00",
          endTime: "16:00",
        })
      ).body,
    ).toMatchObject({
      date: day(7),
      movedTo: { date: day(11), startTime: "15:00" },
    });
    expect(
      (await cancel(batchId, day(11), "15:00", "Exams")).body,
    ).toMatchObject({
      date: day(7),
      kind: "cancelled",
      reason: "Exams",
      movedTo: null,
    });
    expect((await calendar()).classChanges).toHaveLength(1);
  });

  it("refuses past, started, unknown, and invalid changes", async () => {
    expect((await cancel(batchId, day(-1), "09:00")).body.code).toBe(
      "CLASS_ALREADY_STARTED",
    );
    expect((await cancel(batchId, day(7), "10:00")).status).toBe(404);
    expect(
      (
        await move(batchId, day(7), "09:00", {
          date: day(-1),
          startTime: "16:00",
          endTime: "17:00",
        })
      ).body.code,
    ).toBe("CLASS_MOVE_IN_PAST");
    expect(
      (
        await move(batchId, day(7), "09:00", {
          date: day(8),
          startTime: "20:00",
          endTime: "19:00",
        })
      ).body.code,
    ).toBe("CLASS_TIME_INVALID");
    expect(
      (await cancel(batchId, day(7), "09:00", "x".repeat(201))).status,
    ).toBe(400);
    await prisma.classOccurrence.create({
      data: {
        id: randomUUID(),
        workspaceId,
        batchId,
        classDate: new Date(`${day(8)}T00:00:00.000Z`),
        startTime: "09:00",
        endTime: "11:00",
        startedByUserId: "user_owner",
      },
    });
    expect((await cancel(batchId, day(8), "09:00")).body.code).toBe(
      "CLASS_ALREADY_STARTED",
    );
  });

  it("refuses Timing edits that would drop an upcoming Moved Class", async () => {
    expect(
      (
        await move(batchId, day(7), "09:00", {
          date: day(10),
          startTime: "16:00",
          endTime: "18:00",
        })
      ).status,
    ).toBe(200);
    const schedule = async (startTime: string, endTime: string) =>
      json(
        await updateBatchSchedule(
          post({
            name: "DCA Weekday 9–11",
            classMode: "online",
            capacity: 20,
            meetingOption: "external",
            joinUrl: "https://meet.google.com/example",
            timings: [{ daysOfWeek: EVERY_DAY, startTime, endTime }],
          }),
          { params: Promise.resolve({ id: batchId }) },
        ),
      );
    expect(await schedule("10:00", "12:00")).toMatchObject({
      status: 409,
      body: { code: "BATCH_HAS_CLASS_CHANGES" },
    });
    // Same start time keeps the original slot, so the Moved Class survives.
    expect((await schedule("09:00", "10:30")).status).toBe(200);

    expect(
      (
        await move(batchId, day(8), "17:00", {
          date: day(11),
          startTime: "18:00",
          endTime: "19:00",
        })
      ).status,
    ).toBe(200);
    const inheritBatch = async () =>
      json(
        await setEnrollmentTimings(post({ timingSource: "batch" }), {
          params: Promise.resolve({ id: homeEnrollmentId }),
        }),
      );
    expect((await inheritBatch()).body.code).toBe("BATCH_HAS_CLASS_CHANGES");
    expect((await restore(batchId, day(8), "17:00")).status).toBe(204);
    expect((await inheritBatch()).status).toBe(200);
  });

  it("lets assigned Teachers change Classes and keeps everyone else out", async () => {
    session("user_teacher", workspaceId, "org:teacher");
    expect((await cancel(batchId, day(7), "09:00")).status).toBe(200);
    expect(
      (
        await json(
          await declareHoliday(post({ startDate: day(20), endDate: day(20) })),
        )
      ).status,
    ).toBe(403);

    session("user_other_teacher", workspaceId, "org:teacher");
    expect((await restore(batchId, day(7), "09:00")).status).toBe(404);
    session("user_student", workspaceId, "org:student");
    expect((await restore(batchId, day(7), "09:00")).status).toBe(403);
    session("user_parent", workspaceId, "org:parent");
    expect((await cancel(batchId, day(8), "09:00")).status).toBe(403);
    session(null, null);
    expect((await cancel(batchId, day(8), "09:00")).status).toBe(401);
    session("user_owner", `org_${randomUUID()}`);
    expect((await cancel(batchId, day(8), "09:00")).status).toBe(404);
  });

  it("changes a home-tuition Class without touching the Batch Class", async () => {
    expect((await cancel(batchId, day(7), "17:00", "Ravi unwell")).status).toBe(
      200,
    );
    session("user_student", workspaceId, "org:student");
    verifiedEmail("ravi@example.com");
    expect((await calendar()).classChanges).toMatchObject([
      { startTime: "17:00", reason: "Ravi unwell" },
    ]);
    verifiedEmail("asha@example.com");
    expect((await calendar()).classChanges).toEqual([]);
  });

  it("declares a Workspace Holiday that cancels every Class on its dates", async () => {
    const declared = await json(
      await declareHoliday(
        post({ startDate: day(14), endDate: day(16), reason: "Diwali" }),
      ),
    );
    expect(declared).toMatchObject({
      status: 201,
      body: { startDate: day(14), endDate: day(16), reason: "Diwali" },
    });
    session("user_student", workspaceId, "org:student");
    verifiedEmail("asha@example.com");
    expect((await calendar()).holidays).toMatchObject([
      { startDate: day(14), endDate: day(16) },
    ]);
    const detail = await json(
      await getClass(post(), classContext(batchId, day(15), "09:00")),
    );
    expect(detail.body).toMatchObject({
      status: "cancelled",
      classChange: { status: "holiday", reason: "Diwali" },
    });

    session("user_owner", workspaceId);
    expect(
      (
        await json(
          await declareHoliday(post({ startDate: day(16), endDate: day(18) })),
        )
      ).body.code,
    ).toBe("HOLIDAY_OVERLAPS");
    expect(
      (
        await json(
          await declareHoliday(post({ startDate: day(-1), endDate: day(1) })),
        )
      ).body.code,
    ).toBe("HOLIDAY_IN_PAST");
    expect((await cancel(batchId, day(15), "09:00")).body.code).toBe(
      "CLASS_ON_HOLIDAY",
    );
    expect(
      (
        await move(batchId, day(7), "09:00", {
          date: day(15),
          startTime: "16:00",
          endTime: "17:00",
        })
      ).body.code,
    ).toBe("CLASS_MOVE_TO_HOLIDAY");
    expect(
      (
        await move(batchId, day(15), "09:00", {
          date: day(20),
          startTime: "16:00",
          endTime: "18:00",
        })
      ).status,
    ).toBe(200);

    const id = String(declared.body["id"]);
    const removeContext = { params: Promise.resolve({ id }) };
    expect((await removeHoliday(post(), removeContext)).status).toBe(204);
    expect((await calendar()).holidays).toEqual([]);
    expect((await removeHoliday(post(), removeContext)).status).toBe(404);
  });
});

describe("Class changes today", () => {
  let workspaceId: string;
  let batchId: string;
  let batchEnrollmentId: string;

  beforeEach(async () => {
    getUser.mockReset();
    verifiedEmail("owner@example.com");
    mockedClerkClient.mockResolvedValue({ users: { getUser } } as never);
    ({ workspaceId, batchId, batchEnrollmentId } = await seedWorkspace([
      { daysOfWeek: EVERY_DAY, startTime: "15:00", endTime: "16:00" },
    ]));
    // The home-tuition Student isn't part of these checks.
    await prisma.enrollment.updateMany({
      where: { workspaceId, timingSource: "student" },
      data: { endedAt: new Date() },
    });
    session("user_owner", workspaceId);
  });

  async function open(): Promise<{ status: number; body: Json }> {
    return json(await openRegister(post({ batchId })));
  }

  async function todayBatches(): Promise<
    {
      id: string;
      todayClasses: { startTime: string; rescheduled: boolean }[];
    }[]
  > {
    const body = (await (await getDashboard()).json()) as {
      todayBatches: {
        id: string;
        todayClasses: { startTime: string; rescheduled: boolean }[];
      }[];
    };
    return body.todayBatches;
  }

  it("keeps cancelled Classes out of Attendance and the Owner Dashboard", async () => {
    expect(await todayBatches()).toMatchObject([
      {
        id: batchId,
        todayClasses: [{ startTime: "15:00", rescheduled: false }],
      },
    ]);
    const opened = await open();
    expect(opened.status).toBe(201);

    expect((await cancel(batchId, TODAY, "15:00")).status).toBe(200);
    expect(
      await prisma.attendanceRegister.count({
        where: { workspaceId, deletedAt: null },
      }),
    ).toBe(0);
    expect((await open()).body.code).toBe("ATTENDANCE_CLASS_CANCELLED");
    expect(await todayBatches()).toEqual([]);

    expect((await restore(batchId, TODAY, "15:00")).status).toBe(204);
    const reopened = await open();
    expect(reopened.status).toBe(201);
    await saveMarks(
      post({ marks: [{ enrollmentId: batchEnrollmentId, status: "present" }] }),
      { params: Promise.resolve({ id: String(reopened.body["id"]) }) },
    );
    expect((await cancel(batchId, TODAY, "15:00")).body.code).toBe(
      "CLASS_HAS_ATTENDANCE",
    );
    expect(
      (
        await json(
          await declareHoliday(post({ startDate: TODAY, endDate: TODAY })),
        )
      ).body.code,
    ).toBe("HOLIDAY_CONFLICTS_WITH_HELD_CLASS");
  });

  it("shows a Class moved to today on the Owner Dashboard and in Attendance", async () => {
    expect((await cancel(batchId, TODAY, "15:00")).status).toBe(200);
    expect(
      (
        await move(batchId, day(3), "15:00", {
          date: TODAY,
          startTime: "12:00",
          endTime: "13:00",
        })
      ).status,
    ).toBe(200);
    expect(await todayBatches()).toMatchObject([
      {
        id: batchId,
        todayClasses: [{ startTime: "12:00", rescheduled: true }],
      },
    ]);
    expect(await open()).toMatchObject({
      status: 201,
      body: { marks: [{ enrollmentId: batchEnrollmentId }] },
    });
  });
});
