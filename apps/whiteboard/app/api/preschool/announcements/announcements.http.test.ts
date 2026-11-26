import { getAuth } from "@repo/auth/server";
import {
  authStateFor,
  clearOutbox,
  emailsTo,
  outbox,
} from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AnnouncementPageView,
  AnnouncementView,
  FamilyAnnouncementsView,
} from "@/src/preschool/application/announcement-views";
import { addDays, todayInIndia } from "@/src/preschool/domain/dates";
import type {
  PreschoolAnnouncement,
  PreschoolAnnouncementPage,
  PreschoolFamilyAnnouncements,
} from "@/src/queries/preschool/announcements";

import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as updateDetails } from "./[id]/details/route";
import { POST as remove } from "./[id]/remove/route";
import {
  ListPreschoolAnnouncementsResponseModel,
  PreschoolFamilyAnnouncementsResponseModel,
} from "./announcement-models";
import { GET as family } from "./family/route";
import { GET as list, POST as create } from "./route";
import { GET as upcoming } from "./upcoming/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<AnnouncementView, PreschoolAnnouncement>,
  Same<AnnouncementPageView, PreschoolAnnouncementPage>,
  Same<FamilyAnnouncementsView, PreschoolFamilyAnnouncements>,
] = [true, true, true];

type Json = Record<string, unknown> & { code?: string };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/announcements");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve({ id: input.id ?? "" }) },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text === "" ? {} : JSON.parse(text)) as T,
  };
}

const TODAY = todayInIndia(new Date());

