import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as setPaidLeave } from "@/app/api/construction/labour/attendance/labour/[id]/paid-leave/route";
import { POST as clearDays } from "@/app/api/construction/labour/attendance/labour/clear/route";
import { POST as markDays } from "@/app/api/construction/labour/attendance/labour/mark/route";
import { POST as activateLabour } from "@/app/api/construction/labour/labours/[id]/activate/route";
import { POST as deactivateLabour } from "@/app/api/construction/labour/labours/[id]/deactivate/route";
import { POST as updateLabour } from "@/app/api/construction/labour/labours/[id]/update/route";
import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as transferLabours } from "@/app/api/construction/labour/labours/transfer/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getActivity } from "./route";

const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;
const ATTENDANCE = `${TEST_ORIGIN}/api/construction/labour/attendance/labour`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type ProjectRef = { id: string; name: string; canOpen: boolean };

type Entry = {
  id: string;
  kind: string;
  date: string;
  recordedAt: string;
  by: string | null;
  imported?: boolean;
  project?: ProjectRef;
  fromProject?: ProjectRef;
  toProject?: ProjectRef;
  remark?: string | null;
  status?: string;
  fromStatus?: string;
  toStatus?: string;
  shift?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  overtimeHours?: string | null;
};

type Page = { items: Entry[]; nextCursor: string | null; timeZone: string };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function read(cookie: string, labourId: string, query = "") {
  return getActivity(
    jsonRequest(`${LABOURS}/${labourId}/activity${query}`, cookie),
    params(labourId),
  );
}

async function page(cookie: string, labourId: string, query = "") {
  const response = await read(cookie, labourId, query);
  if (response.status !== 200)
    throw new Error(`activity: ${await response.text()}`);
  return json<Page>(response);
}

