import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { formatMinor } from "@/src/shared-kernel/money";

import {
  addMonths,
  assertMonthKey,
  firstDayOf,
  lastDayOf,
  monthKeyOf,
  type MonthKey,
} from "../domain/calendar";
import { buildPayslip, type PayslipDocument } from "../domain/payslip";
import {
  calculateSalary,
  esiContributionPeriod,
  type SalaryBreakdown,
} from "../domain/salary-calculation";
import { aggregateSalaryDays } from "../domain/salary-days";
import {
  advanceDue,
  assertApprovable,
  assertPayable,
  assertRecalculable,
  createSalaryAdvance,
  createSalaryPayment,
  esiEligibilityFor,
  salarySlipChanged,
  type SalaryApprover,
} from "../domain/salary-slip";
import { componentAmounts } from "../domain/salary-structure";
import type { SalaryConfigSource } from "./employee-salary-handlers";
import type {
  AttendanceDaySource,
  EffectiveShiftResolver,
  EmployeeDirectory,
  HrmsEmployee,
  HrmsSettingsReader,
  LeaveDaySource,
  StatutoryRates,
  WorkCalendar,
} from "./ports";
import type {
  CalculatedSlipWrite,
  PayslipFiles,
  PayslipRenderer,
  SalaryCompanyReader,
  SalaryMonthTotals,
  SalaryRunStore,
  SalarySlipDetails,
  StoredSalarySlip,
} from "./salary-run-ports";

const MENU = "hrms.salaries" as const;

/** The most slips one approve or mark-paid call takes. */
export const MAX_SALARY_BATCH = 500;

/** Who audits the scheduled run. */
export const SYSTEM_ACTOR = "system";

export type SkipReason =
  | "not_joined"
  | "not_configured"
  | "starts_later"
  | "not_calculated"
  | "calculation_failed";

/** A Team Member the month has no regular slip for, and why. */
export type SkippedMember = {
  memberId: string;
  name: string;
  designationName: string | null;
  reason: SkipReason;
  message: string;
};

export type SalaryMember = {
  memberId: string;
  name: string;
  designationName: string | null;
};

/** A slip as a screen sees it. */
export type SalarySlipRecord = {
  slip: StoredSalarySlip;
  member: SalaryMember;
  /** The caller's own slip. */
  own: boolean;
  /** Amounts shown: one's own, or anyone's with `financial`. */
  amountsVisible: boolean;
};

/** What the caller may do on Team Salary (`GET /salaries` answers it). */
export type SalaryCapabilities = {
  calculate: boolean;
  approve: boolean;
  markPaid: boolean;
  payAdvance: boolean;
  report: boolean;
  financial: boolean;
  viewAll: boolean;
};

export type TeamSalaryView = {
  month: MonthKey;
  records: SalarySlipRecord[];
  skipped: SkippedMember[];
  /** Null without `financial`. */
  totals: SalaryMonthTotals | null;
  can: SalaryCapabilities;
  /** The caller's Team Member, to keep them off their own approval. */
  myMemberId: string | null;
};

export type CalculateResult = {
  month: MonthKey;
  calculated: number;
  /** Approved or Paid slips left as they are. */
  kept: number;
  skipped: SkippedMember[];
};

function capabilities(access: MemberAccess): SalaryCapabilities {
  return {
    calculate: can(access, MENU, "create"),
    approve: can(access, MENU, "approve"),
    markPaid: can(access, MENU, "update"),
    payAdvance: can(access, MENU, "create") && can(access, MENU, "financial"),
    report: can(access, MENU, "report") || can(access, MENU, "export"),
    financial: can(access, MENU, "financial"),
    viewAll: can(access, MENU, "view_all"),
  };
}

function slipNotFound(): DomainError {
  return notFound(
    "SALARY_SLIP_NOT_FOUND",
    "This salary was not found. It may have been removed.",
  );
}

function monthOf(value: string): MonthKey {
  try {
    return assertMonthKey(value.trim());
  } catch {
    throw new DomainError("SALARY_MONTH_INVALID", "Choose a month.", {
      details: { field: "month" },
    });
  }
}

function batch(items: readonly unknown[], field: string): void {
  if (items.length === 0)
    throw new DomainError(
      "SALARY_SLIPS_REQUIRED",
      "Choose at least one salary.",
      { details: { field } },
    );
  if (items.length > MAX_SALARY_BATCH)
    throw new DomainError(
      "SALARY_SLIPS_TOO_MANY",
      `Choose at most ${String(MAX_SALARY_BATCH)} salaries at once.`,
      { details: { field } },
    );
}

