import { beforeEach, describe, expect, it } from "vitest";

import type { Flag } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  createSalaryStructure,
  type SalaryStructureInput,
} from "../domain/salary-structure";
import type { EsiRate, PfRate } from "../domain/statutory";
import { accessFor, FakeHrmsSettingsStore } from "./hrms-fakes";
import { InMemoryStatutoryRates } from "./in-memory-statutory-rates";
import {
  employee,
  fakeCompany,
  FakeAttendanceDaySource,
  FakeEmployeeDirectory,
  FakeLeaveDaySource,
  FakePayslipFiles,
  FakePayslipRenderer,
  FakeSalaryConfigSource,
  FakeSalaryRunStore,
  FakeShiftResolver,
  FakeWorkCalendar,
} from "./salary-run-fakes";
import { SalaryRunHandlers } from "./salary-run-handlers";

const PF: PfRate = {
  effectiveFrom: "2014-09-01",
  wageCeiling: 1_500_000,
  employeePercent: "12.00",
  employerPercent: "12.00",
  epsPercent: "8.33",
  source: "test",
};

const ESI: EsiRate = {
  effectiveFrom: "2019-07-01",
  wageCeiling: 2_100_000,
  pwdWageCeiling: 2_500_000,
  employeePercent: "0.75",
  employerPercent: "3.25",
  source: "test",
};