/** Every page, following the cursor. */
async function everything(
  cookie: string,
  labourId: string,
  query = "",
): Promise<Entry[]> {
  const entries: Entry[] = [];
  let cursor: string | null = null;
  do {
    const separator = query === "" ? "?" : "&";
    const next: Page = await page(
      cookie,
      labourId,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    entries.push(...next.items);
    cursor = next.nextCursor;
  } while (cursor != null);
  return entries;
}

function summary(entries: readonly Entry[]) {
  return entries.map((entry) => [entry.kind, entry.date]);
}

async function created(
  company: Company,
  body: Record<string, unknown>,
): Promise<{ id: string; updatedAt: string; name: string }> {
  const response = await createLabour(
    jsonRequest(LABOURS, company.cookie, {
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [],
      ...body,
    }),
  );
  if (response.status !== 201)
    throw new Error(`labour: ${await response.text()}`);
  return json(response);
}

type Day = { id: string; labourId: string; updatedAt: string };

async function mark(
  company: Company,
  projectId: string,
  date: string,
  marks: Record<string, unknown>[],
  expected?: Record<string, string>,
): Promise<Day[]> {
  const response = await markDays(
    jsonRequest(`${ATTENDANCE}/mark`, company.cookie, {
      projectId,
      date,
      marks,
      ...(expected == null ? {} : { expected }),
    }),
  );
  if (response.status !== 200)
    throw new Error(`mark: ${await response.text()}`);
  return (await json<{ items: Day[] }>(response)).items;
}

async function memberOn(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const member = await memberWith(company, permissions);
  if (projectIds.length > 0)
    await prisma.constructionOrganizationTeamMemberProject.createMany({
      data: projectIds.map((projectId) => ({
        memberId: member.memberId,
        projectId,
      })),
    });
  return member;
}

/**
 * Sky Towers and Green Park, and Dhuresh: joined on Sky Towers 40 days
 * ago, attendance there (one day re-marked twice, one made Paid Leave,
 * one cleared), marked inactive and active today, transferred to Green
 * Park back-dated to 20 days ago, a day at Green Park, then taken off
 * Green Park on Edit Labour today (last day yesterday).
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  const dhuresh = await created(company, {
    name: "Dhuresh Nawin",
    joiningDate: day(-40),
    projectIds: [sky],
  });
  const labourId = dhuresh.id;

  const [a] = await mark(company, sky, day(-30), [
    { labourId, status: "present" },
  ]);
  const [a2] = await mark(
    company,
    sky,
    day(-30),
    [{ labourId, status: "half_day" }],
    { [labourId]: a?.updatedAt ?? "" },
  );
  // A re-mark that keeps the status (a new shift) is not a change.
  const [a3] = await mark(
    company,
    sky,
    day(-30),
    [{ labourId, status: "half_day", shift: "Shift 2" }],
    { [labourId]: a2?.updatedAt ?? "" },
  );
  await mark(company, sky, day(-30), [{ labourId, status: "absent" }], {
    [labourId]: a3?.updatedAt ?? "",
  });
  await mark(company, sky, day(-29), [
    {
      labourId,
      status: "present",
      shift: "Shift 1",
      checkIn: "09:00",
      checkOut: "18:00",
      overtime: [{ labourCategoryId: null, hours: "1.5" }],
    },
  ]);
  const [leave] = await mark(company, sky, day(-28), [
    { labourId, status: "on_leave" },
  ]);
  const paid = await setPaidLeave(
    jsonRequest(`${ATTENDANCE}/${leave?.id ?? ""}/paid-leave`, company.cookie, {
      isPaidLeave: true,
      expectedUpdatedAt: leave?.updatedAt,
    }),
    params(leave?.id ?? ""),
  );
  expect(paid.status).toBe(StatusCodes.OK);
  const [cleared] = await mark(company, sky, day(-27), [
    { labourId, status: "present" },
  ]);
  const clear = await clearDays(
    jsonRequest(`${ATTENDANCE}/clear`, company.cookie, {
      projectId: sky,
      date: day(-27),
      labourIds: [labourId],
      expected: { [labourId]: cleared?.updatedAt },
    }),
  );
  expect(clear.status).toBe(StatusCodes.NO_CONTENT);

  for (const route of [deactivateLabour, activateLabour]) {
    const response = await route(
      jsonRequest(`${LABOURS}/${labourId}/x`, company.cookie, {}),
      params(labourId),
    );
    expect(response.status).toBe(StatusCodes.OK);
  }
  // Recorded after the status changes, dated 20 days ago.
  const transferred = await transferLabours(
    jsonRequest(`${LABOURS}/transfer`, company.cookie, {
      labourIds: [labourId],
      fromProjectId: sky,
      toProjectId: green,
      transferDate: day(-20),
      remark: "Slab work",
    }),
  );
  expect(transferred.status).toBe(StatusCodes.OK);
  await mark(company, green, day(-10), [{ labourId, status: "present" }]);

  const current = await prisma.constructionLabourLabour.findUniqueOrThrow({
    where: { id: labourId },
  });
  const untick = await updateLabour(
    jsonRequest(`${LABOURS}/${labourId}/update`, company.cookie, {
      name: "Dhuresh Nawin",
      joiningDate: day(-40),
      wageType: "daily",
      projectIds: [],
      expectedUpdatedAt: current.updatedAt.toISOString(),
    }),
    params(labourId),
  );
  expect(untick.status).toBe(StatusCodes.OK);
  return { sky, green, labourId };
}

const FULL = [
  ["activated", TODAY],
  ["deactivated", TODAY],
  ["project_removed", day(-1)],
  ["attendance", day(-10)],
  ["transferred", day(-20)],
  ["attendance_cleared", day(-27)],
  ["attendance_changed", day(-28)],
  ["attendance", day(-28)],
  ["attendance", day(-29)],
  ["attendance_changed", day(-30)],
  ["attendance_changed", day(-30)],
  ["attendance", day(-30)],
  ["project_added", day(-40)],
  ["added", day(-40)],
];

describe("Labour Activity (ADR CM-0038)", () => {
  it("shows every entry kind on its effective date, newest first, with no amounts", async () => {
    const company = await ownerWithCompany();
    const { sky, green, labourId } = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const first = await page(company.cookie, labourId);
    expect(first.timeZone).toBe("Asia/Kolkata");
    expect(first.nextCursor).toBeNull();
    const entries = first.items;
    expect(summary(entries)).toEqual(FULL);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(FULL.length);
    for (const entry of entries) expect(entry.by).toBe(owner?.name);

    const skyRef = { id: sky, name: "Sky Towers", canOpen: true };
    const greenRef = { id: green, name: "Green Park", canOpen: true };
    const [
      activated,
      ,
      removed,
      atGreen,
      transfer,
      clearedDay,
      paidChange,
      paidDay,
      timedDay,
      secondChange,
      firstChange,
      remarked,
      added,
      joined,
    ] = entries;
    expect(removed).toMatchObject({ project: greenRef, remark: null });
    expect(atGreen).toMatchObject({ project: greenRef, status: "present" });
    // Back-dated: recorded after the status changes, it sits on its own date.
    expect(transfer).toMatchObject({
      fromProject: skyRef,
      toProject: greenRef,
      remark: "Slab work",
    });
    expect(Date.parse(transfer?.recordedAt ?? "")).toBeGreaterThan(
      Date.parse(activated?.recordedAt ?? ""),
    );
    expect(clearedDay).toMatchObject({ project: skyRef, status: "present" });
    expect(paidChange).toMatchObject({
      fromStatus: "on_leave",
      toStatus: "paid_leave",
    });
    expect(paidDay).toMatchObject({ status: "paid_leave" });
    expect(timedDay).toEqual(
      expect.objectContaining({
        status: "present",
        shift: "Shift 1",
        checkIn: "09:00",
        checkOut: "18:00",
        overtimeHours: "1.5",
      }),
    );
    // Re-marked three times: the day as it stands and two changes.
    expect(secondChange).toMatchObject({
      fromStatus: "half_day",
      toStatus: "absent",
    });
    expect(firstChange).toMatchObject({
      fromStatus: "present",
      toStatus: "half_day",
    });
    expect(remarked).toMatchObject({ status: "absent", project: skyRef });
    expect(added).toMatchObject({ project: skyRef });
    expect(joined).toMatchObject({ imported: false });

    // No amounts anywhere.
    const text = JSON.stringify(first);
    for (const word of ["wage", "earned", "amount", "rate"])
      expect(text.toLowerCase()).not.toContain(word);
  });

  it("filters by type, Project and date range", async () => {
    const company = await ownerWithCompany();
    const { green, labourId } = await history(company);
    const kinds = async (query: string) =>
      summary(await everything(company.cookie, labourId, query));

    expect(await kinds("?type=projects")).toEqual(
      FULL.filter(([kind]) =>
        ["project_added", "project_removed", "transferred"].includes(
          kind ?? "",
        ),
      ),
    );
    expect(await kinds("?type=attendance")).toEqual(
      FULL.filter(([kind]) => kind?.startsWith("attendance")),
    );
    expect(await kinds("?type=profile")).toEqual([
      ["activated", TODAY],
      ["deactivated", TODAY],
      ["added", day(-40)],
    ]);
    expect(await kinds(`?projectId=${green}`)).toEqual([
      ["project_removed", day(-1)],
      ["attendance", day(-10)],
      ["transferred", day(-20)],
    ]);
    expect(await kinds(`?from=${day(-30)}&to=${day(-28)}`)).toEqual(
      FULL.slice(6, 12),
    );
    expect(
      await kinds(`?type=attendance&projectId=${green}&to=${day(-11)}`),
    ).toEqual([]);

    const backwards = await read(
      company.cookie,
      labourId,
      `?from=${day(-1)}&to=${day(-5)}`,
    );
    expect(backwards.status).toBe(StatusCodes.BAD_REQUEST);
    const badCursor = await read(company.cookie, labourId, "?cursor=nope");
    expect(badCursor.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<{ code: string }>(badCursor)).code).toBe(
      "INVALID_CURSOR",
    );
  });

  it("keeps a deleted Project's name without a link, and marks an imported Labour", async () => {
    const company = await ownerWithCompany();
    const { sky, labourId } = await history(company);
    await prisma.constructionProjectsProject.update({
      where: { id: sky },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    const entries = await everything(company.cookie, labourId);
    const skyEntries = entries.filter(
      (entry) => entry.project?.id === sky || entry.fromProject?.id === sky,
    );
    expect(skyEntries.length).toBeGreaterThan(0);
    for (const entry of skyEntries)
      expect(entry.project ?? entry.fromProject).toEqual({
        id: sky,
        name: "Sky Towers",
        canOpen: false,
      });

    await createLabourHandlers().importer.commit({
      workspaceId: company.workspaceId,
      by: company.userId,
      sheet: [
        {
          row: 2,
          cells: {
            name: "Ganesh",
            joiningDate: day(-5),
            wageType: "Daily",
            wagePerDay: 650,
            overtimeWagePerHour: 80,
          },
        },
      ],
    });
    const ganesh = await prisma.constructionLabourLabour.findFirstOrThrow({
      where: { workspaceId: company.workspaceId, name: "Ganesh" },
    });
    expect(summary(await everything(company.cookie, ganesh.id))).toEqual([
      ["added", day(-5)],
    ]);
    expect((await page(company.cookie, ganesh.id)).items[0]).toMatchObject({
      imported: true,
    });
  });

  it("leaves out Projects the viewer is not on; entries with no Project always show", async () => {
    const company = await ownerWithCompany();
    const { sky, green, labourId } = await history(company);

    const onSky = await memberOn(company, { "masters.labours": ["read"] }, [
      sky,
    ]);
    const seen = await everything(onSky.cookie, labourId);
    expect(summary(seen)).toEqual(
      FULL.filter(
        ([kind, date]) =>
          !(
            kind === "project_removed" ||
            (kind === "attendance" && date === day(-10))
          ),
      ),
    );
    // A transfer shows when either side is open to the viewer; the other
    // side is named without a link.
    expect(seen.find((entry) => entry.kind === "transferred")).toMatchObject({
      fromProject: { id: sky, canOpen: true },
      toProject: { id: green, name: "Green Park", canOpen: false },
    });
    // Filtering on a Project the viewer is not on leaves only the transfer.
    expect(
      summary(await everything(onSky.cookie, labourId, `?projectId=${green}`)),
    ).toEqual([["transferred", day(-20)]]);

    const onNeither = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [],
    );
    expect(summary(await everything(onNeither.cookie, labourId))).toEqual([
      ["activated", TODAY],
      ["deactivated", TODAY],
      ["added", day(-40)],
    ]);

    const noRead = await memberOn(company, { "projects.project": ["read"] }, [
      sky,
      green,
    ]);
    const refused = await read(noRead.cookie, labourId);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const other = await ownerWithCompany("Kaveri Builders");
    const hidden = await read(other.cookie, labourId);
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(hidden)).code).toBe(
      "LABOUR_NOT_FOUND",
    );
    expect((await read(company.cookie, newId())).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("pages 30 at a time without repeating or skipping when entries are added between reads", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(
      company.workspaceId,
      company.userId,
      "Sky Towers",
    );
    const { id: labourId } = await created(company, {
      name: "Murugan",
      joiningDate: day(-100),
      projectIds: [sky],
    });
    const seed = async (date: string) => {
      await prisma.constructionLabourAttendance.create({
        data: {
          id: newId(),
          workspaceId: company.workspaceId,
          projectId: sky,
          labourId,
          attendanceDate: calendarDateToDb(date),
          status: "present",
          wageType: "daily",
          wageRate: 70_000,
          earned: 70_000,
          createdBy: company.userId,
          updatedBy: company.userId,
        },
      });
    };
    for (let offset = -70; offset <= -1; offset++) await seed(day(offset));

    const before = await everything(company.cookie, labourId);
    expect(before).toHaveLength(72);
    const first = await page(company.cookie, labourId);
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).not.toBeNull();

    // One newer than the first page, one among the pages still to read.
    await seed(TODAY);
    await seed(day(-80));

    const rest: Entry[] = [];
    let cursor = first.nextCursor;
    while (cursor != null) {
      const next = await page(
        company.cookie,
        labourId,
        `?cursor=${encodeURIComponent(cursor)}`,
      );
      expect(next.items.length).toBeLessThanOrEqual(30);
      rest.push(...next.items);
      cursor = next.nextCursor;
    }
    const seen = [...first.items, ...rest];
    expect(new Set(seen.map((entry) => entry.id)).size).toBe(seen.length);
    const added = seen.filter(
      (entry) => !before.some((old) => old.id === entry.id),
    );
    expect(summary(added)).toEqual([["attendance", day(-80)]]);
    expect(seen.filter((entry) => !added.includes(entry))).toEqual(before);
  });

  it("is on /api/docs", async () => {
    const doc = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      doc.paths["/api/construction/labour/labours/{id}/activity"]?.["get"],
    ).toBeDefined();
    expect(
      doc.components.schemas["ListConstructionLabourLabourActivityResponse"],
    ).toBeDefined();
  });
});
