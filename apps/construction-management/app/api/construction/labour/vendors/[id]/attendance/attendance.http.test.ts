import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as clearDay } from "@/app/api/construction/labour/attendance/vendors/[id]/clear/route";
import { POST as recordDay } from "@/app/api/construction/labour/attendance/vendors/record/route";
import type { ConstructionPersonAttendanceResponseModel } from "@/app/api/_lib/person-attendance-models";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as createVendor } from "../../route";
import { GET as getAttendance } from "./route";

const VENDORS = `${TEST_ORIGIN}/api/construction/labour/vendors`;
const RECORD = `${TEST_ORIGIN}/api/construction/labour/attendance/vendors`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Page = ConstructionPersonAttendanceResponseModel;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function read(cookie: string, vendorId: string, query = "") {
  return getAttendance(
    jsonRequest(`${VENDORS}/${vendorId}/attendance${query}`, cookie),
    params(vendorId),
  );
}

async function page(cookie: string, vendorId: string, query = "") {
  const response = await read(cookie, vendorId, query);
  if (response.status !== 200)
    throw new Error(`attendance: ${await response.text()}`);
  return (await response.json()) as Page;
}

function days(result: Page) {
  return result.months.flatMap((month) => month.days);
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

async function seedCategory(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: `${name} ${id.slice(-6)}`,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

type Line = {
  labourCategoryId: string;
  fullDayCount: number;
  halfDayCount: number;
  overtimeHours?: string;
};

/**
 * Selvam Gang on Sky Towers and Green Park, joined 40 days ago, with
 * headcounts saved on the vendor attendance sheet: three days ago at Sky
 * Towers 3 masons (and 1 half day) and 2 helpers with 1.5 h overtime, and
 * 2 half-day helpers at Green Park; two days ago at Sky Towers only an
 * overtime line (no heads); four days ago at Sky Towers a save that was
 * then cleared; yesterday 4 masons at Green Park.
 */
async function history(company: Company) {
  const [sky, green, mason, helper] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
    seedCategory(company.workspaceId, "Mason"),
    seedCategory(company.workspaceId, "Helper"),
  ]);
  const created = await createVendor(
    jsonRequest(VENDORS, company.cookie, {
      name: "Selvam Gang",
      joiningDate: day(-40),
      projectIds: [sky, green],
      shifts: [
        {
          name: "Shift 1",
          rates: [
            {
              labourCategoryId: mason,
              ratePerDay: 90_000,
              overtimePerHour: 12_000,
            },
            {
              labourCategoryId: helper,
              ratePerDay: 55_000,
              overtimePerHour: 7_000,
            },
          ],
        },
      ],
    }),
  );
  if (created.status !== 201)
    throw new Error(`vendor: ${await created.text()}`);
  const vendor = (await created.json()) as {
    id: string;
    shifts: { id: string }[];
  };
  const shiftId = vendor.shifts[0]?.id;

  const save = async (projectId: string, date: string, lines: Line[]) => {
    const response = await recordDay(
      jsonRequest(`${RECORD}/record`, company.cookie, {
        projectId,
        vendorId: vendor.id,
        date,
        lines: lines.map((line) => ({ shiftId, ...line })),
      }),
    );
    if (response.status !== 201)
      throw new Error(`record: ${await response.text()}`);
    return (await response.json()) as { id: string; updatedAt: string };
  };
  await save(sky, day(-3), [
    { labourCategoryId: mason, fullDayCount: 3, halfDayCount: 1 },
    {
      labourCategoryId: helper,
      fullDayCount: 2,
      halfDayCount: 0,
      overtimeHours: "1.5",
    },
  ]);
  await save(green, day(-3), [
    { labourCategoryId: helper, fullDayCount: 0, halfDayCount: 2 },
  ]);
  await save(sky, day(-2), [
    {
      labourCategoryId: mason,
      fullDayCount: 0,
      halfDayCount: 0,
      overtimeHours: "2",
    },
  ]);
  const cleared = await save(sky, day(-4), [
    { labourCategoryId: mason, fullDayCount: 5, halfDayCount: 0 },
  ]);
  const clear = await clearDay(
    jsonRequest(`${RECORD}/${cleared.id}/clear`, company.cookie, {
      expectedUpdatedAt: cleared.updatedAt,
    }),
    params(cleared.id),
  );
  if (clear.status !== 204) throw new Error(`clear: ${await clear.text()}`);
  await save(green, day(-1), [
    { labourCategoryId: mason, fullDayCount: 4, halfDayCount: 0 },
  ]);
  return { sky, green, vendorId: vendor.id };
}

