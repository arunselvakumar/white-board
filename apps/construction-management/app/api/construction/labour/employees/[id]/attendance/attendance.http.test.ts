import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as markDays } from "@/app/api/construction/labour/attendance/labour/mark/route";
import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import type { ConstructionPersonAttendanceResponseModel } from "@/app/api/_lib/person-attendance-models";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getAttendance } from "./route";

const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;
const MARK = `${TEST_ORIGIN}/api/construction/labour/attendance/labour/mark`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Page = ConstructionPersonAttendanceResponseModel;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function read(cookie: string, labourId: string, query = "") {
  return getAttendance(
    jsonRequest(`${LABOURS}/${labourId}/attendance${query}`, cookie),
    params(labourId),
  );
}

async function page(cookie: string, labourId: string, query = "") {
  const response = await read(cookie, labourId, query);
  if (response.status !== 200)
    throw new Error(`attendance: ${await response.text()}`);
  return (await response.json()) as Page;
}

function days(result: Page) {
  return result.months.flatMap((month) => month.days);
}

async function mark(
  company: Company,
  projectId: string,
  date: string,
  marks: Record<string, unknown>[],
) {
  const response = await markDays(
    jsonRequest(MARK, company.cookie, { projectId, date, marks }),
  );
  if (response.status !== 200)
    throw new Error(`mark: ${await response.text()}`);
}

/**
 * Sky Towers and Green Park, and Dhuresh on both, joined 40 days ago:
 * three days ago Present at Sky (In 9 to Out 6, an hour's break, 1.5 h
 * overtime) and Half Day at Green Park with no times; two days ago Absent
 * at Sky; yesterday Present at Sky with no times.
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  const response = await createLabour(
    jsonRequest(LABOURS, company.cookie, {
      name: "Dhuresh Nawin",
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [],
      joiningDate: day(-40),
      projectIds: [sky, green],
    }),
  );
  if (response.status !== 201)
    throw new Error(`labour: ${await response.text()}`);
  const { id: labourId } = (await response.json()) as { id: string };

  await mark(company, sky, day(-3), [
    {
      labourId,
      status: "present",
      checkIn: "09:00",
      checkOut: "18:00",
      breakMinutes: 60,
      overtime: [{ labourCategoryId: null, hours: "1.5" }],
    },
  ]);
  await mark(company, green, day(-3), [{ labourId, status: "half_day" }]);
  await mark(company, sky, day(-2), [{ labourId, status: "absent" }]);
  await mark(company, sky, day(-1), [{ labourId, status: "present" }]);
  return { sky, green, labourId };
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

describe("GET /api/construction/labour/labours/{id}/attendance (ADR CM-0051)", () => {
  it("gives each day its Projects and hours, and the all-time figures", async () => {
    const company = await ownerWithCompany();
    const { sky, green, labourId } = await history(company);

    const result = await page(company.cookie, labourId);
    expect(result).toMatchObject({
      measure: "hours",
      recordsAbsence: true,
      timeZone: "Asia/Kolkata",
      today: TODAY,
      firstMonth: day(-40).slice(0, 7),
      earlierTo: null,
    });
    expect(result.months.at(-1)?.month).toBe(TODAY.slice(0, 7));

    const [threeAgo, twoAgo, yesterday] = days(result);
    expect(threeAgo).toMatchObject({
      date: day(-3),
      status: "present",
      workedMinutes: 480 + 240,
      overtimeMinutes: 90,
      headDays: null,
    });
    expect(threeAgo?.places).toEqual([
      expect.objectContaining({
        place: { kind: "project", id: sky, name: "Sky Towers", canOpen: true },
        status: "present",
        checkIn: "09:00",
        checkOut: "18:00",
        workedMinutes: 480,
        overtimeMinutes: 90,
        hoursFrom: "times",
      }),
      expect.objectContaining({
        place: {
          kind: "project",
          id: green,
          name: "Green Park",
          canOpen: true,
        },
        status: "half_day",
        workedMinutes: 240,
        hoursFrom: "working_hours",
      }),
    ]);
    expect(twoAgo).toMatchObject({
      date: day(-2),
      status: "absent",
      workedMinutes: 0,
    });
    expect(yesterday).toMatchObject({
      date: day(-1),
      status: "present",
      workedMinutes: 480,
    });
    expect(yesterday?.places[0]?.hoursFrom).toBe("working_hours");

    expect(result.allTime).toEqual({
      firstDay: day(-3),
      lastDay: day(-1),
      daysWorked: 2,
      workedMinutes: 1200,
      overtimeMinutes: 90,
      headDays: 0,
      places: 2,
    });
  });

  it("pages back a month at a time to the first month, all-time only on the first page", async () => {
    const company = await ownerWithCompany();
    const { labourId } = await history(company);
    const thisMonth = TODAY.slice(0, 7);
    const firstMonth = day(-40).slice(0, 7);

    const latest = await page(company.cookie, labourId, "?months=1");
    expect(latest.months.map((m) => m.month)).toEqual([thisMonth]);
    expect(latest.earlierTo).not.toBeNull();
    expect(latest.allTime).not.toBeNull();

    const earliest = await page(
      company.cookie,
      labourId,
      `?to=${firstMonth}&months=1`,
    );
    expect(earliest.months.map((m) => m.month)).toEqual([firstMonth]);
    expect(earliest.earlierTo).toBeNull();
    expect(earliest.allTime).toBeNull();

    const before = await page(company.cookie, labourId, "?to=2001-01");
    expect(before.months).toEqual([]);
    expect(before.earlierTo).toBeNull();
  });

  it("leaves out the Projects the viewer may not open", async () => {
    const company = await ownerWithCompany();
    const { sky, labourId } = await history(company);
    const member = await memberOn(company, { "masters.labours": ["read"] }, [
      sky,
    ]);

    const result = await page(member.cookie, labourId);
    const threeAgo = days(result).find((d) => d.date === day(-3));
    expect(threeAgo?.places.map((p) => p.place.name)).toEqual(["Sky Towers"]);
    expect(threeAgo?.workedMinutes).toBe(480);
    expect(result.allTime).toMatchObject({ places: 1, workedMinutes: 960 });

    const nowhere = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [],
    );
    expect(days(await page(nowhere.cookie, labourId))).toEqual([]);
  });

  it("needs Labours Read, a real Labour and a real month", async () => {
    const company = await ownerWithCompany();
    const { labourId } = await history(company);
    const outsider = await memberWith(company, {
      "masters.vendors": ["read"],
    });
    expect((await read(outsider.cookie, labourId)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const missing = "0195f0a0-0000-7000-8000-000000000999";
    expect((await read(company.cookie, missing)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await read(company.cookie, labourId, "?to=2026-13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect((await read(company.cookie, labourId, "?months=13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });

  it("is in the OpenAPI document, all four routes on one model", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    for (const path of [
      "/api/construction/labour/labours/{id}/attendance",
      "/api/construction/masters/site-engineers/{id}/attendance",
      "/api/construction/labour/vendors/{id}/attendance",
      "/api/construction/organization/team-members/{id}/attendance",
    ])
      expect(document.paths[path]).toBeDefined();
    expect(
      document.components.schemas["ConstructionPersonAttendanceResponse"],
    ).toBeDefined();
  });
});
