import { randomUUID } from "node:crypto";

import { clearOutbox, emailsTo } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PreschoolActor } from "@/src/preschool/application/access";
import type {
  ChildDailyReportsView,
  ClassroomDailyReportsView,
  DailyReportView,
  PublishDailyReportsView,
} from "@/src/preschool/application/daily-report-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";
import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";
import type {
  PreschoolChildDailyReports,
  PreschoolClassroomDailyReports,
  PreschoolDailyReport,
  PreschoolPublishDailyReportsResult,
} from "@/src/queries/preschool/daily-reports";

import {
  addChild,
  addClassroom,
  addStaff,
  FIXTURE_NOW,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as applyToClassroom } from "./apply-to-classroom/route";
import { GET as childReports } from "./children/[childId]/route";
import {
  PreschoolChildDailyReportsModel,
  PreschoolClassroomDailyReportsModel,
  PreschoolDailyReportModel,
} from "./daily-report-models";
import { POST as publish } from "./publish/route";
import { GET as day } from "./route";
import { POST as save } from "./save/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<DailyReportView, PreschoolDailyReport>,
  Same<ClassroomDailyReportsView, PreschoolClassroomDailyReports>,
  Same<ChildDailyReportsView, PreschoolChildDailyReports>,
  Same<PublishDailyReportsView, PreschoolPublishDailyReportsResult>,
] = [true, true, true, true];

type Json = Record<string, unknown> & { code?: string };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ childId: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: {
    childId?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/daily-reports");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve({ childId: input.childId ?? "" }) },
  );
  return { status: response.status, body: (await response.json()) as T };
}

/** FIXTURE_NOW is 10:00 on 2026-11-25 in India. */
const TODAY = "2026-11-25";
const YESTERDAY = "2026-11-24";