/** Basic 50% (PF wage) and HRA the balance; PF and ESI on, no PT. */
function structure(overrides: Partial<SalaryStructureInput> = {}) {
  return createSalaryStructure({
    name: "Office staff",
    description: null,
    components: [
      {
        id: "basic",
        name: "Basic",
        basis: "percent_of_base",
        amount: null,
        percent: "50",
        isBalancing: false,
        countsForPfWage: true,
      },
      {
        id: "hra",
        name: "HRA",
        basis: "percent_of_base",
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
    esi: { applicable: true, employeePercent: null },
    pt: { applicable: false, monthlyAmount: null },
    deductAbsentDays: true,
    deductUnpaidLeave: true,
    otherDeductions: [],
    isActive: true,
    ...overrides,
  });
}

const OWNER = accessFor();
const WS = "company-1";

/** A Team Member's access with these `hrms.salaries` flags. */
function memberAccess(flags: Flag[], userId = "user-m9") {
  return accessFor({ "hrms.salaries": flags }, WS, userId);
}

function codeOf(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  throw error;
}

async function rejectsWith(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return codeOf(error);
  }
  throw new Error("expected a rejection");
}

let store: FakeSalaryRunStore;
let configs: FakeSalaryConfigSource;
let calendar: FakeWorkCalendar;
let attendance: FakeAttendanceDaySource;
let leave: FakeLeaveDaySource;
let shifts: FakeShiftResolver;
let files: FakePayslipFiles;
let renderer: FakePayslipRenderer;
let directory: FakeEmployeeDirectory;
let handlers: SalaryRunHandlers;

beforeEach(() => {
  store = new FakeSalaryRunStore();
  store.todayValue = "2026-11-05";
  configs = new FakeSalaryConfigSource();
  calendar = new FakeWorkCalendar();
  attendance = new FakeAttendanceDaySource(calendar);
  leave = new FakeLeaveDaySource();
  shifts = new FakeShiftResolver();
  files = new FakePayslipFiles();
  renderer = new FakePayslipRenderer();
  directory = new FakeEmployeeDirectory([
    employee("a", { name: "Asha" }),
    employee("b", { name: "Bala" }),
    employee("c", { name: "Chitra", active: false }),
    employee("d", { name: "Dev" }),
    employee("m9", { name: "Mani" }),
    employee("owner", { name: "Owner", userId: "user-1", isOwner: true }),
  ]);
  handlers = new SalaryRunHandlers(store, {
    employees: directory,
    settings: new FakeHrmsSettingsStore(),
    calendar,
    shifts,
    attendanceDays: attendance,
    leaveDays: leave,
    statutoryRates: new InMemoryStatutoryRates({
      pf: [PF],
      esi: [ESI],
      pt: [],
    }),
    configs,
    company: fakeCompany,
    payslips: files,
    renderer,
  });
});

function configure(memberId: string, base: number, from = "2026-01-01") {
  configs.set(memberId, structure(), base, from);
  const start = store.starts.get(memberId);
  if (start == null || from < start) store.starts.set(memberId, from);
}

async function slipOf(memberId: string, month = "2026-10") {
  const slips = await store.listMonth(WS, month);
  const slip = slips.find(
    (item) => item.memberId === memberId && item.kind === "regular",
  );
  if (slip == null) throw new Error(`no slip for ${memberId}`);
  return slip;
}

describe("calculate (CM-316)", () => {
  it("calculates Configured members and lists the others with the reason", async () => {
    configure("a", 3_100_000);
    configure("c", 3_100_000);
    configs.set("d", structure(), 3_100_000, "2026-11-15");
    store.starts.set("d", "2026-11-15");
    const result = await handlers.calculate(OWNER, { month: "2026-10" });
    expect(result.calculated).toBe(1);
    expect(
      Object.fromEntries(
        result.skipped.map((item) => [item.memberId, item.reason]),
      ),
    ).toEqual({
      b: "not_configured",
      c: "not_joined",
      d: "starts_later",
      m9: "not_configured",
      owner: "not_configured",
    });
    const slip = await slipOf("a");
    expect(slip.days).toMatchObject({
      daysInMonth: 31,
      workingDays: 22,
      present: 22,
      weekOff: 9,
      payable: 31,
      totalHours: 176,
    });
    expect(slip.money.grossEarnings).toBe(3_100_000);
    // PF on Basic ₹15,500 capped at ₹15,000: ₹1,800; no ESI above ₹21,000.
    expect(slip.money.pfEmployee).toBe(180_000);
    expect(slip.money.esiEmployee).toBe(0);
    expect(slip.money.netPayable).toBe(2_920_000);
    expect(store.audits.map((item) => item.action)).toEqual([
      "salary_slip.calculated",
    ]);
  });

  it("counts half days, absent days, paid and unpaid leave, holidays and week offs", async () => {
    configure("a", 3_100_000);
    calendar.holidays.add("2026-10-02");
    attendance.set("a", "2026-10-05", { status: "absent", workedHours: 0 });
    attendance.set("a", "2026-10-06", { status: "half_day", workedHours: 4 });
    attendance.set("a", "2026-10-07", { status: "on_leave", workedHours: 0 });
    attendance.set("a", "2026-10-08", { status: "on_leave", workedHours: 0 });
    leave.days.push(
      {
        memberId: "a",
        date: "2026-10-07",
        requestId: "r-1",
        leaveTypeId: "cl",
        leaveTypeName: "Casual Leave",
        isPaid: true,
        session: "full",
        days: 1,
      },
      {
        memberId: "a",
        date: "2026-10-08",
        requestId: "r-2",
        leaveTypeId: "lop",
        leaveTypeName: "Loss of Pay",
        isPaid: false,
        session: "full",
        days: 1,
      },
    );
    await handlers.calculate(OWNER, { month: "2026-10" });
    const slip = await slipOf("a");
    expect(slip.days).toMatchObject({
      workingDays: 21,
      present: 17,
      halfDays: 1,
      absent: 1,
      paidLeave: 1,
      unpaidLeave: 1,
      weekOff: 9,
      holidays: 1,
      // 1 absent + ½ + 1 unpaid off 31.
      payable: 28.5,
    });
    expect(slip.money.grossEarnings).toBe(2_850_000);
    expect(slip.money.absentDeduction).toBe(150_000);
    expect(slip.money.unpaidLeaveDeduction).toBe(100_000);
  });

  it("pays overtime only on days whose shift allows it", async () => {
    configure("a", 3_100_000);
    attendance.set("a", "2026-10-05", { workedHours: 10, overtimeHours: 2 });
    attendance.set("a", "2026-10-06", { workedHours: 9, overtimeHours: 1 });
    shifts.overtimeAllowed.add("2026-10-05");
    await handlers.calculate(OWNER, { month: "2026-10" });
    const slip = await slipOf("a");
    expect(slip.days.overtimeHours).toBe(3);
    expect(slip.details?.paidOvertimeHours).toBe(2);
    // 2 × ₹31,000 ÷ 31 ÷ 8 h × 2 h = ₹500.
    expect(slip.money.overtimePay).toBe(50_000);
  });

  it("does not pay a mid-month joiner for the days before their salary starts", async () => {
    configure("a", 3_100_000, "2026-10-12");
    await handlers.calculate(OWNER, { month: "2026-10" });
    const slip = await slipOf("a");
    expect(slip.days.payable).toBe(20);
    expect(slip.details?.notEmployedDays).toBe(11);
    expect(slip.money.grossEarnings).toBe(2_000_000);
    expect(slip.money.absentDeduction).toBe(0);
  });

  it("refuses a month that has not started", async () => {
    expect(
      await rejectsWith(handlers.calculate(OWNER, { month: "2026-12" })),
    ).toBe("SALARY_MONTH_IN_FUTURE");
    expect(
      await rejectsWith(handlers.calculate(OWNER, { month: "2026-13" })),
    ).toBe("SALARY_MONTH_INVALID");
  });

  it("leaves the current month's later days uncounted, so they are paid", async () => {
    configure("a", 3_100_000);
    store.todayValue = "2026-10-15";
    attendance.set("a", "2026-10-20", { status: "absent", workedHours: 0 });
    await handlers.calculate(OWNER, { month: "2026-10" });
    expect((await slipOf("a")).days.payable).toBe(31);
  });

  it("needs create", async () => {
    expect(
      await rejectsWith(
        handlers.calculate(memberAccess(["read", "view_all"]), {
          month: "2026-10",
        }),
      ),
    ).toBe("PERMISSION_DENIED");
  });
});

describe("recalculate and the state machine", () => {
  beforeEach(async () => {
    configure("a", 3_100_000);
    configure("b", 2_000_000);
    await handlers.calculate(OWNER, { month: "2026-10" });
  });

  it("replaces a Calculated slip in place", async () => {
    const before = await slipOf("a");
    attendance.set("a", "2026-10-05", { status: "absent", workedHours: 0 });
    const after = await handlers.recalculate(OWNER, {
      id: before.id,
      expectedUpdatedAt: before.updatedAt,
    });
    expect(after.slip.id).toBe(before.id);
    expect(after.slip.days.absent).toBe(1);
    expect(
      await rejectsWith(
        handlers.recalculate(OWNER, {
          id: before.id,
          expectedUpdatedAt: before.updatedAt,
        }),
      ),
    ).toBe("SALARY_SLIP_CHANGED");
  });

  it("approves, locks the month, and never changes the slip after", async () => {
    const slip = await slipOf("a");
    await handlers.approve(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
    });
    expect(store.locks).toEqual([
      { memberId: "a", month: "2026-10", slipId: slip.id },
    ]);
    const approved = await slipOf("a");
    expect(approved.status).toBe("approved");
    expect(
      await rejectsWith(
        handlers.recalculate(OWNER, {
          id: slip.id,
          expectedUpdatedAt: approved.updatedAt,
        }),
      ),
    ).toBe("SALARY_SLIP_NOT_CALCULATED");
    // A bulk run keeps it.
    attendance.set("a", "2026-10-05", { status: "absent", workedHours: 0 });
    const result = await handlers.calculate(OWNER, { month: "2026-10" });
    expect(result.kept).toBe(1);
    expect((await slipOf("a")).days.absent).toBe(0);
    // Approving again is a conflict.
    expect(
      await rejectsWith(
        handlers.approve(OWNER, {
          slips: [{ id: slip.id, expectedUpdatedAt: approved.updatedAt }],
        }),
      ),
    ).toBe("SALARY_SLIP_ALREADY_APPROVED");
  });

  it("refuses approving one's own salary, except the Owner's", async () => {
    configure("m9", 2_000_000);
    configure("owner", 5_000_000);
    await handlers.calculate(OWNER, { month: "2026-10" });
    const own = await slipOf("m9");
    const approver = memberAccess(["read", "view_all", "approve"]);
    expect(
      await rejectsWith(
        handlers.approve(approver, {
          slips: [{ id: own.id, expectedUpdatedAt: own.updatedAt }],
        }),
      ),
    ).toBe("SALARY_OWN_SLIP");
    const ownerSlip = await slipOf("owner");
    const [approved] = await handlers.approve(OWNER, {
      slips: [{ id: ownerSlip.id, expectedUpdatedAt: ownerSlip.updatedAt }],
    });
    expect(approved?.slip.status).toBe("approved");
    expect(
      await rejectsWith(
        handlers.approve(memberAccess(["read", "view_all"]), {
          slips: [{ id: own.id, expectedUpdatedAt: own.updatedAt }],
        }),
      ),
    ).toBe("PERMISSION_DENIED");
  });

  it("marks paid only after approval, with mode, date and reference", async () => {
    const slip = await slipOf("b");
    const payment = {
      mode: "bank",
      paymentDate: "2026-11-01",
      reference: "UTR1",
    };
    expect(
      await rejectsWith(
        handlers.markPaid(OWNER, {
          slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
          ...payment,
        }),
      ),
    ).toBe("SALARY_NOT_APPROVED");
    const [approved] = await handlers.approve(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
    });
    if (approved == null) throw new Error("not approved");
    const [paid] = await handlers.markPaid(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: approved.slip.updatedAt }],
      ...payment,
    });
    expect(paid?.slip.status).toBe("paid");
    expect(paid?.slip.payment).toEqual({
      mode: "bank",
      date: "2026-11-01",
      reference: "UTR1",
    });
    expect(
      await rejectsWith(
        handlers.markPaid(OWNER, {
          slips: [
            {
              id: slip.id,
              expectedUpdatedAt: paid?.slip.updatedAt ?? new Date(),
            },
          ],
          ...payment,
        }),
      ),
    ).toBe("SALARY_ALREADY_PAID");
  });
});

