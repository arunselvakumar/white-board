import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it } from "vitest";

import { POST as saveSalaries } from "@/app/api/construction/hrms/employees/salary/save/route";
import { POST as createStructureRoute } from "@/app/api/construction/hrms/salary-structures/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { ownerMemberId } from "../leave-http-support";
import { POST as approveRoute } from "./approve/route";
import { POST as advanceRoute } from "./calculate-advance/route";
import { POST as calculateRoute } from "./calculate-bulk/route";
import { GET as scheduledRoute } from "./calculate-bulk/scheduled/route";
import { GET as payslipRoute } from "./[id]/payslip/route";
import { GET as detailRoute } from "./[id]/route";
import { POST as markPaidRoute } from "./mark-paid/route";
import { GET as myRoute } from "./my/route";
import { POST as recalculateRoute } from "./recalculate/route";
import { GET as reportRoute } from "./report/team/route";
import { GET as teamRoute } from "./route";
import type {
  CalculateConstructionHrmsSalariesResponseModel,
  ConstructionHrmsSalarySlipModel,
  ListConstructionHrmsMySalariesResponseModel,
  ListConstructionHrmsTeamSalariesResponseModel,
} from "./salary-models";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/salaries`;
// A month that has ended whenever the suite runs.
const MONTH = "2026-09";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const team = (cookie: string, month = MONTH) =>
  teamRoute(jsonRequest(`${BASE}?month=${month}`, cookie));
const calculate = (cookie: string, body: unknown) =>
  calculateRoute(jsonRequest(`${BASE}/calculate-bulk`, cookie, body));
const approve = (cookie: string, slips: ConstructionHrmsSalarySlipModel[]) =>
  approveRoute(
    jsonRequest(`${BASE}/approve`, cookie, {
      slips: slips.map((slip) => ({
        id: slip.id,
        expectedUpdatedAt: slip.updatedAt,
      })),
    }),
  );
const markPaid = (
  cookie: string,
  slips: ConstructionHrmsSalarySlipModel[],
  extra: Record<string, unknown> = {},
) =>
  markPaidRoute(
    jsonRequest(`${BASE}/mark-paid`, cookie, {
      slips: slips.map((slip) => ({
        id: slip.id,
        expectedUpdatedAt: slip.updatedAt,
      })),
      mode: "bank",
      paymentDate: "2026-10-01",
      reference: "NEFT 42",
      ...extra,
    }),
  );
const detail = (cookie: string, id: string) =>
  detailRoute(jsonRequest(`${BASE}/${id}`, cookie), params(id));
const payslip = (cookie: string, id: string) =>
  payslipRoute(jsonRequest(`${BASE}/${id}/payslip`, cookie), params(id));

/** Basic 50% (PF wage) and Special the balance; PF on, no ESI or PT. */
async function structure(cookie: string): Promise<{ id: string }> {
  const response = await createStructureRoute(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/hrms/salary-structures`,
      cookie,
      {
        name: "Office staff",
        description: null,
        components: [
          {
            id: null,
            name: "Basic",
            basis: "percent_of_base",
            amount: null,
            percent: "50",
            isBalancing: false,
            countsForPfWage: true,
          },
          {
            id: null,
            name: "Special",
            basis: "fixed",
            amount: null,
            percent: null,
            isBalancing: true,
            countsForPfWage: false,
          },
        ],
        pf: {
          applicable: true,
          employeePercent: null,
          capAtCeiling: true,
          wageCeiling: null,
        },
        esi: { applicable: false, employeePercent: null },
        pt: { applicable: false, monthlyAmount: null },
        deductAbsentDays: false,
        deductUnpaidLeave: true,
        otherDeductions: [],
        isActive: true,
      },
    ),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string }>(response);
}