describe("/api/preschool/daily-reports", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let roomA: string;
  let roomB: string;
  let otherRoom: string;
  let asha: string;
  let bala: string;
  let chitra: string;
  let otherChild: string;

  async function markAttendance(
    childId: string,
    classroomId: string,
    status: "present" | "absent",
  ) {
    await prisma.preschoolAttendance.create({
      data: {
        id: randomUUID(),
        workspaceId: preschool.workspaceId,
        centreId: preschool.centreId,
        classroomId,
        childId,
        date: fromIsoDate(TODAY),
        status,
        markedByUserId: "user_seed",
      },
    });
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Preschool" });
    roomA = await addClassroom(preschool, { name: "Nursery A" });
    roomB = await addClassroom(preschool, { name: "Nursery B" });
    otherRoom = await addClassroom(other);
    ({ childId: asha } = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Asha",
      motherEmail: "asha-mother@example.test",
      fatherEmail: "asha-father@example.test",
    }));
    ({ childId: bala } = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Bala",
      motherEmail: "bala-mother@example.test",
    }));
    ({ childId: chitra } = await addChild(preschool, {
      classroomId: roomB,
      firstName: "Chitra",
    }));
    ({ childId: otherChild } = await addChild(other, {
      classroomId: otherRoom,
    }));
    await markAttendance(asha, roomA, "present");
    await markAttendance(bala, roomA, "absent");
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-a@example.test",
      classroomIds: [roomA],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-b@example.test",
      classroomIds: [roomB],
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "branch-head@example.test",
      centreId: preschool.centreIds[1],
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await removePreschool(preschool);
    await removePreschool(other);
  });

  const teacherA = () => {
    signInWithEmail(preschool, "teacher", "teacher-a@example.test");
  };

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("lists the roster with attendance and no reports yet", async () => {
    teacherA();
    const result = await call<ClassroomDailyReportsView>(day, {
      query: { classroomId: roomA },
    });
    expect(PreschoolClassroomDailyReportsModel.parse(result.body)).toBeTruthy();
    expect(result.body).toMatchObject({
      date: TODAY,
      editable: true,
      counts: { drafts: 0, published: 0, none: 2 },
    });
    expect(
      result.body.children.map((child) => [child.name, child.attendance]),
    ).toEqual([
      ["Asha", "present"],
      ["Bala", "absent"],
    ]);
  });

  it("saves a Child's report as a draft, checking its shape", async () => {
    teacherA();
    const saved = await call<DailyReportView>(save, {
      body: {
        childId: asha,
        meals: [{ meal: "lunch", menu: "Curd rice", ate: "some" }],
        napFrom: "13:00",
        napTo: "14:00",
        toilet: [{ time: "11:30", kind: "potty" }],
        mood: "happy",
        activities: ["Clay"],
        note: "A good day",
        photos: ["https://cdn.example.test/asha.jpg"],
      },
    });
    expect(saved.status).toBe(StatusCodes.OK);
    expect(PreschoolDailyReportModel.parse(saved.body)).toBeTruthy();
    expect(saved.body).toMatchObject({
      status: "draft",
      date: TODAY,
      classroomId: roomA,
      napFrom: "13:00",
      mood: "happy",
    });

    const nap = await call(save, {
      body: { childId: asha, napFrom: "14:00", napTo: "13:00" },
    });
    expect(nap.status).toBe(StatusCodes.BAD_REQUEST);
    expect(nap.body.code).toBe("NAP_ORDER");
    const meals = await call(save, {
      body: {
        childId: asha,
        meals: [
          { meal: "snack", ate: "all" },
          { meal: "snack", ate: "none" },
        ],
      },
    });
    expect(meals.body.code).toBe("MEAL_REPEATED");
    const http = await call(save, {
      body: { childId: asha, photos: ["http://cdn.example.test/a.jpg"] },
    });
    expect(http.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("keeps future days closed and older days to managers", async () => {
    teacherA();
    const ahead = await call(save, {
      body: { childId: asha, date: "2026-11-26" },
    });
    expect(ahead.body.code).toBe("DATE_IN_FUTURE");
    const old = await call(save, {
      body: { childId: asha, date: "2026-11-20" },
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(old.body.code).toBe("DATE_LOCKED");
    const oldPublish = await call(publish, {
      body: { classroomId: roomA, date: "2026-11-20" },
    });
    expect(oldPublish.body.code).toBe("DATE_LOCKED");

    signInAsOwner(preschool);
    const owner = await call<DailyReportView>(save, {
      body: { childId: asha, date: "2026-11-20", note: "Back-filled" },
    });
    expect(owner.status).toBe(StatusCodes.OK);
  });

  it("refuses another Teacher's Classroom, another Centre, another Workspace and Parents", async () => {
    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    const notOwn = await call(day, { query: { classroomId: roomA } });
    expect(notOwn.body.code).toBe("CLASSROOM_FORBIDDEN");
    const notOwnChild = await call(save, { body: { childId: asha } });
    expect(notOwnChild.status).toBe(StatusCodes.FORBIDDEN);

    signInWithEmail(preschool, "teacher", "branch-head@example.test");
    expect(
      (await call(publish, { body: { classroomId: roomA } })).body.code,
    ).toBe("CENTRE_FORBIDDEN");

    signInAsOwner(preschool);
    expect(
      (await call(day, { query: { classroomId: otherRoom } })).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await call(save, { body: { childId: otherChild } })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await call(childReports, { childId: otherChild })).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    signInWithEmail(preschool, "parent", "asha-mother@example.test");
    expect((await call(save, { body: { childId: asha } })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("applies the Classroom's menu and activities to the Children present", async () => {
    teacherA();
    const applied = await call<ClassroomDailyReportsView>(applyToClassroom, {
      body: {
        classroomId: roomA,
        meals: [
          { meal: "lunch", menu: "Lemon rice" },
          { meal: "snack", menu: "Banana" },
        ],
        activities: ["clay", "Rhymes"],
      },
    });
    expect(applied.status).toBe(StatusCodes.OK);
    const [ashaRow, balaRow] = applied.body.children;
    expect(ashaRow?.report).toMatchObject({
      meals: [
        { meal: "snack", menu: "Banana", ate: "all" },
        { meal: "lunch", menu: "Lemon rice", ate: "some" },
      ],
      activities: ["Clay", "Rhymes"],
      napFrom: "13:00",
      mood: "happy",
      note: "A good day",
    });
    expect(balaRow?.report).toBeNull();

    const chosen = await call<ClassroomDailyReportsView>(applyToClassroom, {
      body: { classroomId: roomA, activities: ["Rhymes"], childIds: [bala] },
    });
    expect(chosen.body.children[1]?.report).toMatchObject({
      status: "draft",
      activities: ["Rhymes"],
      meals: [],
    });
    expect(chosen.body.counts).toEqual({ drafts: 2, published: 0, none: 0 });

    const stranger = await call(applyToClassroom, {
      body: { classroomId: roomA, childIds: [chitra] },
    });
    expect(stranger.body.code).toBe("CHILD_NOT_ON_ROSTER");

    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    const unmarked = await call<ClassroomDailyReportsView>(applyToClassroom, {
      body: { classroomId: roomB, activities: ["Sand play"] },
    });
    expect(unmarked.body.children[0]?.report?.activities).toEqual([
      "Sand play",
    ]);
  });

  it("publishes the day's drafts and emails each Parent", async () => {
    teacherA();
    clearOutbox();
    const result = await call<PublishDailyReportsView>(publish, {
      body: { classroomId: roomA },
    });
    expect(result.status).toBe(StatusCodes.OK);
    expect(result.body).toEqual({ published: 2 });
    for (const email of [
      "asha-mother@example.test",
      "asha-father@example.test",
    ]) {
      expect(emailsTo(email)).toHaveLength(1);
      expect(emailsTo(email)[0]?.subject).toBe(
        "Today's Daily Report for Asha is ready",
      );
      expect(emailsTo(email)[0]?.text).toContain("/preschool/family");
    }
    expect(emailsTo("bala-mother@example.test")).toHaveLength(1);

    expect(
      (
        await call<PublishDailyReportsView>(publish, {
          body: { classroomId: roomA },
        })
      ).body,
    ).toEqual({ published: 0 });

    const edited = await call<DailyReportView>(save, {
      body: { childId: asha, note: "Edited after publishing" },
    });
    expect(edited.body).toMatchObject({
      status: "published",
      note: "Edited after publishing",
    });
    expect(edited.body.publishedAt).not.toBeNull();
  });

  it("publishes even when the email fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handlers = createDailyReportHandlers({
      notifier: { published: () => Promise.reject(new Error("mail is down")) },
      now: () => FIXTURE_NOW,
    });
    const owner: PreschoolActor = {
      workspaceId: preschool.workspaceId,
      userId: preschool.ownerUserId,
      userName: "Owner",
      role: "owner",
      centreIds: preschool.centreIds,
      classroomIds: [],
      childIds: [],
    };
    const result = await handlers.publish(owner, { classroomId: roomB });
    expect(result).toEqual({ published: 1 });
    expect(consoleError).toHaveBeenCalledWith(
      "Daily Report email failed",
      { childId: chitra, date: TODAY },
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("shows a Parent only their own Child's published reports", async () => {
    teacherA();
    await call(save, {
      body: { childId: asha, date: YESTERDAY, note: "Draft" },
    });

    const staff = await call<ChildDailyReportsView>(childReports, {
      childId: asha,
    });
    expect(PreschoolChildDailyReportsModel.parse(staff.body)).toBeTruthy();
    expect(staff.body.items.map((item) => [item.date, item.status])).toEqual([
      [TODAY, "published"],
      [YESTERDAY, "draft"],
      ["2026-11-20", "draft"],
    ]);
    const page = await call<ChildDailyReportsView>(childReports, {
      childId: asha,
      query: { limit: "1" },
    });
    expect(page.body.nextBefore).toBe(TODAY);
    const older = await call<ChildDailyReportsView>(childReports, {
      childId: asha,
      query: { limit: "1", before: page.body.nextBefore ?? "" },
    });
    expect(older.body.items.map((item) => item.date)).toEqual([YESTERDAY]);

    signInWithEmail(preschool, "parent", "asha-mother@example.test");
    const parent = await call<ChildDailyReportsView>(childReports, {
      childId: asha,
    });
    expect(parent.status).toBe(StatusCodes.OK);
    expect(parent.body.items.map((item) => item.date)).toEqual([TODAY]);
    expect(parent.body.nextBefore).toBeNull();

    signInWithEmail(preschool, "parent", "bala-mother@example.test");
    expect((await call(childReports, { childId: asha })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    expect((await call(childReports, { childId: asha })).body.code).toBe(
      "CHILD_FORBIDDEN",
    );
  });
});
