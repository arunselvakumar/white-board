import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  MySalaries,
  SalarySlipModel,
  TeamSalaries,
} from "@/src/queries/hrms-salary";

/** Fixtures and a mock salary API for the salary stories (CM-317). */

const AT = "2026-11-03T06:00:00.000Z";
const BASE = "/api/construction/hrms/salaries";

export const ME = "0199c6b0-0000-7000-8000-000000000001";
export const PRIYA = "0199c6b0-0000-7000-8000-000000000002";
export const RAVI = "0199c6b0-0000-7000-8000-000000000003";
export const ANAND = "0199c6b0-0000-7000-8000-000000000004";

export function storySlip(
  overrides: Partial<SalarySlipModel> = {},
): SalarySlipModel {
  return {
    id: "0199c6b1-0000-7000-8000-000000000001",
    memberId: PRIYA,
    memberName: "Priya Raman",
    designationName: "Site Engineer",
    month: "2026-10",
    kind: "regular",
    status: "calculated",
    structureName: "Office staff",
    own: false,
    amountsVisible: true,
    days: {
      daysInMonth: 31,
      workingDays: 22,
      present: 20,
      halfDays: 1,
      absent: 0,
      paidLeave: 1,
      unpaidLeave: 0,
      weekOff: 9,
      holidays: 0,
      notEmployed: 0,
      payable: 30.5,
      overtimeHours: 3,
      paidOvertimeHours: 2,
      totalHours: 170.5,
    },
    amounts: {
      baseMonthly: 3_100_000,
      fullMonthGross: 3_100_000,
      notEmployedDeduction: 0,
      absentDeduction: 50_000,
      unpaidLeaveDeduction: 0,
      overtimePay: 50_000,
      grossEarnings: 3_100_000,
      pfEmployee: 180_000,
      esiEmployee: 0,
      professionalTax: 20_000,
      otherDeductions: 0,
      advanceRecovered: 300_000,
      totalDeductions: 500_000,
      netPayable: 2_600_000,
      pfEmployer: 55_050,
      epsEmployer: 124_950,
      esiEmployer: 0,
      components: [
        { name: "Basic", monthly: 1_550_000, earned: 1_525_000 },
        { name: "Special", monthly: 1_550_000, earned: 1_525_000 },
      ],
      otherDeductionLines: [],
      shortfall: null,
    },
    statutory: {
      esiEligible: false,
      esiBasisMonth: "2026-10",
      uan: "100200300400",
      esiIpNumber: null,
    },
    advance: null,
    approvedAt: null,
    paidAt: null,
    payment: null,
    hasPayslip: false,
    updatedAt: AT,
    ...overrides,
  };
}

export const STORY_SLIPS: SalarySlipModel[] = [
  storySlip(),
  storySlip({
    id: "0199c6b1-0000-7000-8000-000000000002",
    memberId: RAVI,
    memberName: "Ravi Kumar",
    designationName: "Store Keeper",
    status: "approved",
    approvedAt: AT,
    hasPayslip: true,
  }),
  storySlip({
    id: "0199c6b1-0000-7000-8000-000000000003",
    memberId: ME,
    memberName: "Arun Selva Kumar",
    designationName: "Project Manager",
    status: "paid",
    approvedAt: AT,
    paidAt: AT,
    payment: { mode: "bank", date: "2026-11-01", reference: "NEFT 42" },
    hasPayslip: true,
    own: true,
  }),
  storySlip({
    id: "0199c6b1-0000-7000-8000-000000000004",
    kind: "advance",
    status: "paid",
    structureName: null,
    advance: {
      amount: 900_000,
      instalments: 3,
      advanceDate: "2026-10-09",
      firstRecoveryMonth: "2026-10",
      reason: "Festival",
      recovered: 300_000,
    },
    payment: { mode: "cash", date: "2026-10-09", reference: null },
  }),
];

export function storyTeam(overrides: Partial<TeamSalaries> = {}): TeamSalaries {
  return {
    month: "2026-10",
    items: STORY_SLIPS,
    skipped: [
      {
        memberId: ANAND,
        name: "Anand Pillai",
        designationName: "Supervisor",
        reason: "not_configured",
        message: "Salary not set in Employee Management.",
      },
    ],
    totals: {
      slips: 3,
      grossEarnings: 9_300_000,
      deductions: 1_500_000,
      netPayable: 7_800_000,
      employerContributions: 540_000,
      advancesPaid: 900_000,
    },
    can: {
      calculate: true,
      approve: true,
      markPaid: true,
      payAdvance: true,
      report: true,
      financial: true,
      viewAll: true,
    },
    myMemberId: ME,
    ...overrides,
  };
}

/** The same slips without amounts, as a member without Financial sees them. */
export function withoutAmounts(slips: SalarySlipModel[]): SalarySlipModel[] {
  return slips.map((slip) =>
    slip.own
      ? slip
      : {
          ...slip,
          amountsVisible: false,
          amounts: null,
          advance:
            slip.advance == null
              ? null
              : { ...slip.advance, amount: null, recovered: null },
        },
  );
}

export type SalaryApiState = {
  /** Null answers 403, as for a member without View All. */
  team?: TeamSalaries | null;
  mine?: MySalaries;
  write?: (call: ApiCall) => Response | undefined;
};

export function serveSalary(state: SalaryApiState = {}) {
  const calls: ApiCall[] = [];
  const api = mockApi((call) => {
    calls.push(call);
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "POST") {
      const answered = state.write?.(call);
      if (answered != null) return answered;
      if (path === `${BASE}/calculate-bulk`)
        return Response.json({
          month: "2026-10",
          calculated: 2,
          kept: 1,
          skipped: [],
        });
      if (path === `${BASE}/approve` || path === `${BASE}/mark-paid`)
        return Response.json({ items: [] });
      if (path === `${BASE}/calculate-advance`)
        return Response.json(STORY_SLIPS[3], { status: 201 });
      if (path === `${BASE}/recalculate`) return Response.json(STORY_SLIPS[0]);
      return undefined;
    }
    if (path === BASE) {
      const team = state.team === undefined ? storyTeam() : state.team;
      return team == null
        ? Response.json(
            { code: "PERMISSION_DENIED", message: "No." },
            { status: 403 },
          )
        : Response.json({
            ...team,
            month: new URLSearchParams(call.path.split("?")[1]).get("month"),
          });
    }
    if (path === `${BASE}/my`)
      return Response.json(
        state.mine ?? {
          member: {
            memberId: ME,
            name: "Arun Selva Kumar",
            designationName: "Project Manager",
          },
          items: [],
        },
      );
    return undefined;
  });
  return { calls, restore: api.restore };
}