function memberOf(
  employee: HrmsEmployee | undefined,
  slip: StoredSalarySlip,
): SalaryMember {
  return {
    memberId: slip.memberId,
    name: employee?.name ?? slip.details?.employee.name ?? "Removed member",
    designationName:
      employee?.designationName ??
      slip.details?.employee.designationName ??
      null,
  };
}

function fileSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? "member" : slug.slice(0, 40);
}

function dateIn(timezone: string, at: Date, withTime: boolean): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  try {
    return new Intl.DateTimeFormat("en-IN", {
      ...options,
      timeZone: timezone,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-IN", {
      ...options,
      timeZone: "Asia/Kolkata",
    }).format(at);
  }
}

/**
 * Salary runs (CM-316), menu `hrms.salaries`: read = one's own Approved
 * and Paid slips (My Salary); view_all = Team Salary; create = calculate
 * and recalculate; create + financial = pay an advance; approve = approve
 * (never one's own, except the Owner); update = Mark Paid; financial =
 * amounts of others' slips; report or export = the team salary workbook.
 */
export class SalaryRunHandlers {
  constructor(
    private readonly store: SalaryRunStore,
    private readonly deps: {
      employees: EmployeeDirectory;
      settings: HrmsSettingsReader;
      calendar: WorkCalendar;
      shifts: EffectiveShiftResolver;
      attendanceDays: AttendanceDaySource;
      leaveDays: LeaveDaySource;
      statutoryRates: StatutoryRates;
      configs: SalaryConfigSource;
      company: SalaryCompanyReader;
      payslips: PayslipFiles;
      renderer: PayslipRenderer;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async me(access: MemberAccess): Promise<HrmsEmployee | null> {
    return this.deps.employees.findByUserId(access.workspaceId, access.userId);
  }

  private record(
    access: MemberAccess,
    slip: StoredSalarySlip,
    employee: HrmsEmployee | undefined,
    myMemberId: string | null,
  ): SalarySlipRecord {
    const own = myMemberId != null && slip.memberId === myMemberId;
    return {
      slip,
      member: memberOf(employee, slip),
      own,
      amountsVisible: own || can(access, MENU, "financial"),
    };
  }

  private async records(
    access: MemberAccess,
    slips: readonly StoredSalarySlip[],
    myMemberId: string | null,
  ): Promise<SalarySlipRecord[]> {
    const employees = await this.deps.employees.find(access.workspaceId, [
      ...new Set(slips.map((slip) => slip.memberId)),
    ]);
    return slips.map((slip) =>
      this.record(access, slip, employees.get(slip.memberId), myMemberId),
    );
  }

  /** Why each live member has no regular slip this month. */
  private async skipped(
    workspaceId: string,
    month: MonthKey,
    employees: readonly HrmsEmployee[],
    slips: readonly StoredSalarySlip[],
  ): Promise<SkippedMember[]> {
    const withSlip = new Set(
      slips
        .filter((slip) => slip.kind === "regular")
        .map((slip) => slip.memberId),
    );
    const without = employees.filter((item) => !withSlip.has(item.memberId));
    if (without.length === 0) return [];
    const ids = without.map((item) => item.memberId);
    const [configs, starts] = await Promise.all([
      this.deps.configs.inForce(workspaceId, ids, lastDayOf(month)),
      this.store.salaryStarts(workspaceId, ids),
    ]);
    return without.map((employee) => {
      const reason = this.skipReason(
        employee,
        configs.has(employee.memberId),
        starts.get(employee.memberId) ?? null,
      );
      return {
        memberId: employee.memberId,
        name: employee.name,
        designationName: employee.designationName,
        ...(reason ?? {
          reason: "not_calculated" as const,
          message: "Not calculated yet.",
        }),
      };
    });
  }

  private skipReason(
    employee: HrmsEmployee,
    configured: boolean,
    startsOn: CalendarDate | null,
  ): { reason: SkipReason; message: string } | null {
    if (!employee.active)
      return { reason: "not_joined", message: "Has not joined yet." };
    if (!configured && startsOn != null)
      return {
        reason: "starts_later",
        message: `Salary starts on ${startsOn}.`,
      };
    if (!configured)
      return {
        reason: "not_configured",
        message: "Salary not set in Employee Management.",
      };
    return null;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Team Salary: every slip of the month, the members without one, totals. */
  async team(
    access: MemberAccess,
    monthInput: string,
  ): Promise<TeamSalaryView> {
    assertCan(access, MENU, "read");
    assertCan(access, MENU, "view_all");
    const month = monthOf(monthInput);
    const workspaceId = access.workspaceId;
    const [employees, slips, me] = await Promise.all([
      this.deps.employees.list(workspaceId),
      this.store.listMonth(workspaceId, month),
      this.me(access),
    ]);
    const byId = new Map(employees.map((item) => [item.memberId, item]));
    const missing = slips
      .map((slip) => slip.memberId)
      .filter((id) => !byId.has(id));
    const removed =
      missing.length === 0
        ? new Map<string, HrmsEmployee>()
        : await this.deps.employees.find(workspaceId, missing);
    const financial = can(access, MENU, "financial");
    return {
      month,
      records: slips.map((slip) =>
        this.record(
          access,
          slip,
          byId.get(slip.memberId) ?? removed.get(slip.memberId),
          me?.memberId ?? null,
        ),
      ),
      skipped: await this.skipped(workspaceId, month, employees, slips),
      totals: financial ? await this.store.totals(workspaceId, month) : null,
      can: capabilities(access),
      myMemberId: me?.memberId ?? null,
    };
  }

  /** My Salary: the caller's Approved and Paid slips and advances, newest first. */
  async mine(access: MemberAccess): Promise<{
    member: SalaryMember | null;
    records: SalarySlipRecord[];
  }> {
    assertCan(access, MENU, "read");
    const me = await this.me(access);
    if (me == null) return { member: null, records: [] };
    const slips = (
      await this.store.listMember(access.workspaceId, me.memberId)
    ).filter((slip) => slip.status !== "calculated");
    return {
      member: {
        memberId: me.memberId,
        name: me.name,
        designationName: me.designationName,
      },
      records: slips.map((slip) => this.record(access, slip, me, me.memberId)),
    };
  }

  /**
   * One slip: one's own once approved (read), anyone's with view_all.
   * Others' slips the caller may not see are 404.
   */
  async detail(access: MemberAccess, id: string): Promise<SalarySlipRecord> {
    assertCan(access, MENU, "read");
    const [slip, me] = await Promise.all([
      this.store.find(access.workspaceId, id),
      this.me(access),
    ]);
    if (slip == null) throw slipNotFound();
    const own = slip.memberId === me?.memberId;
    const viewAll = can(access, MENU, "view_all");
    if (!viewAll && (!own || slip.status === "calculated"))
      throw slipNotFound();
    const [record] = await this.records(access, [slip], me?.memberId ?? null);
    if (record == null) throw slipNotFound();
    return record;
  }

  // -------------------------------------------------------------------------
  // Calculate
  // -------------------------------------------------------------------------

  private async assertMonthNotAhead(
    workspaceId: string,
    month: MonthKey,
  ): Promise<CalendarDate> {
    const today = await this.store.today(workspaceId);
    if (month > monthKeyOf(today))
      throw new DomainError(
        "SALARY_MONTH_IN_FUTURE",
        "Salary can be calculated once the month has started.",
        { details: { field: "month" } },
      );
    return today;
  }

  /**
   * Works out the slips of `month` for `employees` and writes them:
   * Approved and Paid slips are kept, Calculated ones replaced.
   */
  private async run(input: {
    workspaceId: string;
    month: MonthKey;
    employees: readonly HrmsEmployee[];
    today: CalendarDate;
    by: string;
    /** Throw instead of skipping (one member's recalculation). */
    strict: boolean;
  }): Promise<CalculateResult> {
    const { workspaceId, month } = input;
    const ids = input.employees.map((item) => item.memberId);
    const [existing, configs, starts] = await Promise.all([
      this.store.listMonth(workspaceId, month),
      this.deps.configs.inForce(workspaceId, ids, lastDayOf(month)),
      this.store.salaryStarts(workspaceId, ids),
    ]);
    const regular = new Map(
      existing
        .filter((slip) => slip.kind === "regular")
        .map((slip) => [slip.memberId, slip]),
    );

    const skipped: SkippedMember[] = [];
    let kept = 0;
    const toCalculate: HrmsEmployee[] = [];
    for (const employee of input.employees) {
      const slip = regular.get(employee.memberId);
      if (slip != null && slip.status !== "calculated") {
        if (input.strict) assertRecalculable(slip);
        kept += 1;
        continue;
      }
      const reason = this.skipReason(
        employee,
        configs.has(employee.memberId),
        starts.get(employee.memberId) ?? null,
      );
      if (reason != null) {
        if (input.strict)
          throw conflict("SALARY_NOT_CONFIGURED", reason.message, {
            memberId: employee.memberId,
            reason: reason.reason,
          });
        skipped.push({
          memberId: employee.memberId,
          name: employee.name,
          designationName: employee.designationName,
          ...reason,
        });
        continue;
      }
      toCalculate.push(employee);
    }
    if (toCalculate.length === 0)
      return { month, calculated: 0, kept, skipped };

    const calcIds = toCalculate.map((item) => item.memberId);
    const period = esiContributionPeriod(month);
    const settings = await this.deps.settings.settingsFor(workspaceId);
    const [
      calendar,
      attendance,
      leave,
      firstSlips,
      advances,
      pf,
      esi,
      ptSlabs,
    ] = await Promise.all([
      this.deps.calendar.monthFor(workspaceId, calcIds, month),
      this.deps.attendanceDays.monthFor(workspaceId, calcIds, month),
      this.deps.leaveDays.approvedForMonth(workspaceId, calcIds, month),
      this.store.periodFirstSlips(workspaceId, calcIds, period.start, month),
      this.store.advancesDue(workspaceId, calcIds, month),
      this.deps.statutoryRates.pfFor(month),
      this.deps.statutoryRates.esiFor(month),
      settings.ptStateCode == null
        ? Promise.resolve([])
        : this.deps.statutoryRates.ptSlabsFor(settings.ptStateCode, month),
    ]);
    const today = monthKeyOf(input.today) === month ? input.today : null;

    const writes: CalculatedSlipWrite[] = [];
    for (const employee of toCalculate) {
      const memberId = employee.memberId;
      const config = configs.get(memberId);
      if (config == null) continue;
      try {
        const shifts = await this.deps.shifts.shiftsForMonth(
          workspaceId,
          memberId,
          month,
        );
        const startsOn = starts.get(memberId) ?? null;
        const salaryStartsOn =
          startsOn != null && startsOn > firstDayOf(month) ? startsOn : null;
        const days = aggregateSalaryDays({
          month,
          calendar: calendar.get(memberId) ?? [],
          attendance: attendance.get(memberId) ?? [],
          leave: leave.get(memberId) ?? [],
          shifts,
          salaryStartsOn,
          today,
        });
        const fullMonthGross = componentAmounts(
          config.structure,
          config.config.baseMonthly,
          config.config.componentOverrides,
        ).reduce((sum, line) => sum + line.monthly, 0);
        const eligibility = esiEligibilityFor({
          month,
          periodFirstSlip: firstSlips.get(memberId) ?? null,
          fullMonthGross,
          rate: esi,
        });
        const dues = (advances.get(memberId) ?? [])
          .map((item) => ({
            advanceId: item.advance.id,
            due: advanceDue(item.advance, month, item.recoveredBefore),
          }))
          .filter((item) => item.due > 0);
        const breakdown = calculateSalary({
          structure: config.structure,
          employee: {
            baseMonthly: config.config.baseMonthly,
            componentOverrides: config.config.componentOverrides,
            gender: config.config.gender,
          },
          month,
          days: days.days,
          overtime: days.overtime,
          totalHours: days.totalHours,
          statutory: { pf, esi, ptStateCode: settings.ptStateCode, ptSlabs },
          esiEligible: eligibility.eligible,
          advances: dues,
        });
        const existingSlip = regular.get(memberId);
        writes.push(
          this.slipWrite({
            memberId,
            structureId: config.config.structureId,
            structureName: config.structureName,
            breakdown,
            employee,
            uan: config.config.uan,
            esiIpNumber: config.config.esiIpNumber,
            salaryStartsOn,
            esiBasis: {
              basisMonth: eligibility.basisMonth,
              basisGross: eligibility.basisGross,
            },
            replaces:
              existingSlip == null
                ? null
                : { id: existingSlip.id, updatedAt: existingSlip.updatedAt },
          }),
        );
      } catch (error) {
        if (input.strict || !(error instanceof DomainError)) throw error;
        skipped.push({
          memberId,
          name: employee.name,
          designationName: employee.designationName,
          reason: "calculation_failed",
          message: error.message,
        });
      }
    }
    if (writes.length > 0)
      await this.store.saveCalculated({
        workspaceId,
        month,
        writes,
        by: input.by,
        now: this.clock(),
      });
    return { month, calculated: writes.length, kept, skipped };
  }

  private slipWrite(input: {
    memberId: string;
    structureId: string;
    structureName: string;
    breakdown: SalaryBreakdown;
    employee: HrmsEmployee;
    uan: string | null;
    esiIpNumber: string | null;
    salaryStartsOn: CalendarDate | null;
    esiBasis: SalarySlipDetails["esi"];
    replaces: CalculatedSlipWrite["replaces"];
  }): CalculatedSlipWrite {
    const b = input.breakdown;
    const details: SalarySlipDetails = {
      structureName: input.structureName,
      fullMonthGross: b.fullMonthGross,
      salaryStartsOn: input.salaryStartsOn,
      notEmployedDays: b.days.notEmployed ?? 0,
      notEmployedDeduction: b.notEmployedDeduction,
      paidOvertimeHours: b.paidOvertimeHours,
      otherDeductions: b.otherDeductions,
      shortfall: b.shortfall,
      esi: input.esiBasis,
      employee: {
        name: input.employee.name,
        designationName: input.employee.designationName,
        uan: input.uan,
        esiIpNumber: input.esiIpNumber,
      },
    };
    return {
      memberId: input.memberId,
      replaces: input.replaces,
      structureId: input.structureId,
      days: {
        daysInMonth: b.daysInMonth,
        workingDays: b.days.workingDays,
        present: b.days.present,
        halfDays: b.days.halfDays,
        absent: b.days.absent,
        paidLeave: b.days.paidLeave,
        unpaidLeave: b.days.unpaidLeave,
        weekOff: b.days.weekOff,
        holidays: b.days.holidays,
        payable: b.days.payable,
        overtimeHours: b.overtimeHours,
        totalHours: b.totalHours,
      },
      money: {
        baseMonthly: b.baseMonthly,
        overtimePay: b.overtimePay,
        grossEarnings: b.grossEarnings,
        pfEmployee: b.pf.employee,
        esiEmployee: b.esi.employee,
        professionalTax: b.professionalTax,
        absentDeduction: b.absentDeduction,
        unpaidLeaveDeduction: b.unpaidLeaveDeduction,
        otherDeductions: b.otherDeductionsTotal,
        advanceRecovered: b.advanceRecovered,
        netPayable: b.netPayable,
        pfEmployer: b.pf.employerEpf,
        epsEmployer: b.pf.employerEps,
        esiEmployer: b.esi.employer,
      },
      components: b.earnings.map((line) => ({
        componentId: line.componentId,
        name: line.name,
        monthly: line.monthly,
        earned: line.earned,
      })),
      statutorySnapshot: { ...b.statutorySnapshot, slip: details },
      recoveries: b.advances
        .filter((line) => line.recovered > 0)
        .map((line) => ({ advanceId: line.advanceId, amount: line.recovered })),
    };
  }

  /**
   * Calculate Salary (`create`): every live Team Member, or `memberIds`,
   * for a month that has started. Members not joined or not Configured
   * are skipped with the reason; Approved and Paid slips stay as they are;
   * Calculated slips are replaced.
   */
  async calculate(
    access: MemberAccess,
    input: { month: string; memberIds?: readonly string[] | null },
  ): Promise<CalculateResult> {
    assertCan(access, MENU, "create");
    const month = monthOf(input.month);
    const workspaceId = access.workspaceId;
    const today = await this.assertMonthNotAhead(workspaceId, month);
    let employees: HrmsEmployee[];
    if (input.memberIds == null || input.memberIds.length === 0)
      employees = await this.deps.employees.list(workspaceId);
    else {
      const found = await this.deps.employees.find(
        workspaceId,
        input.memberIds,
      );
      const missing = input.memberIds.find((id) => !found.has(id));
      if (missing != null)
        throw new DomainError(
          "TEAM_MEMBER_NOT_FOUND",
          "This Team Member was not found. They may have been removed.",
          {
            kind: "not_found",
            details: { field: "memberIds", memberId: missing },
          },
        );
      employees = [...found.values()];
    }
    return this.run({
      workspaceId,
      month,
      employees,
      today,
      by: access.userId,
      strict: false,
    });
  }

  /** Recalculate one Calculated slip (`create`); Approved and Paid never change. */
  async recalculate(
    access: MemberAccess,
    input: { id: string; expectedUpdatedAt: Date },
  ): Promise<SalarySlipRecord> {
    assertCan(access, MENU, "create");
    const workspaceId = access.workspaceId;
    const slip = await this.store.find(workspaceId, input.id);
    if (slip == null) throw slipNotFound();
    assertRecalculable(slip);
    if (slip.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw salarySlipChanged([slip.id]);
    const employee = (
      await this.deps.employees.find(workspaceId, [slip.memberId])
    ).get(slip.memberId);
    if (employee == null)
      throw conflict(
        "SALARY_NOT_CONFIGURED",
        "This Team Member was removed, so their salary cannot be recalculated.",
        { memberId: slip.memberId, reason: "not_configured" },
      );
    const today = await this.assertMonthNotAhead(workspaceId, slip.month);
    await this.run({
      workspaceId,
      month: slip.month,
      employees: [employee],
      today,
      by: access.userId,
      strict: true,
    });
    return this.detail(access, slip.id);
  }

  // -------------------------------------------------------------------------
  // Approve and pay
  // -------------------------------------------------------------------------

  private async load(
    workspaceId: string,
    items: readonly { id: string; expectedUpdatedAt: Date }[],
  ): Promise<StoredSalarySlip[]> {
    const ids = [...new Set(items.map((item) => item.id))];
    if (ids.length !== items.length)
      throw new DomainError(
        "SALARY_SLIP_DUPLICATE",
        "A salary appears twice in this request.",
        { details: { field: "slips" } },
      );
    const found = await this.store.findMany(workspaceId, ids);
    const slips: StoredSalarySlip[] = [];
    for (const item of items) {
      const slip = found.get(item.id);
      if (slip == null) throw slipNotFound();
      slips.push(slip);
    }
    return slips;
  }

  private static stale(
    slips: readonly StoredSalarySlip[],
    items: readonly { id: string; expectedUpdatedAt: Date }[],
  ): void {
    const expected = new Map(
      items.map((item) => [item.id, item.expectedUpdatedAt.getTime()]),
    );
    const stale = slips
      .filter((slip) => slip.updatedAt.getTime() !== expected.get(slip.id))
      .map((slip) => slip.id);
    if (stale.length > 0) throw salarySlipChanged(stale);
  }

  /**
   * Approve (`approve`) Calculated slips, all or none. Nobody approves
   * their own except the Owner. Approval locks each member's month for
   * attendance and leave (ADR CM-0012 §17).
   */
  async approve(
    access: MemberAccess,
    input: { slips: readonly { id: string; expectedUpdatedAt: Date }[] },
  ): Promise<SalarySlipRecord[]> {
    assertCan(access, MENU, "approve");
    batch(input.slips, "slips");
    const workspaceId = access.workspaceId;
    const me = await this.me(access);
    const approver: SalaryApprover = {
      memberId: me?.memberId ?? null,
      isOwner: access.role === "owner",
    };
    const slips = await this.load(workspaceId, input.slips);
    for (const slip of slips) assertApprovable(slip, approver);
    SalaryRunHandlers.stale(slips, input.slips);
    await this.store.approve({
      workspaceId,
      items: input.slips,
      by: access.userId,
      now: this.clock(),
    });
    const after = await this.store.findMany(
      workspaceId,
      slips.map((slip) => slip.id),
    );
    return this.records(
      access,
      slips.map((slip) => after.get(slip.id) ?? slip),
      me?.memberId ?? null,
    );
  }

  /** Mark Paid (`update`): Approved slips, with the mode, date and reference. */
  async markPaid(
    access: MemberAccess,
    input: {
      slips: readonly { id: string; expectedUpdatedAt: Date }[];
      mode: string;
      paymentDate: string;
      reference?: string | null;
    },
  ): Promise<SalarySlipRecord[]> {
    assertCan(access, MENU, "update");
    batch(input.slips, "slips");
    const workspaceId = access.workspaceId;
    const slips = await this.load(workspaceId, input.slips);
    for (const slip of slips) assertPayable(slip);
    SalaryRunHandlers.stale(slips, input.slips);
    const payment = createSalaryPayment(
      input,
      await this.store.today(workspaceId),
    );
    await this.store.markPaid({
      workspaceId,
      items: input.slips,
      payment,
      by: access.userId,
      now: this.clock(),
    });
    const [after, me] = await Promise.all([
      this.store.findMany(
        workspaceId,
        slips.map((slip) => slip.id),
      ),
      this.me(access),
    ]);
    return this.records(
      access,
      slips.map((slip) => after.get(slip.id) ?? slip),
      me?.memberId ?? null,
    );
  }

  /**
   * Pay Advance Salary (`create` and `financial`, ADR CM-0012 §15): paid
   * at once as an advance slip; later regular slips recover it in
   * instalments. Not to oneself, except the Owner.
   */
  async payAdvance(
    access: MemberAccess,
    input: {
      memberId: string;
      amount: number;
      instalments?: number | null;
      advanceDate: string;
      mode: string;
      reference?: string | null;
      reason?: string | null;
    },
  ): Promise<SalarySlipRecord> {
    assertCan(access, MENU, "create");
    assertCan(access, MENU, "financial");
    const workspaceId = access.workspaceId;
    const [employee, me, today] = await Promise.all([
      this.deps.employees
        .find(workspaceId, [input.memberId])
        .then((found) => found.get(input.memberId)),
      this.me(access),
      this.store.today(workspaceId),
    ]);
    if (employee == null)
      throw new DomainError(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found. They may have been removed.",
        { kind: "not_found", details: { field: "memberId" } },
      );
    if (access.role !== "owner" && me?.memberId === employee.memberId)
      throw forbidden(
        "SALARY_OWN_ADVANCE",
        "You cannot pay an advance to yourself. Ask another approver.",
      );
    const terms = createSalaryAdvance(input, today);
    const starts = await this.store.salaryStarts(workspaceId, [
      employee.memberId,
    ]);
    const reason = this.skipReason(
      employee,
      starts.has(employee.memberId),
      null,
    );
    if (reason != null)
      throw new DomainError("SALARY_NOT_CONFIGURED", reason.message, {
        kind: "conflict",
        details: { field: "memberId", reason: reason.reason },
      });
    const id = await this.store.payAdvance({
      workspaceId,
      memberId: employee.memberId,
      terms,
      by: access.userId,
      now: this.clock(),
    });
    const slip = await this.store.find(workspaceId, id);
    if (slip == null) throw slipNotFound();
    return this.record(access, slip, employee, me?.memberId ?? null);
  }

  // -------------------------------------------------------------------------
  // Payslip
  // -------------------------------------------------------------------------

  private async document(
    workspaceId: string,
    slip: StoredSalarySlip,
  ): Promise<PayslipDocument> {
    const profile = await this.deps.company.profileFor(workspaceId);
    const details = slip.details;
    const approved =
      slip.approvedAt == null
        ? "Approved"
        : `Approved on ${dateIn(profile.timezone, slip.approvedAt, false)}`;
    return buildPayslip({
      company: profile.name,
      currency: profile.currency,
      slip: {
        month: slip.month,
        ...slip.days,
        components: slip.components,
        overtimePay: slip.money.overtimePay,
        grossEarnings: slip.money.grossEarnings,
        pfEmployee: slip.money.pfEmployee,
        esiEmployee: slip.money.esiEmployee,
        professionalTax: slip.money.professionalTax,
        absentDeduction: slip.money.absentDeduction,
        unpaidLeaveDeduction: slip.money.unpaidLeaveDeduction,
        otherDeductions:
          details?.otherDeductions.filter((line) => line.charged > 0) ??
          (slip.money.otherDeductions > 0
            ? [
                {
                  name: "Other deductions",
                  charged: slip.money.otherDeductions,
                },
              ]
            : []),
        advanceRecovered: slip.money.advanceRecovered,
        netPayable: slip.money.netPayable,
        pfEmployer: slip.money.pfEmployer,
        epsEmployer: slip.money.epsEmployer,
        esiEmployer: slip.money.esiEmployer,
        notEmployedDays: details?.notEmployedDays ?? 0,
        notEmployedDeduction: details?.notEmployedDeduction ?? 0,
        paidOvertimeHours:
          details?.paidOvertimeHours ?? slip.days.overtimeHours,
        shortfall: details?.shortfall ?? null,
      },
      member: {
        name: details?.employee.name ?? "Team Member",
        designation: details?.employee.designationName ?? null,
        uan: details?.employee.uan ?? null,
        esiIpNumber: details?.employee.esiIpNumber ?? null,
      },
      status: approved,
      generatedAt: dateIn(profile.timezone, this.clock(), true),
      formatMoney: (paise) => formatMinor(paise, profile.currency),
    });
  }

  /** Renders and stores the slip's payslip once; returns its bytes. */
  private async payslipBytes(
    workspaceId: string,
    slip: StoredSalarySlip,
    by: string,
  ): Promise<Uint8Array> {
    if (slip.payslipKey != null) {
      const stored = await this.deps.payslips.read(slip.payslipKey);
      if (stored != null) return stored;
      // The object went missing: print it again from the immutable slip.
      return this.deps.renderer.render(await this.document(workspaceId, slip));
    }
    const bytes = await this.deps.renderer.render(
      await this.document(workspaceId, slip),
    );
    const stored = await this.deps.payslips.store({
      workspaceId,
      slipId: slip.id,
      bytes,
      by,
      now: this.clock(),
    });
    if (stored.ours) return bytes;
    // Another request stored it first: serve the one kept.
    return (await this.deps.payslips.read(stored.key)) ?? bytes;
  }

  /**
   * The payslip PDF of an Approved or Paid regular slip: one's own
   * (read), or anyone's with view_all and financial. Stored on first
   * download and never changed after.
   */
  async payslip(
    access: MemberAccess,
    id: string,
  ): Promise<{ bytes: Uint8Array; fileName: string }> {
    const record = await this.detail(access, id);
    if (!record.amountsVisible) assertCan(access, MENU, "financial");
    const { slip } = record;
    if (slip.kind !== "regular")
      throw conflict(
        "PAYSLIP_NOT_AVAILABLE",
        "An advance has no payslip; it shows on the regular payslips that recover it.",
      );
    if (slip.status === "calculated")
      throw conflict(
        "SALARY_NOT_APPROVED",
        "The payslip is ready once this salary is approved.",
      );
    const bytes = await this.payslipBytes(
      access.workspaceId,
      slip,
      access.userId,
    );
    return {
      bytes,
      fileName: `payslip-${fileSlug(record.member.name)}-${slip.month}.pdf`,
    };
  }

  /** Stores the payslips of newly approved slips (after the response). */
  async storePayslips(
    workspaceId: string,
    ids: readonly string[],
    by: string,
  ): Promise<void> {
    const slips = await this.store.findMany(workspaceId, ids);
    for (const slip of slips.values()) {
      if (
        slip.kind !== "regular" ||
        slip.status === "calculated" ||
        slip.payslipKey != null
      )
        continue;
      try {
        await this.payslipBytes(workspaceId, slip, by);
      } catch (error) {
        // The first download stores it instead.
        console.error("Payslip could not be stored", slip.id, error);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Team report and the scheduled run
  // -------------------------------------------------------------------------

  /** The team salary workbook's rows (`report` or `export`). */
  async teamReport(
    access: MemberAccess,
    monthInput: string,
  ): Promise<{
    month: MonthKey;
    company: string;
    records: SalarySlipRecord[];
    skipped: SkippedMember[];
    financial: boolean;
    /** Company time. */
    generatedAt: string;
  }> {
    if (!can(access, MENU, "report") && !can(access, MENU, "export"))
      assertCan(access, MENU, "report");
    const month = monthOf(monthInput);
    const workspaceId = access.workspaceId;
    const [employees, slips, me, profile] = await Promise.all([
      this.deps.employees.list(workspaceId),
      this.store.listMonth(workspaceId, month),
      this.me(access),
      this.deps.company.profileFor(workspaceId),
    ]);
    const records = await this.records(access, slips, me?.memberId ?? null);
    return {
      month,
      company: profile.name,
      // The workbook is a team report: amounts need financial even for one's own row.
      records: records.map((record) => ({
        ...record,
        amountsVisible: can(access, MENU, "financial"),
      })),
      skipped: await this.skipped(workspaceId, month, employees, slips),
      financial: can(access, MENU, "financial"),
      generatedAt: dateIn(profile.timezone, this.clock(), true),
    };
  }

  /**
   * The scheduled run: for every Company with automatic salary
   * calculation on whose salary day has come, calculates last month for
   * every member, as `system`. Idempotent: a month that already has a run
   * (calculated by hand or by an earlier day) is left alone.
   */
  async autoCalculateAll(): Promise<{
    companies: number;
    calculated: number;
  }> {
    const companies = await this.store.autoSalaryCompanies();
    let calculated = 0;
    for (const company of companies) {
      try {
        const today = await this.store.today(company.workspaceId);
        if (Number(today.slice(8, 10)) < company.day) continue;
        const month = addMonths(monthKeyOf(today), -1);
        if (await this.store.runExists(company.workspaceId, month)) continue;
        const employees = await this.deps.employees.list(company.workspaceId);
        const result = await this.run({
          workspaceId: company.workspaceId,
          month,
          employees,
          today,
          by: SYSTEM_ACTOR,
          strict: false,
        });
        calculated += result.calculated;
      } catch (error) {
        // One Company's failure must not stop the others; the next run retries.
        console.error(
          "Automatic salary calculation failed for a Company",
          company.workspaceId,
          error,
        );
      }
    }
    return { companies: companies.length, calculated };
  }
}
