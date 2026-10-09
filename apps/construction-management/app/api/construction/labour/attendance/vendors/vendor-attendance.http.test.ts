import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createVendor } from "@/app/api/construction/labour/vendors/route";
import { POST as deactivateVendor } from "@/app/api/construction/labour/vendors/[id]/deactivate/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
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

import { POST as clearDay } from "./[id]/clear/route";
import { GET as getDay } from "./day/route";
import { GET as getMonth } from "./month/route";
import { GET as getOvertime } from "./overtime/route";
import { POST as recordDay } from "./record/route";
import { GET as listDays } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/attendance/vendors`;
const VENDORS = `${TEST_ORIGIN}/api/construction/labour/vendors`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Line = {
  shiftId: string;
  shiftName: string;
  labourCategoryId: string;
  labourCategoryName: string | null;
  fullDayCount: number;
  halfDayCount: number;
  overtimeHours: string;
  ratePerDay: number | null;
  overtimePerHour: number | null;
  amount: number | null;
};

type Day = {
  id: string;
  vendorId: string;
  date: string;
  totalPay: number | null;
  lines: Line[];
  updatedAt: string;
};

type Vendor = {
  id: string;
  shifts: { id: string; name: string }[];
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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

const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);

async function fixtures(company: Company) {
  const [tower, villa, mason, helper] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Tower A"),
    addProject(company.workspaceId, company.userId, "Villa"),
    seedCategory(company.workspaceId, "Mason"),
    seedCategory(company.workspaceId, "Helper"),
  ]);
  const vendor = async (name: string, projectIds: string[]) =>
    json<Vendor>(
      await createVendor(
        jsonRequest(VENDORS, company.cookie, {
          name,
          joiningDate: "2026-01-01",
          projectIds,
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
                  ratePerDay: 55_050,
                  overtimePerHour: 7_000,
                },
              ],
            },
            {
              name: "Night",
              rates: [
                {
                  labourCategoryId: mason,
                  ratePerDay: 100_000,
                  overtimePerHour: 15_000,
                },
              ],
            },
          ],
        }),
      ),
    );
  const ramesh = await vendor("Ramesh Gang", [tower]);
  const suresh = await vendor("Suresh Contractors", [villa]);
  return { tower, villa, mason, helper, ramesh, suresh };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

function body(
  f: Fixtures,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const [shift1] = f.ramesh.shifts;
  return {
    projectId: f.tower,
    vendorId: f.ramesh.id,
    date: YESTERDAY,
    lines: [
      {
        shiftId: shift1?.id,
        labourCategoryId: f.mason,
        fullDayCount: 3,
        halfDayCount: 1,
      },
      {
        shiftId: shift1?.id,
        labourCategoryId: f.helper,
        fullDayCount: 2,
        halfDayCount: 0,
        overtimeHours: "1.5",
      },
    ],
    ...overrides,
  };
}

// Mason 3 × 900 + 450 = 3150; helper 2 × 550.50 + 1.5 × 70 = 1206.
const DAY_PAY = 315_000 + 120_600;

function record(cookie: string, payload: unknown) {
  return recordDay(jsonRequest(`${BASE}/record`, cookie, payload));
}

function clear(cookie: string, id: string, payload: unknown = {}) {
  return clearDay(jsonRequest(`${BASE}/${id}/clear`, cookie, payload), {
    params: Promise.resolve({ id }),
  });
}

async function ledgerSum(vendorId: string): Promise<number> {
  const sum = await prisma.constructionLabourLedgerEntry.aggregate({
    where: { partyId: vendorId, sourceType: "vendor_attendance" },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

async function errorCode(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

describe("vendor attendance HTTP", () => {
  it("records a day, posts its pay to the ledger, edits with expectedUpdatedAt and clears", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);

    const created = await record(company.cookie, body(f));
    expect(created.status).toBe(StatusCodes.CREATED);
    const day = await json<Day>(created);
    expect(day.totalPay).toBe(DAY_PAY);
    expect(day.lines.map((line) => line.amount)).toEqual([315_000, 120_600]);
    expect(day.lines[1]).toMatchObject({
      shiftName: "Shift 1",
      overtimeHours: "1.5",
      ratePerDay: 55_050,
    });
    expect(await ledgerSum(f.ramesh.id)).toBe(DAY_PAY);
    const entries = await prisma.constructionLabourLedgerEntry.findMany({
      where: { sourceId: day.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      partyType: "vendor",
      kind: "earned",
      projectId: f.tower,
      amount: DAY_PAY,
    });

    // Recording the same day again without expectedUpdatedAt is a conflict.
    const again = await record(company.cookie, body(f));
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(again)).toBe("VENDOR_ATTENDANCE_CHANGED");

    // A stale edit is a conflict.
    const stale = await record(
      company.cookie,
      body(f, { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(stale)).toBe("VENDOR_ATTENDANCE_CHANGED");

    // An edit reverses the old entry and posts the new one.
    const night = f.ramesh.shifts[1]?.id;
    const edited = await record(
      company.cookie,
      body(f, {
        lines: [
          {
            shiftId: night,
            labourCategoryId: f.mason,
            fullDayCount: 1,
            halfDayCount: 0,
            overtimeHours: "2",
          },
        ],
        expectedUpdatedAt: day.updatedAt,
      }),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const changed = await json<Day>(edited);
    expect(changed.id).toBe(day.id);
    expect(changed.totalPay).toBe(130_000);
    expect(changed.lines).toHaveLength(1);
    expect(await ledgerSum(f.ramesh.id)).toBe(130_000);
    expect(
      await prisma.constructionLabourLedgerEntry.count({
        where: { sourceId: day.id },
      }),
    ).toBe(3);

    // The day grid shows the vendor with its rate card and the lines.
    const grid = await json<{
      totalPay: number;
      vendors: {
        vendorId: string;
        canRecord: boolean;
        shifts: { rates: { ratePerDay: number | null }[] }[];
        attendance: Day | null;
      }[];
    }>(
      await getDay(
        jsonRequest(
          `${BASE}/day?projectId=${f.tower}&date=${YESTERDAY}`,
          company.cookie,
        ),
      ),
    );
    expect(grid.vendors.map((row) => row.vendorId)).toEqual([f.ramesh.id]);
    expect(grid.vendors[0]?.canRecord).toBe(true);
    expect(grid.vendors[0]?.attendance?.totalPay).toBe(130_000);
    expect(grid.totalPay).toBe(130_000);

    // Clear with a stale updatedAt is a conflict; then it reverses.
    const staleClear = await clear(company.cookie, day.id, {
      expectedUpdatedAt: day.updatedAt,
    });
    expect(staleClear.status).toBe(StatusCodes.CONFLICT);
    const cleared = await clear(company.cookie, day.id, {
      expectedUpdatedAt: changed.updatedAt,
    });
    expect(cleared.status).toBe(StatusCodes.NO_CONTENT);
    expect(await ledgerSum(f.ramesh.id)).toBe(0);
    expect((await clear(company.cookie, day.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: day.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "vendor_attendance.recorded",
      "vendor_attendance.updated",
      "vendor_attendance.cleared",
    ]);

    // The day can be recorded again after a clear.
    expect((await record(company.cookie, body(f))).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("refuses a category off the shift, a vendor off the Project, an inactive vendor and a future date", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const night = f.ramesh.shifts[1]?.id;

    const offShift = await record(
      company.cookie,
      body(f, {
        lines: [
          {
            shiftId: night,
            labourCategoryId: f.helper,
            fullDayCount: 1,
            halfDayCount: 0,
          },
        ],
      }),
    );
    expect(offShift.status).toBe(StatusCodes.BAD_REQUEST);
    const offShiftBody = await json<{ code: string; details: unknown }>(
      offShift,
    );
    expect(offShiftBody.code).toBe("CATEGORY_NOT_ON_SHIFT");
    expect(offShiftBody.details).toMatchObject({
      lineIndex: 0,
      shiftId: night,
      labourCategoryId: f.helper,
    });

    const offProject = await record(
      company.cookie,
      body(f, { vendorId: f.suresh.id }),
    );
    expect(offProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(offProject)).toBe("VENDOR_NOT_ON_PROJECT");

    const future = await record(
      company.cookie,
      body(f, { date: addDays(TODAY, 1) }),
    );
    expect(future.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(future)).toBe("ATTENDANCE_DATE_IN_FUTURE");

    await deactivateVendor(
      jsonRequest(`${VENDORS}/${f.ramesh.id}/deactivate`, company.cookie, {}),
      { params: Promise.resolve({ id: f.ramesh.id }) },
    );
    const inactive = await record(company.cookie, body(f));
    expect(inactive.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(inactive)).toBe("VENDOR_INACTIVE");
    expect(await ledgerSum(f.ramesh.id)).toBe(0);
  });

  it("applies the back-dated guard to a Member, and the Owner passes it", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        createDays: 2,
        createOverrideDesignationIds: [],
        editDays: 2,
        editOverrideDesignationIds: [],
        modules: {},
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const clerk = await member(
      company,
      { "labour.attendance": ["read", "create", "update", "delete"] },
      [f.tower],
    );
    const old = addDays(TODAY, -5);
    const blocked = await record(clerk.cookie, body(f, { date: old }));
    expect(blocked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(blocked)).toBe("BACKDATED_CREATE_BLOCKED");

    const byOwner = await record(company.cookie, body(f, { date: old }));
    expect(byOwner.status).toBe(StatusCodes.CREATED);
    const ownerDay = await json<Day>(byOwner);
    const edit = await record(
      clerk.cookie,
      body(f, { date: old, expectedUpdatedAt: ownerDay.updatedAt }),
    );
    expect(edit.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(edit)).toBe("BACKDATED_EDIT_BLOCKED");
    const clearOld = await clear(clerk.cookie, ownerDay.id);
    expect(clearOld.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(clearOld)).toBe("BACKDATED_EDIT_BLOCKED");

    // Within the limit the Member records; without Financial, amounts are null.
    const recent = await record(clerk.cookie, body(f));
    expect(recent.status).toBe(StatusCodes.CREATED);
    const recentDay = await json<Day>(recent);
    expect(recentDay.totalPay).toBeNull();
    expect(recentDay.lines[0]).toMatchObject({
      fullDayCount: 3,
      ratePerDay: null,
      amount: null,
    });
    expect(await ledgerSum(f.ramesh.id)).toBe(DAY_PAY * 2);
  });

  it("checks Attendance on the Project, the update and delete flags, and Vendor Financial", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);

    const offProject = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.villa],
    );
    const refused = await record(offProject.cookie, body(f));
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(refused)).toBe("PERMISSION_DENIED");
    expect(
      (
        await getDay(
          jsonRequest(
            `${BASE}/day?projectId=${f.tower}&date=${YESTERDAY}`,
            offProject.cookie,
          ),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const creator = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.tower],
    );
    const day = await json<Day>(await record(creator.cookie, body(f)));
    const edit = await record(
      creator.cookie,
      body(f, { expectedUpdatedAt: day.updatedAt }),
    );
    expect(edit.status).toBe(StatusCodes.FORBIDDEN);
    expect((await clear(creator.cookie, day.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const accountant = await member(
      company,
      {
        "labour.attendance": ["read"],
        "labour.vendor": ["read", "financial"],
      },
      [f.tower],
    );
    const seen = await json<{ items: Day[] }>(
      await listDays(
        jsonRequest(`${BASE}?projectId=${f.tower}`, accountant.cookie),
      ),
    );
    expect(seen.items[0]?.totalPay).toBe(DAY_PAY);
    const hidden = await json<{ items: Day[] }>(
      await listDays(
        jsonRequest(`${BASE}?projectId=${f.tower}`, creator.cookie),
      ),
    );
    expect(hidden.items[0]?.totalPay).toBeNull();
    expect(hidden.items[0]?.lines[0]?.amount).toBeNull();
  });

  it("lists with filters, totals the month and lists overtime", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const second = await json<Vendor>(
      await createVendor(
        jsonRequest(VENDORS, company.cookie, {
          name: "Anil Gang",
          joiningDate: "2026-01-01",
          projectIds: [f.tower],
          shifts: [
            {
              name: "Shift 1",
              rates: [
                {
                  labourCategoryId: f.mason,
                  ratePerDay: 80_000,
                  overtimePerHour: 10_000,
                },
              ],
            },
          ],
        }),
      ),
    );
    const month = TODAY.slice(0, 7);
    const first = `${month}-01`;
    const dates = [first, ...(TODAY === first ? [] : [TODAY])];
    for (const date of dates)
      expect((await record(company.cookie, body(f, { date }))).status).toBe(
        StatusCodes.CREATED,
      );
    await record(company.cookie, {
      projectId: f.tower,
      vendorId: second.id,
      date: first,
      lines: [
        {
          shiftId: second.shifts[0]?.id,
          labourCategoryId: f.mason,
          fullDayCount: 2,
          halfDayCount: 0,
          overtimeHours: "0.5",
        },
      ],
    });
    const secondPay = 160_000 + 5_000;

    const list = await json<{ items: Day[]; total: number }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&vendorId=${second.id}`,
          company.cookie,
        ),
      ),
    );
    expect(list.total).toBe(1);
    const helperDays = await json<{ total: number }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&categoryId=${f.helper}&from=${first}&to=${first}`,
          company.cookie,
        ),
      ),
    );
    expect(helperDays.total).toBe(1);

    const view = await json<{
      dates: string[];
      vendors: {
        vendorName: string;
        days: { date: string; pay: number }[];
        totals: { fullDayCount: number; overtimeHours: string; pay: number };
      }[];
      categories: { labourCategoryId: string; pay: number }[];
      totals: { pay: number };
    }>(
      await getMonth(
        jsonRequest(
          `${BASE}/month?projectId=${f.tower}&month=${month}`,
          company.cookie,
        ),
      ),
    );
    expect(view.dates[0]).toBe(first);
    expect(view.vendors.map((row) => row.vendorName)).toEqual([
      "Anil Gang",
      "Ramesh Gang",
    ]);
    expect(view.vendors[1]?.totals).toMatchObject({
      fullDayCount: 5 * dates.length,
      pay: DAY_PAY * dates.length,
    });
    expect(view.vendors[0]?.totals).toMatchObject({
      overtimeHours: "0.5",
      pay: secondPay,
    });
    expect(
      view.categories.find((row) => row.labourCategoryId === f.helper)?.pay,
    ).toBe(120_600 * dates.length);
    expect(view.totals.pay).toBe(DAY_PAY * dates.length + secondPay);

    const overtime = await json<{
      items: { vendorName: string; overtimeAmount: number }[];
      totalHours: string;
      totalAmount: number;
    }>(
      await getOvertime(
        jsonRequest(
          `${BASE}/overtime?projectId=${f.tower}&from=${first}&to=${first}`,
          company.cookie,
        ),
      ),
    );
    expect(overtime.items.map((item) => item.overtimeAmount)).toEqual([
      10_500, 5_000,
    ]);
    expect(overtime).toMatchObject({ totalHours: "2", totalAmount: 15_500 });

    const badMonth = await getMonth(
      jsonRequest(
        `${BASE}/month?projectId=${f.tower}&month=2026-13`,
        company.cookie,
      ),
    );
    expect(badMonth.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/labour/attendance/vendors",
      "/api/construction/labour/attendance/vendors/day",
      "/api/construction/labour/attendance/vendors/record",
      "/api/construction/labour/attendance/vendors/{id}/clear",
      "/api/construction/labour/attendance/vendors/month",
      "/api/construction/labour/attendance/vendors/overtime",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas[
        "RecordConstructionLabourVendorAttendanceRequest"
      ],
    ).toBeDefined();
    expect(
      document.components.schemas[
        "GetConstructionLabourVendorAttendanceMonthResponse"
      ],
    ).toBeDefined();
  });
});
