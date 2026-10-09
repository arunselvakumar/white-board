import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as deactivateLabour } from "@/app/api/construction/labour/labours/[id]/deactivate/route";
import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as transferLabours } from "@/app/api/construction/labour/labours/transfer/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { daysInMonth, weekdayOf } from "@/src/labour/domain/wages";
import { prismaLedger } from "@/src/labour/infrastructure/prisma-ledger";
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

import { POST as setPaidLeave } from "./[id]/paid-leave/route";
import { POST as clearDays } from "./clear/route";
import { POST as markDays } from "./mark/route";
import { GET as getMonth } from "./month/route";
import { GET as listDays } from "./route";
import { GET as getSheet } from "./sheet/route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/attendance/labour`;
const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Day = {
  id: string;
  labourId: string;
  labourName: string;
  date: string;
  status: string;
  isPaidLeave: boolean;
  shift: string | null;
  supervisor: { id: string; name: string } | null;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  workingHours: string;
  workedHours: string | null;
  wageRate: number | null;
  earned: number | null;
  overtime: {
    labourCategoryId: string | null;
    hours: string;
    ratePerHour: number | null;
    amount: number | null;
    fromTimes: boolean;
  }[];
  overtimeHours: string;
  overtimeAmount: number | null;
  total: number | null;
  updatedAt: string;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function failure(
  response: Response,
): Promise<{ status: number; code: string; details: unknown }> {
  const body = await json<{ code: string; details?: unknown }>(response);
  return { status: response.status, code: body.code, details: body.details };
}

const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);
const DAILY = 70_000;
const OT = 10_000;
const MONTHLY = 3_000_000;

function monthlyDay(date: string, halves = 2): number {
  // Calendar-day proration, rounded half up.
  return Math.round((MONTHLY * halves) / (2 * daysInMonth(date)));
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

async function seedSupervisor(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionMastersSupervisor.create({
    data: { id, workspaceId, name, createdBy: "test", updatedBy: "test" },
  });
  return id;
}

async function fixtures(company: Company) {
  const [tower, villa, mason, sundar] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Tower A"),
    addProject(company.workspaceId, company.userId, "Villa"),
    seedCategory(company.workspaceId, "Mason"),
    seedSupervisor(company.workspaceId, "Sundar"),
  ]);
  const labour = async (body: Record<string, unknown>) => {
    const response = await createLabour(
      jsonRequest(LABOURS, company.cookie, {
        joiningDate: "2026-09-01",
        overtimeWagePerHour: OT,
        weeklyHolidays: [],
        currentProjectId: tower,
        supervisorId: sundar,
        labourCategoryId: mason,
        ...body,
      }),
    );
    if (response.status !== 201)
      throw new Error(`labour: ${await response.text()}`);
    return (await json<{ id: string }>(response)).id;
  };
  const dhuresh = await labour({
    name: "Dhuresh Nawin",
    wageType: "daily",
    wagePerDay: DAILY,
  });
  const kavitha = await labour({
    name: "Kavitha Murugan",
    wageType: "monthly",
    wagePerMonth: MONTHLY,
  });
  return { tower, villa, mason, sundar, dhuresh, kavitha, labour };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

function mark(cookie: string, payload: unknown) {
  return markDays(jsonRequest(`${BASE}/mark`, cookie, payload));
}

async function marked(cookie: string, payload: unknown): Promise<Day[]> {
  const response = await mark(cookie, payload);
  if (response.status !== 200)
    throw new Error(`mark: ${await response.text()}`);
  return (await json<{ items: Day[] }>(response)).items;
}

function clear(cookie: string, payload: unknown) {
  return clearDays(jsonRequest(`${BASE}/clear`, cookie, payload));
}

function paidLeave(cookie: string, id: string, payload: unknown) {
  return setPaidLeave(
    jsonRequest(`${BASE}/${id}/paid-leave`, cookie, payload),
    {
      params: Promise.resolve({ id }),
    },
  );
}

function sheet(cookie: string, projectId: string, date: string) {
  return getSheet(
    jsonRequest(`${BASE}/sheet?projectId=${projectId}&date=${date}`, cookie),
  );
}