describe("advance salary (ADR CM-0012 §15)", () => {
  it("is recovered one instalment a month, and a short month's cut stays outstanding", async () => {
    configure("a", 3_100_000);
    store.todayValue = "2026-10-10";
    const advance = await handlers.payAdvance(OWNER, {
      memberId: "a",
      amount: 900_000,
      instalments: 3,
      advanceDate: "2026-10-09",
      mode: "cash",
    });
    expect(advance.slip).toMatchObject({ kind: "advance", status: "paid" });
    expect(advance.slip.money.netPayable).toBe(900_000);

    const run = async (month: string, today: string) => {
      store.todayValue = today;
      await handlers.calculate(OWNER, { month });
      const slip = await slipOf("a", month);
      await handlers.approve(OWNER, {
        slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
      });
      return slip;
    };

    expect((await run("2026-10", "2026-11-01")).money.advanceRecovered).toBe(
      300_000,
    );
    expect((await run("2026-11", "2026-12-01")).money.advanceRecovered).toBe(
      300_000,
    );
    for (const date of [
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-07",
      "2026-12-08",
      "2026-12-09",
      "2026-12-10",
      "2026-12-11",
      "2026-12-14",
      "2026-12-15",
      "2026-12-16",
      "2026-12-17",
      "2026-12-18",
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
      "2026-12-24",
      "2026-12-25",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ])
      attendance.set("a", date, { status: "absent", workedHours: 0 });
    // Absent all month still pays the 8 week offs; a ₹11,000 loan
    // deduction then leaves nothing for the advance.
    configs.set(
      "a",
      structure({ otherDeductions: [{ name: "Loan", amount: 1_100_000 }] }),
      3_100_000,
    );
    const december = await run("2026-12", "2027-01-02");
    expect(december.money.advanceRecovered).toBeLessThan(300_000);
    expect(december.details?.shortfall?.advance).toBeGreaterThan(0);
    const cut = 300_000 - december.money.advanceRecovered;

    configs.set("a", structure(), 3_100_000);
    expect((await run("2027-01", "2027-02-01")).money.advanceRecovered).toBe(
      Math.min(300_000, cut),
    );
    const outstanding =
      900_000 -
      600_000 -
      december.money.advanceRecovered -
      Math.min(300_000, cut);
    expect((await run("2027-02", "2027-03-01")).money.advanceRecovered).toBe(
      Math.min(300_000, outstanding),
    );
    const paidAdvance = (await store.find(WS, advance.slip.id))?.advance;
    expect(paidAdvance?.recovered).toBe(900_000);
    // Recovered in full: nothing more.
    expect((await run("2027-03", "2027-04-01")).money.advanceRecovered).toBe(0);
  });

  it("starts recovery next month when this month is already approved", async () => {
    configure("a", 3_100_000);
    await handlers.calculate(OWNER, { month: "2026-10" });
    const slip = await slipOf("a");
    await handlers.approve(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
    });
    store.todayValue = "2026-10-31";
    await handlers.payAdvance(OWNER, {
      memberId: "a",
      amount: 100_000,
      advanceDate: "2026-10-31",
      mode: "bank",
      reference: "NEFT",
    });
    expect(store.advances[0]?.firstRecoveryMonth).toBe("2026-11");
  });

  it("needs create and financial, a Configured member, and not oneself", async () => {
    configure("a", 3_100_000);
    store.todayValue = "2026-10-10";
    const input = {
      memberId: "a",
      amount: 100_000,
      advanceDate: "2026-10-10",
      mode: "cash",
    };
    expect(
      await rejectsWith(
        handlers.payAdvance(memberAccess(["read", "create"]), input),
      ),
    ).toBe("PERMISSION_DENIED");
    expect(
      await rejectsWith(
        handlers.payAdvance(OWNER, { ...input, memberId: "b" }),
      ),
    ).toBe("SALARY_NOT_CONFIGURED");
    configure("m9", 2_000_000);
    expect(
      await rejectsWith(
        handlers.payAdvance(memberAccess(["read", "create", "financial"]), {
          ...input,
          memberId: "m9",
        }),
      ),
    ).toBe("SALARY_OWN_ADVANCE");
  });
});

