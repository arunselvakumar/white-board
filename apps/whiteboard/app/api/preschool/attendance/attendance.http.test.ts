import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CentreAttendanceSummaryView,
  ChildAttendanceDayView,
  ChildAttendanceMonthView,
  ClassroomAttendanceMonthView,
  ClassroomAttendanceView,
} from "@/src/preschool/application/attendance-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";
import type {
  PreschoolAttendanceDay,
  PreschoolAttendanceSummary,
  PreschoolChildAttendanceDay,
  PreschoolChildAttendanceMonth,
  PreschoolClassroomAttendanceMonth,
} from "@/src/queries/preschool/attendance";

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
import {
  PreschoolCentreAttendanceSummaryModel,
  PreschoolChildAttendanceMonthModel,
  PreschoolClassroomAttendanceModel,
  PreschoolClassroomAttendanceMonthModel,
} from "./attendance-models";
import { POST as checkIn } from "./check-in/route";
import { POST as checkOut } from "./check-out/route";
import { GET as childMonth } from "./children/[childId]/route";
import { POST as clear } from "./clear/route";
import { POST as mark } from "./mark/route";
import { GET as month } from "./month/route";
import { GET as day } from "./route";
import { GET as summary } from "./summary/route";
import { POST as undoCheckOut } from "./undo-check-out/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<ClassroomAttendanceView, PreschoolAttendanceDay>,
  Same<ChildAttendanceDayView, PreschoolChildAttendanceDay>,
  Same<ClassroomAttendanceMonthView, PreschoolClassroomAttendanceMonth>,
  Same<CentreAttendanceSummaryView, PreschoolAttendanceSummary>,
  Same<ChildAttendanceMonthView, PreschoolChildAttendanceMonth>,
] = [true, true, true, true, true];

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
  const url = new URL("http://localhost/api/preschool/attendance");
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