describe("/api/preschool/announcements", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let roomA: string;
  let roomB: string;
  let branchRoom: string;
  let otherRoom: string;
  let main: string;
  let branch: string;
  const ids: Record<string, string> = {};

  const owner = () => {
    signInAsOwner(preschool);
  };
  /** The same User each time for an email, so authorship holds across sign-ins. */
  const userIds = new Map<string, string>();
  const as = (email: string, role: "teacher" | "parent" = "teacher") => {
    const known = userIds.get(email);
    if (known == null) {
      userIds.set(email, signInWithEmail(preschool, role, email));
      return;
    }
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({
        userId: known,
        workspaceId: preschool.workspaceId,
        role,
        email,
        emailVerified: true,
        name: email.split("@")[0] ?? email,
      }),
    );
  };

  async function post(body: Record<string, unknown>) {
    return call<AnnouncementView & Json>(create, {
      body: { kind: "notice", title: "Title", body: "Body", ...body },
    });
  }

  beforeAll(async () => {
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Preschool" });
    main = preschool.centreId;
    branch = preschool.centreIds[1] ?? "";
    roomA = await addClassroom(preschool, { name: "Nursery A" });
    roomB = await addClassroom(preschool, { name: "Nursery B" });
    branchRoom = await addClassroom(preschool, {
      centreId: branch,
      name: "Branch Nursery",
    });
    otherRoom = await addClassroom(other);
    await addChild(preschool, {
      classroomId: roomA,
      motherEmail: "asha-mother@example.test",
    });
    await addChild(preschool, {
      classroomId: roomB,
      motherEmail: "bala-mother@example.test",
    });
    await addChild(preschool, {
      classroomId: branchRoom,
      motherEmail: "chitra-mother@example.test",
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
      email: "head@example.test",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "branch-head@example.test",
      centreId: branch,
    });
  });

  beforeEach(() => {
    clearOutbox();
  });

  afterAll(async () => {
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("lets the Owner announce to every Centre and emails every Parent", async () => {
    owner();
    const result = await post({
      centreId: null,
      title: "Diwali break",
      kind: "holiday",
      body: "The preschool is closed.\nSee you after the break.",
      startsOn: addDays(TODAY, 3),
      endsOn: addDays(TODAY, 5),
    });
    expect(result.status).toBe(StatusCodes.CREATED);
    expect(result.body).toMatchObject({
      audience: "All Centres",
      centreId: null,
      canEdit: true,
      createdByName: "Owner",
      body: "The preschool is closed.\nSee you after the break.",
    });
    ids["all"] = result.body.id;
    expect(outbox.map((email) => email.to).sort()).toEqual([
      "asha-mother@example.test",
      "bala-mother@example.test",
      "chitra-mother@example.test",
    ]);
    expect(emailsTo("asha-mother@example.test")[0]?.subject).toBe(
      "Holiday: Diwali break",
    );
  });

  it("keeps a Centre Head to their own Centre", async () => {
    as("branch-head@example.test");
    expect((await post({ centreId: null })).status).toBe(StatusCodes.FORBIDDEN);
    const otherCentre = await post({ centreId: main });
    expect(otherCentre.body.code).toBe("CENTRE_FORBIDDEN");
    const own = await post({ centreId: branch, title: "Branch notice" });
    expect(own.status).toBe(StatusCodes.CREATED);
    expect(own.body.audience).toBe(`Little Steps Branch 2`);
    ids["branch"] = own.body.id;
    expect(outbox.map((email) => email.to)).toEqual([
      "chitra-mother@example.test",
    ]);

    as("head@example.test");
    const whole = await post({ centreId: main, title: "Main notice" });
    expect(whole.status).toBe(StatusCodes.CREATED);
    ids["main"] = whole.body.id;
  });

  it("lets a Teacher post a notice or event to their own Classroom only", async () => {
    as("teacher-a@example.test");
    const event = await post({
      centreId: main,
      classroomId: roomA,
      kind: "event",
      title: "Sports Day",
      startsOn: addDays(TODAY, 7),
    });
    expect(event.status).toBe(StatusCodes.CREATED);
    expect(event.body).toMatchObject({
      audience: "Nursery A",
      endsOn: addDays(TODAY, 7),
    });
    ids["roomA"] = event.body.id;
    expect(outbox.map((email) => email.to)).toEqual([
      "asha-mother@example.test",
    ]);

    expect((await post({ centreId: main, classroomId: roomB })).body.code).toBe(
      "CLASSROOM_FORBIDDEN",
    );
    expect(
      (
        await post({
          centreId: main,
          classroomId: roomA,
          kind: "holiday",
          startsOn: TODAY,
        })
      ).body.code,
    ).toBe("ANNOUNCEMENT_KIND_FORBIDDEN");
    expect((await post({ centreId: main })).status).toBe(StatusCodes.FORBIDDEN);

    as("teacher-b@example.test");
    const roomBNotice = await post({
      centreId: main,
      classroomId: roomB,
      title: "Nursery B notice",
    });
    ids["roomB"] = roomBNotice.body.id;
  });

  it("checks dates and the Classroom", async () => {
    owner();
    expect((await post({ centreId: main, startsOn: TODAY })).body.code).toBe(
      "NOTICE_HAS_NO_DATES",
    );
    expect((await post({ centreId: main, kind: "event" })).body.code).toBe(
      "ANNOUNCEMENT_DATE_REQUIRED",
    );
    expect(
      (
        await post({
          centreId: main,
          kind: "event",
          startsOn: TODAY,
          endsOn: addDays(TODAY, -1),
        })
      ).body.code,
    ).toBe("ANNOUNCEMENT_DATES_ORDER");
    expect(
      (await post({ centreId: main, classroomId: branchRoom })).body.code,
    ).toBe("CLASSROOM_OTHER_CENTRE");
    expect(
      (await post({ centreId: main, classroomId: otherRoom })).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await post({ centreId: null, classroomId: roomA })).body.code).toBe(
      "CLASSROOM_NEEDS_CENTRE",
    );
  });

  it("shows each role what reaches them", async () => {
    owner();
    const ownerList = await call<AnnouncementPageView>(list, {
      query: { centreId: main },
    });
    expect(
      ListPreschoolAnnouncementsResponseModel.parse(ownerList.body),
    ).toBeTruthy();
    const seen = (page: AnnouncementPageView) =>
      page.items.map((item) => item.id).sort();
    expect(seen(ownerList.body)).toEqual(
      [ids["all"], ids["main"], ids["roomA"], ids["roomB"]].sort(),
    );
    expect(ownerList.body.total).toBe(4);

    as("teacher-a@example.test");
    const teacherList = await call<AnnouncementPageView>(list, {
      query: { centreId: main },
    });
    expect(seen(teacherList.body)).toEqual(
      [ids["all"], ids["main"], ids["roomA"]].sort(),
    );
    const own = teacherList.body.items.find((item) => item.id === ids["roomA"]);
    const head = teacherList.body.items.find((item) => item.id === ids["main"]);
    expect(own?.canEdit).toBe(true);
    expect(head?.canEdit).toBe(false);

    as("branch-head@example.test");
    const branchList = await call<AnnouncementPageView>(list, {
      query: { centreId: branch },
    });
    expect(seen(branchList.body)).toEqual([ids["all"], ids["branch"]].sort());

    const paged = await call<AnnouncementPageView>(list, {
      query: { centreId: branch, limit: "1" },
    });
    expect(paged.body.items).toHaveLength(1);
    const next = await call<AnnouncementPageView>(list, {
      query: {
        centreId: branch,
        limit: "1",
        cursor: paged.body.nextCursor ?? "",
      },
    });
    expect(next.body.items).toHaveLength(1);
    expect(next.body.nextCursor).toBeNull();
  });

  it("lists events and holidays coming up", async () => {
    owner();
    const far = await post({
      centreId: main,
      kind: "event",
      title: "Far away",
      startsOn: addDays(TODAY, 90),
    });
    ids["far"] = far.body.id;
    const result = await call<{ items: AnnouncementView[] }>(upcoming, {
      query: { centreId: main },
    });
    expect(result.body.items.map((item) => item.title)).toEqual([
      "Diwali break",
      "Sports Day",
    ]);
  });

  it("gives a Parent only what reaches their Child", async () => {
    as("asha-mother@example.test", "parent");
    const result = await call<FamilyAnnouncementsView>(family);
    expect(result.status).toBe(StatusCodes.OK);
    expect(
      PreschoolFamilyAnnouncementsResponseModel.parse(result.body),
    ).toBeTruthy();
    expect(result.body.items.map((item) => item.id).sort()).toEqual(
      [ids["all"], ids["main"], ids["roomA"], ids["far"]].sort(),
    );
    expect(result.body.items.every((item) => !item.canEdit)).toBe(true);
    expect(result.body.upcoming.map((item) => item.title)).toEqual([
      "Diwali break",
      "Sports Day",
    ]);
    expect((await call(list, { query: { centreId: main } })).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    owner();
    expect((await call(family)).status).toBe(StatusCodes.FORBIDDEN);
  });

  it("gives a family whose Children have left nothing", async () => {
    const left = await addChild(preschool, {
      classroomId: roomA,
      motherEmail: "gone-mother@example.test",
    });
    await prisma.preschoolChild.update({
      where: { id: left.childId },
      data: { status: "withdrawn" },
    });
    await prisma.preschoolAdmission.update({
      where: { id: left.admissionId },
      data: { status: "ended", endReason: "withdrawn" },
    });
    as("gone-mother@example.test", "parent");
    const result = await call<FamilyAnnouncementsView>(family);
    expect(result.status).toBe(StatusCodes.OK);
    expect(result.body).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      upcoming: [],
    });
  });

  it("lets only the author or a manager change or remove it", async () => {
    as("teacher-b@example.test");
    const notTheirs = await call(updateDetails, {
      id: ids["roomA"],
      body: { kind: "notice", title: "x", body: "y" },
    });
    expect(notTheirs.status).toBe(StatusCodes.FORBIDDEN);

    as("teacher-a@example.test");
    const edited = await call<AnnouncementView>(updateDetails, {
      id: ids["roomA"],
      body: {
        kind: "event",
        title: "Sports Day (moved)",
        body: "Now on the next day.",
        startsOn: addDays(TODAY, 8),
      },
    });
    expect(edited.body).toMatchObject({
      title: "Sports Day (moved)",
      startsOn: addDays(TODAY, 8),
      audience: "Nursery A",
    });
    expect((await call(remove, { id: ids["all"] })).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    as("head@example.test");
    expect((await call(remove, { id: ids["roomB"] })).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const after = await call<AnnouncementPageView>(list, {
      query: { centreId: main },
    });
    expect(after.body.items.map((item) => item.id)).not.toContain(ids["roomB"]);

    signInAsOwner(other);
    expect((await call(remove, { id: ids["main"] })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });
});