async function ledgerSum(labourId: string): Promise<number> {
  const sum = await prisma.constructionLabourLedgerEntry.aggregate({
    where: { partyId: labourId, sourceType: "labour_attendance" },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
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

function body(f: Fixtures, overrides: Record<string, unknown> = {}) {
  return {
    projectId: f.tower,
    date: YESTERDAY,
    marks: [
      {
        labourId: f.dhuresh,
        status: "present",
        shift: "Shift 1",
        overtime: [{ labourCategoryId: f.mason, hours: "1.5" }],
      },
      {
        labourId: f.kavitha,
        status: "half_day",
        overtime: [{ labourCategoryId: null, hours: 2, ratePerHour: 12_500 }],
      },
    ],
    ...overrides,
  };
}

describe("labour attendance HTTP", () => {
  it("marks many Labours, posts earned and overtime, re-marks with expected and clears", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const [dhuresh, kavitha] = await marked(company.cookie, body(f));
    expect(dhuresh).toMatchObject({
      labourId: f.dhuresh,
      status: "present",
      shift: "Shift 1",
      supervisor: { id: f.sundar, name: "Sundar" },
      wageRate: DAILY,
      earned: DAILY,
      overtimeHours: "1.5",
      overtimeAmount: 15_000,
      total: DAILY + 15_000,
    });
    expect(dhuresh?.overtime[0]).toMatchObject({
      labourCategoryId: f.mason,
      ratePerHour: OT,
    });
    expect(kavitha).toMatchObject({
      wageRate: MONTHLY,
      earned: monthlyDay(YESTERDAY, 1),
      overtimeAmount: 25_000,
    });
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY + 15_000);
    expect(await ledgerSum(f.kavitha)).toBe(monthlyDay(YESTERDAY, 1) + 25_000);
    const entries = await prisma.constructionLabourLedgerEntry.findMany({
      where: { sourceId: dhuresh?.id },
      orderBy: { kind: "asc" },
    });
    expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["earned", DAILY],
      ["overtime", 15_000],
    ]);
    expect(entries[0]?.projectId).toBe(f.tower);

    // Marking again without expected (a stale screen) is a conflict.
    const again = await failure(
      await mark(company.cookie, {
        ...body(f),
        marks: [{ labourId: f.dhuresh, status: "absent" }],
      }),
    );
    expect(again).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "ATTENDANCE_CHANGED",
      details: { labourId: f.dhuresh },
    });
    const stale = await failure(
      await mark(company.cookie, {
        ...body(f),
        marks: [{ labourId: f.dhuresh, status: "absent" }],
        expected: { [f.dhuresh]: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);

    // Re-mark: reverse and repost; the balance follows.
    const [changed] = await marked(company.cookie, {
      ...body(f),
      marks: [{ labourId: f.dhuresh, status: "half_day" }],
      expected: { [f.dhuresh]: dhuresh?.updatedAt },
    });
    expect(changed?.id).toBe(dhuresh?.id);
    expect(changed?.total).toBe(DAILY / 2);
    expect(changed?.overtime).toEqual([]);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY / 2);
    const balances = await prismaLedger.balances(
      prisma,
      company.workspaceId,
      "labour",
      [f.dhuresh],
      TODAY,
    );
    expect(balances.get(f.dhuresh)).toBe(DAILY / 2);
    expect(
      await prisma.constructionLabourLedgerEntry.count({
        where: { sourceId: dhuresh?.id },
      }),
    ).toBe(5);

    // Clear with a stale updatedAt is a conflict; then it reverses.
    const staleClear = await failure(
      await clear(company.cookie, {
        projectId: f.tower,
        date: YESTERDAY,
        labourIds: [f.dhuresh],
        expected: { [f.dhuresh]: dhuresh?.updatedAt },
      }),
    );
    expect(staleClear).toMatchObject({
      status: StatusCodes.CONFLICT,
      details: { labourId: f.dhuresh },
    });
    const cleared = await clear(company.cookie, {
      projectId: f.tower,
      date: YESTERDAY,
      labourIds: [f.dhuresh, f.kavitha],
      expected: {
        [f.dhuresh]: changed?.updatedAt,
        [f.kavitha]: kavitha?.updatedAt,
      },
    });
    expect(cleared.status).toBe(StatusCodes.NO_CONTENT);
    expect(await ledgerSum(f.dhuresh)).toBe(0);
    expect(await ledgerSum(f.kavitha)).toBe(0);
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: dhuresh?.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "labour_attendance.marked",
      "labour_attendance.updated",
      "labour_attendance.cleared",
    ]);
    // The day can be marked again after a clear.
    expect((await mark(company.cookie, body(f))).status).toBe(StatusCodes.OK);
  });

  it("pays a Holiday only to the monthly Labour, and Paid Leave toggles the ledger", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const [dhuresh, kavitha] = await marked(company.cookie, {
      projectId: f.tower,
      date: YESTERDAY,
      marks: [
        { labourId: f.dhuresh, status: "holiday" },
        { labourId: f.kavitha, status: "holiday" },
      ],
    });
    expect(dhuresh?.earned).toBe(0);
    expect(kavitha?.earned).toBe(monthlyDay(YESTERDAY));
    expect(await ledgerSum(f.dhuresh)).toBe(0);

    const [leave] = await marked(company.cookie, {
      projectId: f.tower,
      date: YESTERDAY,
      marks: [{ labourId: f.dhuresh, status: "on_leave" }],
      expected: { [f.dhuresh]: dhuresh?.updatedAt },
    });
    if (leave == null) throw new Error("no leave row");
    expect(leave.earned).toBe(0);
    const paid = await paidLeave(company.cookie, leave.id, {
      isPaidLeave: true,
      expectedUpdatedAt: leave.updatedAt,
    });
    expect(paid.status).toBe(StatusCodes.OK);
    const paidDay = await json<Day>(paid);
    expect(paidDay).toMatchObject({ isPaidLeave: true, earned: DAILY });
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
    const unpaid = await json<Day>(
      await paidLeave(company.cookie, leave.id, {
        isPaidLeave: false,
        expectedUpdatedAt: paidDay.updatedAt,
      }),
    );
    expect(unpaid.earned).toBe(0);
    expect(await ledgerSum(f.dhuresh)).toBe(0);

    // Paid Leave on a day that is not On Leave is refused.
    const notLeave = await failure(
      await paidLeave(company.cookie, kavitha?.id ?? "", {
        isPaidLeave: true,
        expectedUpdatedAt: kavitha?.updatedAt,
      }),
    );
    expect(notLeave.code).toBe("PAID_LEAVE_NEEDS_LEAVE");
  });

  it("refuses overtime on an absent day, inactive Labours and Labours off the Project that day", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const absent = await failure(
      await mark(company.cookie, {
        ...body(f),
        marks: [
          {
            labourId: f.kavitha,
            status: "absent",
            overtime: [{ labourCategoryId: null, hours: 1 }],
          },
        ],
      }),
    );
    expect(absent).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "OVERTIME_ON_ABSENT_DAY",
      details: { labourId: f.kavitha },
    });

    // Dhuresh moves to the Villa from two days ago.
    const moved = await transferLabours(
      jsonRequest(`${LABOURS}/transfer`, company.cookie, {
        labourIds: [f.dhuresh],
        toProjectId: f.villa,
        transferDate: addDays(TODAY, -2),
      }),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    const offProject = await failure(
      await mark(company.cookie, {
        ...body(f),
        marks: [{ labourId: f.dhuresh, status: "present" }],
      }),
    );
    expect(offProject).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "LABOUR_NOT_ON_PROJECT",
      details: { labourId: f.dhuresh, projectId: f.villa },
    });
    // Before the transfer the day belongs to the Tower; after, to the Villa.
    expect(
      (
        await mark(company.cookie, {
          ...body(f),
          date: addDays(TODAY, -3),
          marks: [{ labourId: f.dhuresh, status: "present" }],
        })
      ).status,
    ).toBe(StatusCodes.OK);
    expect(
      (
        await mark(company.cookie, {
          ...body(f),
          projectId: f.villa,
          marks: [{ labourId: f.dhuresh, status: "present" }],
        })
      ).status,
    ).toBe(StatusCodes.OK);
    const towerSheet = await json<{ labourers: { labourId: string }[] }>(
      await sheet(company.cookie, f.tower, YESTERDAY),
    );
    expect(towerSheet.labourers.map((row) => row.labourId)).toEqual([
      f.kavitha,
    ]);

    await deactivateLabour(
      jsonRequest(`${LABOURS}/${f.kavitha}/deactivate`, company.cookie, {}),
      { params: Promise.resolve({ id: f.kavitha }) },
    );
    const inactive = await failure(
      await mark(company.cookie, {
        ...body(f),
        marks: [{ labourId: f.kavitha, status: "present" }],
      }),
    );
    expect(inactive).toMatchObject({
      code: "LABOUR_INACTIVE",
      details: { labourId: f.kavitha },
    });
    expect(await ledgerSum(f.kavitha)).toBe(0);
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
    const blocked = await failure(
      await mark(clerk.cookie, body(f, { date: old })),
    );
    expect(blocked).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "BACKDATED_CREATE_BLOCKED",
    });
    const [ownerDay] = await marked(company.cookie, body(f, { date: old }));
    const edit = await failure(
      await mark(
        clerk.cookie,
        body(f, {
          date: old,
          marks: [{ labourId: f.dhuresh, status: "absent" }],
          expected: { [f.dhuresh]: ownerDay?.updatedAt },
        }),
      ),
    );
    expect(edit.code).toBe("BACKDATED_EDIT_BLOCKED");
    const clearOld = await failure(
      await clear(clerk.cookie, {
        projectId: f.tower,
        date: old,
        labourIds: [f.dhuresh],
        expected: { [f.dhuresh]: ownerDay?.updatedAt },
      }),
    );
    expect(clearOld.code).toBe("BACKDATED_EDIT_BLOCKED");
  });

  it("checks Attendance on the Project and hides amounts without Labour Financial", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const offProject = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.villa],
    );
    expect((await mark(offProject.cookie, body(f))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await sheet(offProject.cookie, f.tower, YESTERDAY)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const creator = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.tower],
    );
    const [day] = await marked(creator.cookie, body(f));
    expect(day).toMatchObject({
      wageRate: null,
      earned: null,
      overtimeAmount: null,
      total: null,
      overtimeHours: "1.5",
    });
    expect(day?.overtime[0]?.ratePerHour).toBeNull();
    // The Member's mark is still priced from the labourer's wages.
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY + 15_000);
    const remark = await failure(
      await mark(creator.cookie, {
        ...body(f),
        marks: [{ labourId: f.dhuresh, status: "absent" }],
        expected: { [f.dhuresh]: day?.updatedAt },
      }),
    );
    expect(remark.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await clear(creator.cookie, {
          projectId: f.tower,
          date: YESTERDAY,
          labourIds: [f.dhuresh],
          expected: { [f.dhuresh]: day?.updatedAt },
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const sheetBody = await json<{
      labourers: {
        overtimeWagePerHour: number | null;
        wagePerDay: number | null;
      }[];
      totals: { earned: number | null; marked: number };
    }>(await sheet(creator.cookie, f.tower, YESTERDAY));
    expect(sheetBody.labourers[0]?.overtimeWagePerHour).toBeNull();
    expect(sheetBody.totals).toMatchObject({ earned: null, marked: 2 });

    const accountant = await member(
      company,
      {
        "labour.attendance": ["read"],
        "labour.labour": ["read", "financial"],
      },
      [f.tower],
    );
    const withMoney = await json<{
      labourers: { name: string; overtimeWagePerHour: number | null }[];
      totals: { earned: number | null };
    }>(await sheet(accountant.cookie, f.tower, YESTERDAY));
    expect(withMoney.labourers[0]).toMatchObject({
      name: "Dhuresh Nawin",
      overtimeWagePerHour: OT,
    });
    expect(withMoney.totals.earned).toBe(DAILY + monthlyDay(YESTERDAY, 1));
  });

  it("serves the sheet with hints, the recorded list with filters and cursors, and the month grid", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    // Kavitha's weekly holiday is the weekday of TODAY.
    await prisma.constructionLabourLabour.update({
      where: { id: f.kavitha },
      data: { weeklyHolidays: [weekdayOf(TODAY)] },
    });
    await marked(company.cookie, body(f));
    const today = await json<{
      labourers: {
        labourId: string;
        suggestedStatus: string | null;
        isWeeklyHoliday: boolean;
        yesterday: { status: string; shift: string | null } | null;
        attendance: Day | null;
        labourCategory: { id: string } | null;
      }[];
      labourCategories: { id: string }[];
      supervisors: { id: string; name: string }[];
    }>(await sheet(company.cookie, f.tower, TODAY));
    const dhureshRow = today.labourers.find(
      (row) => row.labourId === f.dhuresh,
    );
    const kavithaRow = today.labourers.find(
      (row) => row.labourId === f.kavitha,
    );
    expect(dhureshRow).toMatchObject({
      suggestedStatus: "present",
      yesterday: { status: "present", shift: "Shift 1" },
      attendance: null,
      labourCategory: { id: f.mason },
    });
    expect(kavithaRow).toMatchObject({
      suggestedStatus: "holiday",
      isWeeklyHoliday: true,
    });
    expect(today.labourCategories.map((item) => item.id)).toContain(f.mason);
    expect(today.supervisors).toEqual([{ id: f.sundar, name: "Sundar" }]);

    const twoDaysAgo = addDays(TODAY, -2);
    await marked(company.cookie, {
      projectId: f.tower,
      date: twoDaysAgo,
      marks: [
        { labourId: f.dhuresh, status: "on_leave", isPaidLeave: true },
        { labourId: f.kavitha, status: "absent" },
      ],
    });

    const page1 = await json<{
      items: Day[];
      nextCursor: string | null;
      prevCursor: string | null;
      total: number;
    }>(
      await listDays(
        jsonRequest(`${BASE}?projectId=${f.tower}&limit=3`, company.cookie),
      ),
    );
    expect(page1.total).toBe(4);
    expect(page1.items.map((item) => item.date)).toEqual([
      YESTERDAY,
      YESTERDAY,
      twoDaysAgo,
    ]);
    expect(page1.prevCursor).toBeNull();
    const page2 = await json<{ items: Day[]; prevCursor: string | null }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&limit=3&after=${page1.nextCursor ?? ""}`,
          company.cookie,
        ),
      ),
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.date).toBe(twoDaysAgo);
    const back = await json<{ items: Day[] }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&limit=3&before=${page2.prevCursor ?? ""}`,
          company.cookie,
        ),
      ),
    );
    expect(back.items.map((item) => item.id)).toEqual(
      page1.items.map((item) => item.id),
    );
    const paidOnly = await json<{ items: Day[]; total: number }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&status=paid_leave`,
          company.cookie,
        ),
      ),
    );
    expect(paidOnly.items.map((item) => item.labourId)).toEqual([f.dhuresh]);
    const byLabour = await json<{ total: number }>(
      await listDays(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&labourId=${f.kavitha}&from=${YESTERDAY}&to=${YESTERDAY}&supervisorId=${f.sundar}`,
          company.cookie,
        ),
      ),
    );
    expect(byLabour.total).toBe(1);

    // The month grid of the month holding yesterday.
    const month = YESTERDAY.slice(0, 7);
    const grid = await json<{
      dates: string[];
      labourers: {
        labourId: string;
        days: { date: string; code: string; overtimeHours: string }[];
        totals: Record<string, number | string | null>;
      }[];
    }>(
      await getMonth(
        jsonRequest(
          `${BASE}/month?projectId=${f.tower}&month=${month}`,
          company.cookie,
        ),
      ),
    );
    expect(grid.dates).toHaveLength(daysInMonth(YESTERDAY));
    const dhureshGrid = grid.labourers.find(
      (row) => row.labourId === f.dhuresh,
    );
    const sameMonth = twoDaysAgo.slice(0, 7) === month;
    expect(
      dhureshGrid?.days.find((day) => day.date === YESTERDAY),
    ).toMatchObject({
      code: "P",
      overtimeHours: "1.5",
    });
    expect(dhureshGrid?.totals).toMatchObject({
      present: 1,
      paidLeave: sameMonth ? 1 : 0,
      overtimeHours: "1.5",
      earned: sameMonth ? 2 * DAILY : DAILY,
      overtimeAmount: 15_000,
    });
  });

  it("works overtime out from check-in and check-out at the Labour's working hours (ADR CM-0011)", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const watchman = await f.labour({
      name: "Watchman Velu",
      wageType: "daily",
      wagePerDay: DAILY,
      workingHoursPerDay: 9,
    });
    const timed = (times: Record<string, unknown>) => ({
      projectId: f.tower,
      date: YESTERDAY,
      marks: [
        {
          labourId: watchman,
          status: "present",
          ...times,
          overtime: [{ labourCategoryId: f.mason, fromTimes: true, hours: 7 }],
        },
      ],
    });

    // 08:00–19:00 less a 1-hour break is 10 hours: 1 hour beyond 9.
    const [day] = await marked(
      company.cookie,
      timed({ checkIn: "08:00", checkOut: "19:00", breakMinutes: 60 }),
    );
    expect(day).toMatchObject({
      checkIn: "08:00",
      checkOut: "19:00",
      breakMinutes: 60,
      workingHours: "9",
      workedHours: "10",
      overtime: [
        {
          labourCategoryId: f.mason,
          hours: "1",
          ratePerHour: OT,
          amount: OT,
          fromTimes: true,
        },
      ],
      overtimeHours: "1",
      total: DAILY + OT,
    });
    const entries = await prisma.constructionLabourLedgerEntry.findMany({
      where: { sourceId: day?.id },
      orderBy: { kind: "asc" },
    });
    expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["earned", DAILY],
      ["overtime", OT],
    ]);
    const row = await prisma.constructionLabourAttendance.findUniqueOrThrow({
      where: { id: day?.id },
      include: { overtime: true },
    });
    expect(row.workingHours.toString()).toBe("9");
    expect(row.overtime[0]?.fromTimes).toBe(true);

    // A later check-out re-works the line.
    const [later] = await marked(company.cookie, {
      ...timed({ checkIn: "08:00", checkOut: "20:30" }),
      expected: { [watchman]: day?.updatedAt },
    });
    expect(later).toMatchObject({
      workedHours: "11.5",
      overtime: [{ hours: "2.5", amount: 25_000, fromTimes: true }],
    });
    expect(await ledgerSum(watchman)).toBe(DAILY + 25_000);

    // A check-in alone: no overtime from the times yet.
    const [morning] = await marked(company.cookie, {
      ...timed({ checkIn: "08:00", checkOut: null }),
      expected: { [watchman]: later?.updatedAt },
    });
    expect(morning).toMatchObject({
      checkIn: "08:00",
      checkOut: null,
      breakMinutes: 60,
      workedHours: null,
      overtime: [],
    });
    expect(await ledgerSum(watchman)).toBe(DAILY);

    // The sheet carries working hours and yesterday's times.
    const today = await json<{
      labourers: {
        labourId: string;
        workingHoursPerDay: string | null;
        yesterday: { checkIn: string | null; breakMinutes: number | null };
      }[];
    }>(await sheet(company.cookie, f.tower, TODAY));
    expect(
      today.labourers.find((row) => row.labourId === watchman),
    ).toMatchObject({
      workingHoursPerDay: "9",
      yesterday: { checkIn: "08:00", breakMinutes: 60 },
    });

    // Times on an Absent day are refused for that Labour.
    const absent = await failure(
      await mark(company.cookie, {
        projectId: f.tower,
        date: YESTERDAY,
        marks: [{ labourId: f.dhuresh, status: "absent", checkIn: "09:00" }],
      }),
    );
    expect(absent).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "TIMES_NEED_PRESENT",
      details: { labourId: f.dhuresh, field: "checkIn" },
    });
  });

  it("lists the labour attendance routes on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/labour/attendance/labour",
      "/api/construction/labour/attendance/labour/sheet",
      "/api/construction/labour/attendance/labour/mark",
      "/api/construction/labour/attendance/labour/clear",
      "/api/construction/labour/attendance/labour/{id}/paid-leave",
      "/api/construction/labour/attendance/labour/month",
    ])
      expect(document.paths).toHaveProperty([path]);
  });
});