describe("/api/preschool/attendance", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let roomA: string;
  let roomB: string;
  let branchRoom: string;
  let otherRoom: string;
  let asha: string;
  let bala: string;
  let chitra: string;
  let newcomer: string;
  let otherChild: string;
  let pickupId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Preschool" });
    roomA = await addClassroom(preschool, { name: "Nursery A" });
    roomB = await addClassroom(preschool, { name: "Nursery B" });
    branchRoom = await addClassroom(preschool, {
      name: "Branch Nursery",
      centreId: preschool.centreIds[1],
    });
    otherRoom = await addClassroom(other);
    ({ childId: asha } = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Asha",
      motherEmail: "asha-mother@example.test",
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
    const added = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Newcomer",
    });
    newcomer = added.childId;
    await prisma.preschoolAdmission.update({
      where: { id: added.admissionId },
      data: { admittedOn: fromIsoDate(TODAY) },
    });
    ({ childId: otherChild } = await addChild(other, {
      classroomId: otherRoom,
    }));
    pickupId = randomUUID();
    await prisma.preschoolAuthorisedPickup.create({
      data: {
        id: pickupId,
        workspaceId: preschool.workspaceId,
        childId: asha,
        name: "Grandpa",
        relationship: "Grandfather",
        phone: "9000022222",
      },
    });
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

  it("shows a Teacher their Classroom's roster for today", async () => {
    teacherA();
    const result = await call<ClassroomAttendanceView>(day, {
      query: { classroomId: roomA },
    });
    expect(result.status).toBe(StatusCodes.OK);
    expect(PreschoolClassroomAttendanceModel.parse(result.body)).toBeTruthy();
    expect(result.body).toMatchObject({
      date: TODAY,
      editable: true,
      classroom: { name: "Nursery A", programmeName: "Nursery (Pre-KG)" },
      counts: { rosterSize: 3, notMarked: 3, present: 0 },
    });
    expect(result.body.children.map((child) => child.name)).toEqual([
      "Asha",
      "Bala",
      "Newcomer",
    ]);
    expect(result.body.children[0]).toMatchObject({
      father: { name: "Father", phone: "9876543210" },
      authorisedPickups: [{ id: pickupId, name: "Grandpa" }],
      hasAllergies: false,
      mark: null,
    });

    const yesterday = await call<ClassroomAttendanceView>(day, {
      query: { classroomId: roomA, date: "2026-11-20" },
    });
    expect(yesterday.body.editable).toBe(false);
    expect(yesterday.body.counts.rosterSize).toBe(2);
  });

  it("refuses another Teacher's Classroom, another Centre, and another Workspace", async () => {
    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    const notOwn = await call(day, { query: { classroomId: roomA } });
    expect(notOwn.status).toBe(StatusCodes.FORBIDDEN);
    expect(notOwn.body.code).toBe("CLASSROOM_FORBIDDEN");
    const notOwnChild = await call(checkIn, { body: { childId: asha } });
    expect(notOwnChild.body.code).toBe("CLASSROOM_FORBIDDEN");

    signInWithEmail(preschool, "teacher", "branch-head@example.test");
    const centre = await call(mark, {
      body: {
        classroomId: roomA,
        marks: [{ childId: asha, status: "present" }],
      },
    });
    expect(centre.body.code).toBe("CENTRE_FORBIDDEN");
    expect(
      (await call(summary, { query: { centreId: preschool.centreId } })).body
        .code,
    ).toBe("CENTRE_FORBIDDEN");
    expect(
      (await call(day, { query: { classroomId: branchRoom } })).status,
    ).toBe(StatusCodes.OK);

    signInAsOwner(preschool);
    expect(
      (await call(day, { query: { classroomId: otherRoom } })).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const foreignChild = await call(checkIn, { body: { childId: otherChild } });
    expect(foreignChild.status).toBe(StatusCodes.NOT_FOUND);

    signInWithEmail(preschool, "parent", "asha-mother@example.test");
    expect((await call(day, { query: { classroomId: roomA } })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("marks everyone present, checking them in now", async () => {
    teacherA();
    const result = await call<ClassroomAttendanceView>(mark, {
      body: {
        classroomId: roomA,
        marks: [
          { childId: asha, status: "present" },
          { childId: bala, status: "present" },
          { childId: newcomer, status: "leave" },
        ],
      },
    });
    expect(result.status).toBe(StatusCodes.OK);
    expect(result.body.counts).toMatchObject({
      present: 2,
      leave: 1,
      notMarked: 0,
    });
    expect(result.body.children[0]?.mark).toMatchObject({
      status: "present",
      checkInTime: "10:00",
    });

    const stranger = await call(mark, {
      body: {
        classroomId: roomA,
        marks: [{ childId: chitra, status: "present" }],
      },
    });
    expect(stranger.status).toBe(StatusCodes.CONFLICT);
    expect(stranger.body).toMatchObject({
      code: "CHILD_NOT_ON_ROSTER",
      details: { childIds: [chitra] },
    });
  });

  it("checks a Child out only with someone allowed to collect them", async () => {
    teacherA();
    const other = await call(checkOut, {
      body: {
        childId: asha,
        time: "09:55",
        collectedByKind: "other",
        collectedByName: "Neighbour",
      },
    });
    expect(other.status).toBe(StatusCodes.BAD_REQUEST);
    expect(other.body.code).toBe("COLLECTED_BY_NOTE_REQUIRED");

    const notTheirs = await call(checkOut, {
      body: {
        childId: bala,
        collectedByKind: "authorised_pickup",
        pickupId,
      },
    });
    expect(notTheirs.body.code).toBe("PICKUP_NOT_AUTHORISED");

    const early = await call(checkOut, {
      body: { childId: asha, time: "09:30", collectedByKind: "father" },
    });
    expect(early.body.code).toBe("CHECK_OUT_BEFORE_CHECK_IN");
    const ahead = await call(checkOut, {
      body: { childId: asha, time: "11:00", collectedByKind: "father" },
    });
    expect(ahead.body.code).toBe("TIME_IN_FUTURE");

    const onLeave = await call(checkOut, {
      body: { childId: newcomer, collectedByKind: "father" },
    });
    expect(onLeave.body.code).toBe("NOT_PRESENT");

    const done = await call<ChildAttendanceDayView>(checkOut, {
      body: { childId: asha, collectedByKind: "authorised_pickup", pickupId },
    });
    expect(done.status).toBe(StatusCodes.OK);
    expect(done.body.mark).toMatchObject({
      checkInTime: "10:00",
      checkOutTime: "10:00",
      collectedBy: { kind: "authorised_pickup", name: "Grandpa", pickupId },
    });

    const byNeighbour = await call<ChildAttendanceDayView>(checkOut, {
      body: {
        childId: bala,
        collectedByKind: "other",
        collectedByName: "Neighbour",
        note: "Mother phoned at 9:45",
      },
    });
    expect(byNeighbour.body.mark).toMatchObject({
      collectedBy: { kind: "other", name: "Neighbour", pickupId: null },
      note: "Mother phoned at 9:45",
    });

    const undone = await call<ChildAttendanceDayView>(undoCheckOut, {
      body: { childId: asha },
    });
    expect(undone.body.mark).toMatchObject({
      checkOutTime: null,
      collectedBy: null,
      checkInTime: "10:00",
    });
    const again = await call(undoCheckOut, { body: { childId: asha } });
    expect(again.body.code).toBe("NOT_CHECKED_OUT");
  });

  it("checks in, re-marks and clears a day", async () => {
    teacherA();
    const checkedIn = await call<ChildAttendanceDayView>(checkIn, {
      body: { childId: newcomer, time: "09:15", droppedBy: "Uncle" },
    });
    expect(checkedIn.body.mark).toMatchObject({
      status: "present",
      checkInTime: "09:15",
      droppedBy: "Uncle",
    });
    const absent = await call<ClassroomAttendanceView>(mark, {
      body: {
        classroomId: roomA,
        marks: [{ childId: newcomer, status: "absent" }],
      },
    });
    expect(
      absent.body.children.find((child) => child.childId === newcomer)?.mark,
    ).toMatchObject({ status: "absent", checkInTime: null, droppedBy: null });
    const cleared = await call<ChildAttendanceDayView>(clear, {
      body: { childId: newcomer },
    });
    expect(cleared.body.mark).toBeNull();
  });

  it("keeps future days closed, and older days to managers", async () => {
    teacherA();
    const ahead = await call(checkIn, {
      body: { childId: bala, date: "2026-11-26", time: "09:00" },
    });
    expect(ahead.status).toBe(StatusCodes.BAD_REQUEST);
    expect(ahead.body.code).toBe("DATE_IN_FUTURE");

    const yesterday = await call<ChildAttendanceDayView>(checkIn, {
      body: { childId: bala, date: YESTERDAY, time: "09:05" },
    });
    expect(yesterday.status).toBe(StatusCodes.OK);
    const noTime = await call(checkIn, {
      body: { childId: asha, date: YESTERDAY },
    });
    expect(noTime.body.code).toBe("TIME_REQUIRED");

    const old = await call(mark, {
      body: {
        classroomId: roomA,
        date: "2026-11-23",
        marks: [{ childId: asha, status: "absent" }],
      },
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(old.body.code).toBe("DATE_LOCKED");

    const beforeAdmission = await call(checkIn, {
      body: { childId: newcomer, date: YESTERDAY, time: "09:00" },
    });
    expect(beforeAdmission.body.code).toBe("CHILD_NOT_ON_ROSTER");

    signInAsOwner(preschool);
    const owner = await call<ClassroomAttendanceView>(mark, {
      body: {
        classroomId: roomA,
        date: "2026-11-02",
        marks: [
          { childId: asha, status: "absent" },
          { childId: bala, status: "present" },
        ],
      },
    });
    expect(owner.status).toBe(StatusCodes.OK);
    expect(owner.body.children[1]?.mark).toMatchObject({
      status: "present",
      checkInTime: null,
    });
  });

  it("builds the monthly register with working days and totals", async () => {
    teacherA();
    const result = await call<ClassroomAttendanceMonthView>(month, {
      query: { classroomId: roomA, month: "2026-11" },
    });
    expect(
      PreschoolClassroomAttendanceMonthModel.parse(result.body),
    ).toBeTruthy();
    expect(result.body.days).toHaveLength(30);
    expect(result.body.workingDays).toBe(3);
    const byName = new Map(result.body.children.map((row) => [row.name, row]));
    expect(byName.get("Bala")?.totals).toEqual({
      present: 3,
      absent: 0,
      leave: 0,
    });
    expect(byName.get("Asha")?.days[1]).toBe("absent");
    expect(byName.get("Asha")?.days[24]).toBe("present");
    expect(byName.get("Newcomer")?.totals).toEqual({
      present: 0,
      absent: 0,
      leave: 0,
    });
  });

  it("sums the Centre's day for managers only", async () => {
    signInAsOwner(preschool);
    const result = await call<CentreAttendanceSummaryView>(summary, {
      query: { centreId: preschool.centreId },
    });
    expect(
      PreschoolCentreAttendanceSummaryModel.parse(result.body),
    ).toBeTruthy();
    expect(result.body.classrooms.map((room) => room.name)).toEqual([
      "Nursery A",
      "Nursery B",
    ]);
    expect(result.body.totals).toEqual({
      rosterSize: 4,
      present: 2,
      absent: 0,
      leave: 0,
      notMarked: 2,
      checkedOut: 1,
    });
    teacherA();
    expect(
      (await call(summary, { query: { centreId: preschool.centreId } })).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("shows a Child's month to their Parent and Teacher only", async () => {
    signInWithEmail(preschool, "parent", "asha-mother@example.test");
    const own = await call<ChildAttendanceMonthView>(childMonth, {
      childId: asha,
      query: { month: "2026-11" },
    });
    expect(own.status).toBe(StatusCodes.OK);
    expect(PreschoolChildAttendanceMonthModel.parse(own.body)).toBeTruthy();
    expect(own.body.totals).toEqual({ present: 1, absent: 1, leave: 0 });
    expect(own.body.days[24]).toMatchObject({
      status: "present",
      checkInTime: "10:00",
      checkOutTime: null,
    });

    const notOwn = await call(childMonth, {
      childId: bala,
      query: { month: "2026-11" },
    });
    expect(notOwn.status).toBe(StatusCodes.FORBIDDEN);

    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    const otherTeacher = await call(childMonth, {
      childId: asha,
      query: { month: "2026-11" },
    });
    expect(otherTeacher.body.code).toBe("CHILD_FORBIDDEN");

    signInAsOwner(preschool);
    expect(
      (
        await call(childMonth, {
          childId: otherChild,
          query: { month: "2026-11" },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});