describe("ESI for the contribution period (ADR CM-0008)", () => {
  it("keeps the period's first slip's eligibility after a raise, and decides afresh in April", async () => {
    configure("a", 2_000_000);
    await handlers.calculate(OWNER, { month: "2026-10" });
    expect((await slipOf("a")).money.esiEmployee).toBe(15_000);

    configs.set("a", structure(), 2_500_000, "2026-11-01");
    store.todayValue = "2026-12-01";
    await handlers.calculate(OWNER, { month: "2026-11" });
    const november = await slipOf("a", "2026-11");
    // 0.75% of ₹25,000 = ₹187.50, up to ₹188.
    expect(november.money.esiEmployee).toBe(18_800);
    expect(november.details?.esi).toEqual({
      basisMonth: "2026-10",
      basisGross: 2_000_000,
    });

    store.todayValue = "2027-05-01";
    await handlers.calculate(OWNER, { month: "2027-04" });
    expect((await slipOf("a", "2027-04")).money.esiEmployee).toBe(0);
  });
});

describe("reads, amounts and the payslip", () => {
  beforeEach(async () => {
    configure("a", 3_100_000);
    configure("m9", 2_000_000);
    await handlers.calculate(OWNER, { month: "2026-10" });
  });

  it("Team Salary needs view_all; amounts of others need financial", async () => {
    expect(
      await rejectsWith(handlers.team(memberAccess(["read"]), "2026-10")),
    ).toBe("PERMISSION_DENIED");
    const view = await handlers.team(
      memberAccess(["read", "view_all"]),
      "2026-10",
    );
    expect(view.totals).toBeNull();
    const byMember = new Map(
      view.records.map((record) => [record.member.memberId, record]),
    );
    expect(byMember.get("a")?.amountsVisible).toBe(false);
    expect(byMember.get("m9")?.amountsVisible).toBe(true);
    expect(view.skipped.map((item) => item.memberId).sort()).toEqual([
      "b",
      "c",
      "d",
      "owner",
    ]);
    const owner = await handlers.team(OWNER, "2026-10");
    expect(owner.totals).toMatchObject({ slips: 2 });
    expect(owner.can).toMatchObject({ calculate: true, approve: true });
  });

  it("My Salary shows one's own slips once approved", async () => {
    const access = memberAccess(["read"]);
    expect((await handlers.mine(access)).records).toEqual([]);
    const slip = await slipOf("m9");
    expect(await rejectsWith(handlers.detail(access, slip.id))).toBe(
      "SALARY_SLIP_NOT_FOUND",
    );
    await handlers.approve(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
    });
    const mine = await handlers.mine(access);
    expect(mine.records.map((record) => record.slip.id)).toEqual([slip.id]);
    expect(mine.records[0]?.amountsVisible).toBe(true);
    const other = await slipOf("a");
    expect(await rejectsWith(handlers.detail(access, other.id))).toBe(
      "SALARY_SLIP_NOT_FOUND",
    );
  });

  it("prints the payslip once approved, stores it once, and serves the stored one after", async () => {
    const slip = await slipOf("a");
    expect(await rejectsWith(handlers.payslip(OWNER, slip.id))).toBe(
      "SALARY_NOT_APPROVED",
    );
    await handlers.approve(OWNER, {
      slips: [{ id: slip.id, expectedUpdatedAt: slip.updatedAt }],
    });
    const first = await handlers.payslip(OWNER, slip.id);
    expect(first.fileName).toBe("payslip-asha-2026-10.pdf");
    // The Prisma store points the slip at the stored file; mirror that.
    const stored = store.slips.get(slip.id);
    if (stored != null)
      store.slips.set(slip.id, {
        ...stored,
        payslipKey: files.keys.get(slip.id) ?? null,
      });
    const second = await handlers.payslip(OWNER, slip.id);
    expect(second.bytes).toEqual(first.bytes);
    expect(renderer.rendered).toHaveLength(1);
    const document = renderer.rendered[0];
    expect(document?.company).toBe("Sri Ganesh Constructions");
    expect(document?.member).toContainEqual({
      label: "UAN",
      value: "100200300400",
    });
    expect(document?.netPayable).toBe(slip.money.netPayable);
    // Others' payslips need financial.
    expect(
      await rejectsWith(
        handlers.payslip(memberAccess(["read", "view_all"]), slip.id),
      ),
    ).toBe("PERMISSION_DENIED");
  });

  it("has no payslip for an advance", async () => {
    store.todayValue = "2026-10-10";
    const advance = await handlers.payAdvance(OWNER, {
      memberId: "a",
      amount: 50_000,
      advanceDate: "2026-10-10",
      mode: "cash",
    });
    expect(await rejectsWith(handlers.payslip(OWNER, advance.slip.id))).toBe(
      "PAYSLIP_NOT_AVAILABLE",
    );
  });
});

describe("automatic calculation", () => {
  it("calculates last month once the salary day has come, once", async () => {
    configure("a", 3_100_000);
    store.autoCompanies = [{ workspaceId: WS, day: 5 }];
    store.todayValue = "2026-11-04";
    expect(await handlers.autoCalculateAll()).toEqual({
      companies: 1,
      calculated: 0,
    });
    store.todayValue = "2026-11-05";
    expect(await handlers.autoCalculateAll()).toEqual({
      companies: 1,
      calculated: 1,
    });
    expect((await slipOf("a")).status).toBe("calculated");
    expect(store.audits.at(-1)?.by).toBe("system");
    store.todayValue = "2026-11-06";
    expect((await handlers.autoCalculateAll()).calculated).toBe(0);
  });
});