async function configure(
  cookie: string,
  structureId: string,
  memberIds: string[],
): Promise<void> {
  const response = await saveSalaries(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/hrms/employees/salary/save`,
      cookie,
      {
        rows: memberIds.map((memberId) => ({
          memberId,
          structureId,
          baseMonthly: 3_000_000,
          componentOverrides: null,
          gender: null,
          uan: "100200300400",
          esiIpNumber: null,
          effectiveFrom: "2026-01-01",
          expectedUpdatedAt: null,
        })),
      },
    ),
  );
  expect(response.status).toBe(StatusCodes.OK);
}

/**
 * A Company whose Owner and a Team Member (`flags` on `hrms.salaries`)
 * are Configured; September calculated when `calculated`.
 */
async function company(flags: Flag[] = ["read"], calculated = true) {
  const owner = await ownerWithCompany();
  const member = await memberWith(owner, { "hrms.salaries": flags });
  const ownerId = await ownerMemberId(owner.workspaceId, owner.userId);
  const { id } = await structure(owner.cookie);
  await configure(owner.cookie, id, [ownerId, member.memberId]);
  if (calculated)
    expect((await calculate(owner.cookie, { month: MONTH })).status).toBe(
      StatusCodes.OK,
    );
  const slips = async () => {
    const view = await json<ListConstructionHrmsTeamSalariesResponseModel>(
      await team(owner.cookie),
    );
    const of = (memberId: string) => {
      const slip = view.items.find(
        (item) => item.memberId === memberId && item.kind === "regular",
      );
      if (slip == null) throw new Error("no slip");
      return slip;
    };
    return { view, owner: of(ownerId), member: of(member.memberId) };
  };
  return { owner, member, ownerId, slips };
}

afterEach(() => {
  delete process.env["CRON_SECRET"];
});

describe("Salary HTTP (CM-316, CM-317)", () => {
  it("is 401 without a Session", async () => {
    expect(
      (await teamRoute(new Request(`${BASE}?month=${MONTH}`))).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("calculates Configured members, lists the rest with the reason, and totals the month", async () => {
    const { owner, member, slips } = await company(["read"], false);
    const response = await calculate(owner.cookie, { month: MONTH });
    expect(response.status).toBe(StatusCodes.OK);
    const result =
      await json<CalculateConstructionHrmsSalariesResponseModel>(response);
    expect(result).toMatchObject({ month: MONTH, calculated: 2, kept: 0 });
    const { view, member: slip } = await slips();
    expect(view.skipped).toEqual([]);
    expect(slip).toMatchObject({
      status: "calculated",
      kind: "regular",
      structureName: "Office staff",
      amountsVisible: true,
      days: { daysInMonth: 30, payable: 30 },
      statutory: { uan: "100200300400" },
    });
    // No attendance: every working day absent, but absent days are not deducted.
    expect(slip.days.absent).toBeGreaterThan(0);
    expect(slip.amounts?.grossEarnings).toBe(3_000_000);
    // PF on Basic ₹15,000: ₹1,800.
    expect(slip.amounts?.pfEmployee).toBe(180_000);
    expect(view.totals).toMatchObject({
      slips: 2,
      grossEarnings: 6_000_000,
      netPayable: 2 * 2_820_000,
    });
    expect(view.myMemberId).not.toBe(member.memberId);
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: owner.workspaceId,
        action: "salary_slip.calculated",
      },
    });
    expect(audit).toBe(2);
  });

  it("refuses a bad or future month with the field", async () => {
    const { owner } = await company(["read"], false);
    for (const month of ["2026-13", "2999-01"]) {
      const response = await calculate(owner.cookie, { month });
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json<{ details: unknown }>(response)).toMatchObject({
        details: { field: "month" },
      });
    }
  });

  it("needs view_all for Team Salary, create to calculate, and hides amounts without financial", async () => {
    const reader = await company(["read"]);
    expect((await team(reader.member.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await calculate(reader.member.cookie, { month: MONTH })).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const viewer = await company(["read", "view_all"]);
    const view = await json<ListConstructionHrmsTeamSalariesResponseModel>(
      await team(viewer.member.cookie),
    );
    expect(view.totals).toBeNull();
    expect(view.can).toMatchObject({ calculate: false, financial: false });
    const ownerSlip = view.items.find(
      (item) => item.memberId === viewer.ownerId,
    );
    const ownSlip = view.items.find(
      (item) => item.memberId === viewer.member.memberId,
    );
    expect(ownerSlip?.amounts).toBeNull();
    expect(ownSlip?.amounts?.grossEarnings).toBe(3_000_000);
  });

  it("approves all or none, never one's own, writes month locks, and refuses a second approval", async () => {
    const { owner, member, slips } = await company([
      "read",
      "view_all",
      "approve",
    ]);
    const { owner: ownerSlip, member: memberSlip } = await slips();

    const own = await approve(member.cookie, [memberSlip]);
    expect(own.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<{ code: string }>(own)).code).toBe("SALARY_OWN_SLIP");

    const ok = await approve(member.cookie, [ownerSlip]);
    expect(ok.status).toBe(StatusCodes.OK);
    const [approved] = (
      await json<{ items: ConstructionHrmsSalarySlipModel[] }>(ok)
    ).items;
    expect(approved).toMatchObject({ status: "approved", hasPayslip: true });

    const again = await approve(owner.cookie, [ownerSlip]);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(again)).code).toBe(
      "SALARY_SLIP_ALREADY_APPROVED",
    );

    const locks = await prisma.constructionHrmsMonthLock.findMany({
      where: { workspaceId: owner.workspaceId },
    });
    expect(locks).toMatchObject([
      { memberId: ownerSlip.memberId, month: MONTH, slipId: ownerSlip.id },
    ]);

    // An approved salary never changes.
    const recalc = await recalculateRoute(
      jsonRequest(`${BASE}/recalculate`, owner.cookie, {
        id: ownerSlip.id,
        expectedUpdatedAt: approved?.updatedAt,
      }),
    );
    expect(recalc.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(recalc)).code).toBe(
      "SALARY_SLIP_NOT_CALCULATED",
    );
    // The Owner may approve their own… here, the member's.
    expect((await approve(owner.cookie, [memberSlip])).status).toBe(
      StatusCodes.OK,
    );
  });

  it("recalculates a Calculated slip with optimistic concurrency", async () => {
    const { owner, slips } = await company();
    const { member: slip } = await slips();
    const body = { id: slip.id, expectedUpdatedAt: slip.updatedAt };
    const first = await recalculateRoute(
      jsonRequest(`${BASE}/recalculate`, owner.cookie, body),
    );
    expect(first.status).toBe(StatusCodes.OK);
    const stale = await recalculateRoute(
      jsonRequest(`${BASE}/recalculate`, owner.cookie, body),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(stale)).code).toBe(
      "SALARY_SLIP_CHANGED",
    );
  });

  it("marks paid only after approval, with mode, date and reference", async () => {
    const { owner, member, slips } = await company(["read"]);
    const { member: slip } = await slips();
    const early = await markPaid(owner.cookie, [slip]);
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(early)).code).toBe(
      "SALARY_NOT_APPROVED",
    );
    const [approved] = (
      await json<{ items: ConstructionHrmsSalarySlipModel[] }>(
        await approve(owner.cookie, [slip]),
      )
    ).items;
    if (approved == null) throw new Error("not approved");
    expect((await markPaid(member.cookie, [approved])).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const bad = await markPaid(owner.cookie, [approved], { mode: "upi" });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<{ details: unknown }>(bad)).toMatchObject({
      details: { field: "mode" },
    });
    const paid = await markPaid(owner.cookie, [approved]);
    expect(paid.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: ConstructionHrmsSalarySlipModel[] }>(paid)).items[0],
    ).toMatchObject({
      status: "paid",
      payment: { mode: "bank", date: "2026-10-01", reference: "NEFT 42" },
    });
  });

  it("serves the payslip PDF once approved, stored once; members see only their own", async () => {
    const { owner, member, slips } = await company(["read"]);
    const { member: slip, owner: ownerSlip } = await slips();
    const early = await payslip(member.cookie, slip.id);
    expect(early.status).toBe(StatusCodes.NOT_FOUND);
    expect((await payslip(owner.cookie, slip.id)).status).toBe(
      StatusCodes.CONFLICT,
    );
    await approve(owner.cookie, [slip, ownerSlip]);

    const first = await payslip(member.cookie, slip.id);
    expect(first.status).toBe(StatusCodes.OK);
    expect(first.headers.get("content-type")).toBe("application/pdf");
    expect(first.headers.get("content-disposition")).toContain(`-${MONTH}.pdf`);
    const bytes = new Uint8Array(await first.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const row = await prisma.constructionHrmsSalarySlip.findUniqueOrThrow({
      where: { id: slip.id },
    });
    expect(row.payslipKey).toMatch(/\/payslips\//);
    expect(row.updatedAt.toISOString()).toBe(
      (
        await json<ConstructionHrmsSalarySlipModel>(
          await detail(owner.cookie, slip.id),
        )
      ).updatedAt,
    );
    const file = await prisma.constructionOrganizationStoredFile.findFirst({
      where: { workspaceId: owner.workspaceId, key: row.payslipKey ?? "" },
    });
    expect(file).toMatchObject({ kind: "payslip" });
    const second = new Uint8Array(
      await (await payslip(owner.cookie, slip.id)).arrayBuffer(),
    );
    expect(second).toEqual(bytes);

    // My Salary shows it; another member's slip is not found.
    const mine = await json<ListConstructionHrmsMySalariesResponseModel>(
      await myRoute(jsonRequest(`${BASE}/my`, member.cookie)),
    );
    expect(mine.items.map((item) => item.id)).toEqual([slip.id]);
    expect(mine.items[0]?.amounts?.netPayable).toBe(slip.amounts?.netPayable);
    expect((await payslip(member.cookie, ownerSlip.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("pays an advance and recovers it on the regular slip", async () => {
    const { owner, member, slips } = await company(["read", "create"]);
    const { member: slip } = await slips();
    const body = {
      memberId: member.memberId,
      amount: 900_000,
      instalments: 3,
      advanceDate: "2026-09-20",
      mode: "cash",
      reason: "Festival",
    };
    // Needs financial too.
    expect(
      (
        await advanceRoute(
          jsonRequest(`${BASE}/calculate-advance`, member.cookie, body),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const paid = await advanceRoute(
      jsonRequest(`${BASE}/calculate-advance`, owner.cookie, body),
    );
    expect(paid.status).toBe(StatusCodes.CREATED);
    const advance = await json<ConstructionHrmsSalarySlipModel>(paid);
    expect(advance).toMatchObject({
      kind: "advance",
      status: "paid",
      advance: { amount: 900_000, instalments: 3, firstRecoveryMonth: MONTH },
    });
    const recalc = await recalculateRoute(
      jsonRequest(`${BASE}/recalculate`, owner.cookie, {
        id: slip.id,
        expectedUpdatedAt: slip.updatedAt,
      }),
    );
    const recalculated = await json<ConstructionHrmsSalarySlipModel>(recalc);
    expect(recalculated.amounts?.advanceRecovered).toBe(300_000);
    expect(recalculated.amounts?.netPayable).toBe(
      (slip.amounts?.netPayable ?? 0) - 300_000,
    );
    const view = await json<ListConstructionHrmsTeamSalariesResponseModel>(
      await team(owner.cookie),
    );
    expect(view.totals?.advancesPaid).toBe(900_000);
  });

  it("hides another Company's salaries", async () => {
    const { slips } = await company();
    const { member: slip } = await slips();
    const other = await ownerWithCompany("Other Builders");
    expect((await detail(other.cookie, slip.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await approve(other.cookie, [slip])).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await payslip(other.cookie, slip.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("downloads the team salary workbook with report or export", async () => {
    const { owner, member } = await company(["read", "view_all"]);
    const response = await reportRoute(
      jsonRequest(`${BASE}/report/team?month=${MONTH}`, owner.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe("PK");
    expect(
      (
        await reportRoute(
          jsonRequest(`${BASE}/report/team?month=${MONTH}`, member.cookie),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("guards the scheduled run with CRON_SECRET", async () => {
    const url = `${BASE}/calculate-bulk/scheduled`;
    expect((await scheduledRoute(new Request(url))).status).toBe(
      StatusCodes.SERVICE_UNAVAILABLE,
    );
    process.env["CRON_SECRET"] = "salary-cron-secret";
    expect(
      (
        await scheduledRoute(
          new Request(url, { headers: { authorization: "Bearer wrong" } }),
        )
      ).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
    const ok = await scheduledRoute(
      new Request(url, {
        headers: { authorization: "Bearer salary-cron-secret" },
      }),
    );
    expect(ok.status).toBe(StatusCodes.OK);
    expect(await json<{ companies: number }>(ok)).toHaveProperty("companies");
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/hrms/salaries",
      "/api/construction/hrms/salaries/my",
      "/api/construction/hrms/salaries/{id}",
      "/api/construction/hrms/salaries/{id}/payslip",
      "/api/construction/hrms/salaries/calculate-bulk",
      "/api/construction/hrms/salaries/recalculate",
      "/api/construction/hrms/salaries/approve",
      "/api/construction/hrms/salaries/mark-paid",
      "/api/construction/hrms/salaries/calculate-advance",
      "/api/construction/hrms/salaries/report/team",
    ])
      expect(document.paths).toHaveProperty([path]);
  });
});
