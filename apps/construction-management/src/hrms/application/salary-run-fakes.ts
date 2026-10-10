import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";

import {
  datesOf,
  daysInMonth,
  monthKeyOf,
  type MonthKey,
} from "../domain/calendar";
import type { PayslipDocument } from "../domain/payslip";
import {
  firstRecoveryMonth,
  salarySlipChanged,
  type SalaryAdvanceTerms,
  type SalaryPayment,
} from "../domain/salary-slip";
import type { SalaryStructure } from "../domain/salary-structure";
import type {
  SalaryConfigSource,
  StoredEmployeeSalaryConfig,
} from "./employee-salary-handlers";
import type {
  AttendanceDay,
  AttendanceDaySource,
  EmployeeDirectory,
  HrmsEmployee,
} from "./ports";
import type {
  AdvanceDueSource,
  CalculatedSlipWrite,
  PayslipFiles,
  PayslipRenderer,
  SalaryCompanyReader,
  SalaryMonthTotals,
  SalaryRunStore,
  SlipVersion,
  StoredSalarySlip,
} from "./salary-run-ports";

/**
 * In-memory stand-ins for the salary run's ports (CM-316), for handler
 * tests without a database. They keep the same guards as the Prisma store
 * (stale `updatedAt`, status checks, month locks).
 */

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence)}`;
}

type FakeAdvance = {
  id: string;
  memberId: string;
  slipId: string;
  amount: number;
  instalments: number;
  advanceDate: CalendarDate;
  firstRecoveryMonth: MonthKey;
  reason: string | null;
};

export class FakeSalaryRunStore implements SalaryRunStore {
  readonly slips = new Map<string, StoredSalarySlip>();
  readonly advances: FakeAdvance[] = [];
  readonly locks: { memberId: string; month: MonthKey; slipId: string }[] = [];
  readonly audits: { action: string; entityId: string; by: string }[] = [];
  readonly runs = new Set<string>();
  readonly starts = new Map<string, CalendarDate>();
  autoCompanies: { workspaceId: string; day: number }[] = [];
  todayValue: CalendarDate = "2026-10-10";
  private tick = 0;

  private now(): Date {
    this.tick += 1;
    return new Date(Date.UTC(2026, 9, 10, 0, 0, this.tick));
  }

  private withAdvance(slip: StoredSalarySlip): StoredSalarySlip {
    if (slip.kind !== "advance") return slip;
    const advance = this.advances.find((item) => item.slipId === slip.id);
    if (advance == null) return slip;
    const recovered = [...this.slips.values()]
      .filter((item) => item.status !== "calculated")
      .flatMap((item) => item.recoveries)
      .filter((item) => item.advanceId === advance.id)
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      ...slip,
      advance: {
        id: advance.id,
        amount: advance.amount,
        instalments: advance.instalments,
        advanceDate: advance.advanceDate,
        firstRecoveryMonth: advance.firstRecoveryMonth,
        reason: advance.reason,
        recovered,
      },
    };
  }

  listMonth(_workspaceId: string, month: MonthKey) {
    return Promise.resolve(
      [...this.slips.values()]
        .filter((slip) => slip.month === month)
        .map((slip) => this.withAdvance(slip)),
    );
  }

  listMember(_workspaceId: string, memberId: string) {
    return Promise.resolve(
      [...this.slips.values()]
        .filter((slip) => slip.memberId === memberId)
        .sort((a, b) => b.month.localeCompare(a.month))
        .map((slip) => this.withAdvance(slip)),
    );
  }

  find(_workspaceId: string, id: string) {
    const slip = this.slips.get(id);
    return Promise.resolve(slip == null ? null : this.withAdvance(slip));
  }

  async findMany(workspaceId: string, ids: readonly string[]) {
    const result = new Map<string, StoredSalarySlip>();
    for (const id of ids) {
      const slip = await this.find(workspaceId, id);
      if (slip != null) result.set(id, slip);
    }
    return result;
  }

  totals(_workspaceId: string, month: MonthKey): Promise<SalaryMonthTotals> {
    const slips = [...this.slips.values()].filter(
      (slip) => slip.month === month,
    );
    const regular = slips.filter((slip) => slip.kind === "regular");
    const sum = (pick: (slip: StoredSalarySlip) => number) =>
      regular.reduce((total, slip) => total + pick(slip), 0);
    return Promise.resolve({
      slips: regular.length,
      grossEarnings: sum((slip) => slip.money.grossEarnings),
      deductions: sum(
        (slip) =>
          slip.money.pfEmployee +
          slip.money.esiEmployee +
          slip.money.professionalTax +
          slip.money.otherDeductions +
          slip.money.advanceRecovered,
      ),
      netPayable: sum((slip) => slip.money.netPayable),
      employerContributions: sum(
        (slip) =>
          slip.money.pfEmployer +
          slip.money.epsEmployer +
          slip.money.esiEmployer,
      ),
      advancesPaid: slips
        .filter((slip) => slip.kind === "advance")
        .reduce((total, slip) => total + slip.money.netPayable, 0),
    });
  }

  runExists(_workspaceId: string, month: MonthKey) {
    return Promise.resolve(this.runs.has(month));
  }

  periodFirstSlips(
    _workspaceId: string,
    memberIds: readonly string[],
    from: MonthKey,
    before: MonthKey,
  ) {
    const result = new Map<
      string,
      { month: MonthKey; fullMonthGross: number }
    >();
    const slips = [...this.slips.values()]
      .filter(
        (slip) =>
          slip.kind === "regular" &&
          memberIds.includes(slip.memberId) &&
          slip.month >= from &&
          slip.month < before,
      )
      .sort((a, b) => a.month.localeCompare(b.month));
    for (const slip of slips)
      if (!result.has(slip.memberId))
        result.set(slip.memberId, {
          month: slip.month,
          fullMonthGross:
            slip.details?.fullMonthGross ??
            slip.components.reduce((sum, line) => sum + line.monthly, 0),
        });
    return Promise.resolve(result);
  }

  advancesDue(
    _workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ) {
    const result = new Map<string, AdvanceDueSource[]>();
    for (const advance of this.advances) {
      if (!memberIds.includes(advance.memberId)) continue;
      if (advance.firstRecoveryMonth > month) continue;
      const recoveredBefore = [...this.slips.values()]
        .filter((slip) => slip.month < month)
        .flatMap((slip) => slip.recoveries)
        .filter((item) => item.advanceId === advance.id)
        .reduce((sum, item) => sum + item.amount, 0);
      if (recoveredBefore >= advance.amount) continue;
      const list = result.get(advance.memberId) ?? [];
      list.push({
        advance: {
          id: advance.id,
          amount: advance.amount,
          instalments: advance.instalments,
          firstRecoveryMonth: advance.firstRecoveryMonth,
        },
        recoveredBefore,
      });
      result.set(advance.memberId, list);
    }
    return Promise.resolve(result);
  }

  salaryStarts(_workspaceId: string, memberIds: readonly string[]) {
    return Promise.resolve(
      new Map(
        [...this.starts].filter(([memberId]) => memberIds.includes(memberId)),
      ),
    );
  }

  saveCalculated(input: {
    workspaceId: string;
    month: MonthKey;
    writes: readonly CalculatedSlipWrite[];
    by: string;
    now: Date;
  }): Promise<string[]> {
    for (const write of input.writes) {
      if (write.replaces == null) continue;
      const current = this.slips.get(write.replaces.id);
      if (
        current?.status !== "calculated" ||
        current.updatedAt.getTime() !== write.replaces.updatedAt.getTime()
      )
        return Promise.reject(salarySlipChanged([write.replaces.id]));
    }
    this.runs.add(input.month);
    const ids: string[] = [];
    for (const write of input.writes) {
      const id = write.replaces?.id ?? nextId("slip");
      const before = this.slips.get(id);
      const now = this.now();
      this.slips.set(id, {
        id,
        runId: `run-${input.month}`,
        memberId: write.memberId,
        month: input.month,
        kind: "regular",
        status: "calculated",
        structureId: write.structureId,
        days: write.days,
        money: write.money,
        components: write.components,
        statutorySnapshot: write.statutorySnapshot,
        details: (write.statutorySnapshot["slip"] ??
          null) as StoredSalarySlip["details"],
        approvedBy: null,
        approvedAt: null,
        paidBy: null,
        paidAt: null,
        payment: null,
        payslipKey: null,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
        recoveries: write.recoveries,
        advance: null,
      });
      this.audits.push({
        action:
          write.replaces == null
            ? "salary_slip.calculated"
            : "salary_slip.recalculated",
        entityId: id,
        by: input.by,
      });
      ids.push(id);
    }
    return Promise.resolve(ids);
  }

  private guard(item: SlipVersion, status: "calculated" | "approved") {
    const slip = this.slips.get(item.id);
    if (slip == null) throw notFound("SALARY_SLIP_NOT_FOUND", "Not found.");
    if (slip.status !== status)
      throw conflict(
        status === "calculated"
          ? "SALARY_SLIP_ALREADY_APPROVED"
          : slip.status === "paid"
            ? "SALARY_ALREADY_PAID"
            : "SALARY_NOT_APPROVED",
        "Refused.",
      );
    if (slip.updatedAt.getTime() !== item.expectedUpdatedAt.getTime())
      throw salarySlipChanged([item.id]);
    return slip;
  }

  approve(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    by: string;
    now: Date;
  }): Promise<void> {
    return Promise.resolve().then(() => {
      const slips = input.items.map((item) => this.guard(item, "calculated"));
      for (const slip of slips) {
        this.slips.set(slip.id, {
          ...slip,
          status: "approved",
          approvedBy: input.by,
          approvedAt: input.now,
          updatedAt: this.now(),
        });
        if (
          !this.locks.some(
            (lock) =>
              lock.memberId === slip.memberId && lock.month === slip.month,
          )
        )
          this.locks.push({
            memberId: slip.memberId,
            month: slip.month,
            slipId: slip.id,
          });
        this.audits.push({
          action: "salary_slip.approved",
          entityId: slip.id,
          by: input.by,
        });
      }
    });
  }

  markPaid(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    payment: SalaryPayment;
    by: string;
    now: Date;
  }): Promise<void> {
    return Promise.resolve().then(() => {
      const slips = input.items.map((item) => this.guard(item, "approved"));
      for (const slip of slips) {
        this.slips.set(slip.id, {
          ...slip,
          status: "paid",
          paidBy: input.by,
          paidAt: input.now,
          payment: input.payment,
          updatedAt: this.now(),
        });
        this.audits.push({
          action: "salary_slip.paid",
          entityId: slip.id,
          by: input.by,
        });
      }
    });
  }

  payAdvance(input: {
    workspaceId: string;
    memberId: string;
    terms: SalaryAdvanceTerms;
    by: string;
    now: Date;
  }): Promise<string> {
    const { terms } = input;
    const month = monthKeyOf(terms.advanceDate);
    const regular = [...this.slips.values()].find(
      (slip) =>
        slip.kind === "regular" &&
        slip.memberId === input.memberId &&
        slip.month === month,
    );
    const slipId = nextId("advance-slip");
    const now = this.now();
    this.slips.set(slipId, {
      id: slipId,
      runId: null,
      memberId: input.memberId,
      month,
      kind: "advance",
      status: "paid",
      structureId: null,
      days: {
        daysInMonth: daysInMonth(month),
        workingDays: 0,
        present: 0,
        halfDays: 0,
        absent: 0,
        paidLeave: 0,
        unpaidLeave: 0,
        weekOff: 0,
        holidays: 0,
        payable: 0,
        overtimeHours: 0,
        totalHours: 0,
      },
      money: {
        baseMonthly: 0,
        overtimePay: 0,
        grossEarnings: 0,
        pfEmployee: 0,
        esiEmployee: 0,
        professionalTax: 0,
        absentDeduction: 0,
        unpaidLeaveDeduction: 0,
        otherDeductions: 0,
        advanceRecovered: 0,
        netPayable: terms.amount,
        pfEmployer: 0,
        epsEmployer: 0,
        esiEmployer: 0,
      },
      components: [],
      statutorySnapshot: {},
      details: null,
      approvedBy: input.by,
      approvedAt: input.now,
      paidBy: input.by,
      paidAt: input.now,
      payment: terms.payment,
      payslipKey: null,
      createdAt: now,
      updatedAt: now,
      recoveries: [],
      advance: null,
    });
    this.advances.push({
      id: nextId("advance"),
      memberId: input.memberId,
      slipId,
      amount: terms.amount,
      instalments: terms.instalments,
      advanceDate: terms.advanceDate,
      firstRecoveryMonth: firstRecoveryMonth(
        terms.advanceDate,
        regular != null && regular.status !== "calculated",
      ),
      reason: terms.reason,
    });
    this.audits.push({
      action: "salary_advance.paid",
      entityId: slipId,
      by: input.by,
    });
    return Promise.resolve(slipId);
  }

  autoSalaryCompanies() {
    return Promise.resolve(this.autoCompanies);
  }

  today(_workspaceId: string) {
    return Promise.resolve(this.todayValue);
  }
}

/** Team Members in memory. */
export class FakeEmployeeDirectory implements EmployeeDirectory {
  constructor(readonly employees: HrmsEmployee[]) {}

  list() {
    return Promise.resolve(this.employees);
  }

  find(_workspaceId: string, memberIds: readonly string[]) {
    return Promise.resolve(
      new Map(
        this.employees
          .filter((item) => memberIds.includes(item.memberId))
          .map((item) => [item.memberId, item]),
      ),
    );
  }

  findByUserId(_workspaceId: string, userId: string) {
    return Promise.resolve(
      this.employees.find((item) => item.userId === userId) ?? null,
    );
  }
}

export function employee(
  memberId: string,
  overrides: Partial<HrmsEmployee> = {},
): HrmsEmployee {
  return {
    memberId,
    userId: `user-${memberId}`,
    name: `Member ${memberId}`,
    memberType: "hrms",
    designationId: "d-1",
    designationName: "Site Engineer",
    projectIds: [],
    active: true,
    isOwner: false,
    ...overrides,
  };
}

/** Salary configurations in memory: one per member, from a start date. */
export class FakeSalaryConfigSource implements SalaryConfigSource {
  readonly configs = new Map<
    string,
    StoredEmployeeSalaryConfig & {
      structure: SalaryStructure;
      structureName: string;
    }
  >();

  set(
    memberId: string,
    structure: SalaryStructure,
    baseMonthly: number,
    effectiveFrom: CalendarDate = "2026-01-01",
  ): void {
    const now = new Date("2026-01-01T00:00:00Z");
    this.configs.set(memberId, {
      id: `config-${memberId}`,
      memberId,
      config: {
        structureId: "structure-1",
        baseMonthly,
        componentOverrides: {},
        gender: null,
        uan: "100200300400",
        esiIpNumber: null,
        effectiveFrom,
      },
      createdAt: now,
      updatedAt: now,
      structure,
      structureName: structure.name,
    });
  }

  inForce(
    _workspaceId: string,
    memberIds: readonly string[],
    on: CalendarDate,
  ) {
    return Promise.resolve(
      new Map(
        [...this.configs].filter(
          ([memberId, config]) =>
            memberIds.includes(memberId) && config.config.effectiveFrom <= on,
        ),
      ),
    );
  }
}

/**
 * Attendance per member and date, as `AttendanceDaySource` gives it (leave,
 * holidays and the day's shift folded in): Monday–Friday present 8 h,
 * weekends week offs, unless set.
 */
export class FakeAttendanceDaySource implements AttendanceDaySource {
  readonly holidays = new Set<CalendarDate>();
  readonly overrides = new Map<string, Partial<AttendanceDay>>();

  set(memberId: string, date: CalendarDate, day: Partial<AttendanceDay>) {
    this.overrides.set(`${memberId}:${date}`, day);
  }

  private day(memberId: string, date: CalendarDate): AttendanceDay {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const status: AttendanceDay["status"] = this.holidays.has(date)
      ? "holiday"
      : weekday === 0 || weekday === 6
        ? "week_off"
        : "present";
    return {
      date,
      status,
      workedHours: status === "present" ? 8 : 0,
      overtimeHours: 0,
      overtimeAllowed: false,
      shiftWorkingHours: 8,
      late: false,
      leave: null,
      ...this.overrides.get(`${memberId}:${date}`),
    };
  }

  monthFor(
    _workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ) {
    return Promise.resolve(
      new Map(
        memberIds.map((memberId) => [
          memberId,
          datesOf(month).map((date) => this.day(memberId, date)),
        ]),
      ),
    );
  }
}

export class FakePayslipFiles implements PayslipFiles {
  readonly objects = new Map<string, Uint8Array>();
  readonly keys = new Map<string, string>();

  read(key: string) {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  store(input: { slipId: string; bytes: Uint8Array }) {
    const existing = this.keys.get(input.slipId);
    if (existing != null)
      return Promise.resolve({ key: existing, ours: false });
    const key = `payslips/${input.slipId}.pdf`;
    this.objects.set(key, input.bytes);
    this.keys.set(input.slipId, key);
    return Promise.resolve({ key, ours: true });
  }
}

/** Renders the document as JSON bytes, so tests can read what it says. */
export class FakePayslipRenderer implements PayslipRenderer {
  readonly rendered: PayslipDocument[] = [];

  render(document: PayslipDocument) {
    this.rendered.push(document);
    return Promise.resolve(new TextEncoder().encode(JSON.stringify(document)));
  }
}

export const fakeCompany: SalaryCompanyReader = {
  profileFor: () =>
    Promise.resolve({
      name: "Sri Ganesh Constructions",
      currency: "INR",
      timezone: "Asia/Kolkata",
    }),
};