describe("GET /api/construction/labour/vendors/{id}/attendance (ADR CM-0051)", () => {
  it("gives each day its Projects' headcount, head-days and overtime, and the all-time figures", async () => {
    const company = await ownerWithCompany();
    const { sky, green, vendorId } = await history(company);

    const result = await page(company.cookie, vendorId);
    expect(result).toMatchObject({
      measure: "head_days",
      recordsAbsence: false,
      timeZone: "Asia/Kolkata",
      today: TODAY,
      firstMonth: day(-40).slice(0, 7),
      earlierTo: null,
    });

    // The cleared save and the day with no heads are not days supplied.
    expect(days(result).map((d) => d.date)).toEqual([day(-3), day(-1)]);
    const [threeAgo, yesterday] = days(result);
    expect(threeAgo).toMatchObject({
      date: day(-3),
      status: "present",
      workedMinutes: 0,
      overtimeMinutes: 90,
      headDays: 6.5,
    });
    expect(threeAgo?.places).toEqual([
      {
        place: { kind: "project", id: sky, name: "Sky Towers", canOpen: true },
        status: null,
        checkIn: null,
        checkOut: null,
        workedMinutes: 0,
        overtimeMinutes: 90,
        hoursFrom: "none",
        open: false,
        pending: false,
        heads: { full: 5, half: 1, headDays: 5.5 },
      },
      expect.objectContaining({
        place: {
          kind: "project",
          id: green,
          name: "Green Park",
          canOpen: true,
        },
        overtimeMinutes: 0,
        heads: { full: 0, half: 2, headDays: 1 },
      }),
    ]);
    expect(yesterday).toMatchObject({ date: day(-1), headDays: 4 });

    expect(result.allTime).toEqual({
      firstDay: day(-3),
      lastDay: day(-1),
      daysWorked: 2,
      workedMinutes: 0,
      overtimeMinutes: 90,
      headDays: 10.5,
      places: 2,
    });
    for (const word of ["pay", "rate", "amount", "wage"])
      expect(JSON.stringify(result).toLowerCase()).not.toContain(word);
  });

  it("pages back a month at a time to the first month, all-time only on the first page", async () => {
    const company = await ownerWithCompany();
    const { vendorId } = await history(company);
    const thisMonth = TODAY.slice(0, 7);
    const firstMonth = day(-40).slice(0, 7);

    const latest = await page(company.cookie, vendorId, "?months=1");
    expect(latest.months.map((m) => m.month)).toEqual([thisMonth]);
    expect(latest.earlierTo).not.toBeNull();
    expect(latest.allTime).not.toBeNull();

    const earliest = await page(
      company.cookie,
      vendorId,
      `?to=${firstMonth}&months=1`,
    );
    expect(earliest.months.map((m) => m.month)).toEqual([firstMonth]);
    expect(earliest.earlierTo).toBeNull();
    expect(earliest.allTime).toBeNull();
  });

  it("leaves out the Projects the viewer may not open", async () => {
    const company = await ownerWithCompany();
    const { sky, vendorId } = await history(company);
    const onSky = await memberOn(company, { "masters.vendors": ["read"] }, [
      sky,
    ]);

    const result = await page(onSky.cookie, vendorId);
    expect(days(result).map((d) => d.date)).toEqual([day(-3)]);
    expect(days(result)[0]?.places.map((p) => p.place.name)).toEqual([
      "Sky Towers",
    ]);
    expect(result.allTime).toMatchObject({
      daysWorked: 1,
      headDays: 5.5,
      places: 1,
    });

    const nowhere = await memberOn(
      company,
      { "masters.vendors": ["read"] },
      [],
    );
    expect(days(await page(nowhere.cookie, vendorId))).toEqual([]);
  });

  it("needs Vendors Read, a real Vendor of the Company and a real month", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const { sky, vendorId } = await history(company);

    const laboursOnly = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [sky],
    );
    expect((await read(laboursOnly.cookie, vendorId)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const foreign = await read(other.cookie, vendorId);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(((await foreign.json()) as { code: string }).code).toBe(
      "VENDOR_NOT_FOUND",
    );
    expect((await read(company.cookie, vendorId, "?to=2026-13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect((await read(company.cookie, vendorId, "?months=0")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });
});
