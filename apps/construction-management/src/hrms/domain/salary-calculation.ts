import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  addMonths,
  daysInMonth as daysOfMonth,
  monthNumber,
  type MonthKey,
} from "./calendar";
import {
  componentAmounts,
  type ComponentOverrides,
  type SalaryStructure,
} from "./salary-structure";
import {
  ptFor,
  type EsiRate,
  type PfRate,
  type PtGender,
  type PtSlab,
} from "./statutory";

/**
 * One member's salary for one month (CM-316), as a pure function: no
 * database, no clock. The salary run gathers the inputs (attendance and
 * leave counts, overtime per day with the day's shift, the statutory rows
 * in force, ESI eligibility for the contribution period, advance
 * instalments due) and stores the breakdown as a slip. The Salary
 * Structure screen calls it too, for its sample calculation.
 *
 * Rules (ADR CM-0012 §12–15, ADR CM-0008):
 *
 * - Components come from the structure for the member's base and
 *   overrides (`componentAmounts`); their sum is the full-month gross.
 * - Proration by calendar days: each component earns
 *   monthly × payable days ÷ days in the month. Payable days are the days
 *   in the month less absent days (a half day is 0.5 absent) when "Deduct
 *   for absent days" is on, less unpaid leave when "Deduct for unpaid
 *   leave" is on. Week offs, holidays and paid leave are paid.
 * - Overtime is paid only for days whose shift allows overtime, at twice
 *   the ordinary hourly rate: full-month gross ÷ days in the month ÷ that
 *   shift's working hours. All overtime hours are reported.
 * - Gross earnings = earned components + overtime pay. It is the gross for
 *   ESI and professional tax.
 * - PF is on the PF wage: the earned components marked "counts for PF
 *   wage" (overtime never counts). With "cap at ceiling" on it is capped at
 *   the structure's ceiling or else the table's. Employee share at the
 *   structure's % or else the table's; employer share at the table's %,
 *   split into EPS (table EPS % of the PF wage up to the table ceiling,
 *   always) and EPF (the rest).
 * - ESI only when the structure has it on and the member is eligible for
 *   the contribution period (`esiEligible`, decided by the run from the
 *   gross at the start of the period: see `esiContributionPeriod` and
 *   `isEsiEligible`). Both shares are on gross earnings, overtime included.
 * - Professional tax: the structure's flat amount when set (charged only
 *   in a month with earnings), else the state slab for gross earnings, the
 *   month and the member's gender (no state chosen in HRMS Settings means
 *   no PT).
 * - Other deductions are the structure's fixed monthly amounts; advance
 *   instalments are recovered as given.
 * - Net is gross − PF − ESI − PT − other deductions − advance recovered,
 *   and never negative: when deductions would exceed gross, advance
 *   recovery is cut first, then other deductions (last first), then
 *   professional tax, and what was not taken is reported in `shortfall`.
 *
 * Rounding (all money is integer paise):
 *
 * - Components, proration and overtime: half up to the paisa, per line.
 *   The absent and unpaid-leave deductions are what proration took off,
 *   so full-month gross − not-employed deduction − absent deduction −
 *   unpaid-leave deduction + overtime pay = gross earnings, exactly.
 * - Days before the member's salary starts (`days.notEmployed`, a
 *   mid-month joiner) are never paid, whatever the switches say.
 * - PF (employee, employer, EPS): half up to the whole rupee, as EPFO's
 *   ECR does. EPF employer = employer total − EPS.
 * - ESI (employee and employer): up to the next whole rupee, as ESIC does.
 */

export type SalaryDayCounts = {
  /** Working days of the member's calendar; shown on the slip. */
  workingDays: number;
  present: number;
  halfDays: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  weekOff: number;
  holidays: number;
  /**
   * Days of the month the member's salary does not cover: before their
   * first salary configuration starts (a mid-month joiner). Never paid,
   * whatever the switches say; 0 when left out.
   */
  notEmployed?: number;
};

/** Overtime on one day, with that day's shift (CM-307). */
export type OvertimeDay = {
  date: CalendarDate;
  /** Hours beyond the shift's working hours; up to two places. */
  hours: number;
  /** The shift for the day has Overtime Allowed (none for the Settings day). */
  overtimeAllowed: boolean;
  /** The shift's working hours, for the hourly rate. */
  shiftWorkingHours: number;
};

export type SalaryStatutoryFigures = {
  /** The PF row in force for the month; null before the first row. */
  pf: PfRate | null;
  /** The ESI row in force for the month; null before the first row. */
  esi: EsiRate | null;
  /** HRMS Settings `ptStateCode`; null = none chosen (no slab PT). */
  ptStateCode: string | null;
  /** That state's slabs; the rule picks those in force for the month. */
  ptSlabs: readonly PtSlab[];
};

export type AdvanceInstalment = {
  advanceId: string;
  /** Paise due this month. */
  due: number;
};

export type SalaryCalculationInput = {
  structure: SalaryStructure;
  employee: {
    baseMonthly: number;
    componentOverrides: ComponentOverrides;
    gender: PtGender;
  };
  month: MonthKey;
  days: SalaryDayCounts;
  overtime: readonly OvertimeDay[];
  /** Hours worked in the month; shown on the slip. */
  totalHours: number;
  statutory: SalaryStatutoryFigures;
  /** Eligible for ESI in the contribution period holding `month`. */
  esiEligible: boolean;
  advances: readonly AdvanceInstalment[];
};

export type EarningsLine = {
  componentId: string;
  name: string;
  /** Paise for a full month. */
  monthly: number;
  /** Paise after proration. */
  earned: number;
  countsForPfWage: boolean;
};

export type StatutorySnapshot = {
  month: MonthKey;
  rounding: {
    earnings: "half_up_paisa";
    pf: "half_up_rupee";
    esi: "up_to_rupee";
  };
  pf: {
    applicable: boolean;
    rateEffectiveFrom: CalendarDate | null;
    source: string | null;
    capAtCeiling: boolean;
    /** The ceiling used (structure override or table), paise. */
    wageCeiling: number | null;
    tableWageCeiling: number | null;
    employeePercent: string | null;
    employerPercent: string | null;
    epsPercent: string | null;
    employeePercentOverridden: boolean;
    wageCeilingOverridden: boolean;
  };
  esi: {
    applicable: boolean;
    eligible: boolean;
    rateEffectiveFrom: CalendarDate | null;
    source: string | null;
    wageCeiling: number | null;
    employeePercent: string | null;
    employerPercent: string | null;
    employeePercentOverridden: boolean;
  };
  pt: {
    applicable: boolean;
    /** `flat`: the structure's amount; `slab`: the state's slab; `none`. */
    basis: "flat" | "slab" | "none";
    stateCode: string | null;
    gender: PtGender;
    slab: {
      effectiveFrom: CalendarDate;
      appliesTo: PtSlab["appliesTo"];
      grossFrom: number;
      grossTo: number | null;
      monthlyAmount: number;
      specialMonth: number | null;
      specialMonthAmount: number | null;
      source: string;
    } | null;
    amount: number;
  };
};

export type SalaryBreakdown = {
  month: MonthKey;
  daysInMonth: number;
  days: SalaryDayCounts & {
    /** Days paid: days in month less the deducted absent and unpaid days. */
    payable: number;
  };
  /** Every overtime hour, paid or not. */
  overtimeHours: number;
  /** Overtime hours on days whose shift allows overtime. */
  paidOvertimeHours: number;
  totalHours: number;
  baseMonthly: number;
  earnings: EarningsLine[];
  /** Sum of the components for a full month. */
  fullMonthGross: number;
  /** What proration took off for days before the salary starts. */
  notEmployedDeduction: number;
  /** What proration took off for absent days (0 with the switch off). */
  absentDeduction: number;
  /** What proration took off for unpaid leave (0 with the switch off). */
  unpaidLeaveDeduction: number;
  overtimePay: number;
  /** Earned components + overtime pay. */
  grossEarnings: number;
  pf: {
    /** Earned components counting for the PF wage. */
    wage: number;
    /** The wage PF is charged on, after the ceiling. */
    contributoryWage: number;
    employee: number;
    /** Employer EPF share (A/c 1): employer total − EPS. */
    employerEpf: number;
    /** Employer EPS share (A/c 10). */
    employerEps: number;
    employerTotal: number;
  };
  esi: { wage: number; employee: number; employer: number };
  professionalTax: number;
  otherDeductions: { name: string; amount: number; charged: number }[];
  otherDeductionsTotal: number;
  advances: { advanceId: string; due: number; recovered: number }[];
  advanceRecovered: number;
  /** PF + ESI + PT + other deductions + advance recovered (employee side). */
  totalDeductions: number;
  netPayable: number;
  /** What could not be taken because net would go negative; null when all was. */
  shortfall: {
    professionalTax: number;
    otherDeductions: number;
    advance: number;
  } | null;
  statutorySnapshot: StatutorySnapshot;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/** A day count as whole halves; 0.5 steps, 0 or more. */
function halves(value: number, field: string): number {
  const doubled = value * 2;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(doubled))
    throw invalid(
      "SALARY_DAYS_INVALID",
      "Day counts are 0 or more, in steps of 0.5.",
      `days.${field}`,
    );
  return doubled;
}

/** Hours as hundredths; 0 or more (more than 0 with `positive`), at most 24 a day unless `unbounded`. */
function hundredths(
  value: number,
  field: string,
  options: { positive?: boolean; unbounded?: boolean } = {},
): number {
  const scaled = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    Math.abs(value * 100 - scaled) > 1e-6 ||
    scaled < 0 ||
    (options.positive === true && scaled === 0) ||
    (options.unbounded !== true && scaled > 2400)
  )
    throw invalid(
      "SALARY_HOURS_INVALID",
      "Hours are 0 or more, at most 24 a day, with up to two decimals.",
      field,
    );
  return scaled;
}

/** `paise × percent / 100`, rounded half up to the whole rupee. */
function percentToRupeeHalfUp(paise: number, percent: string): number {
  const { numerator, scale } = parseDecimal(percent);
  return (
    Number(
      divideRounded(BigInt(paise) * numerator, 100n * pow10(scale) * 100n),
    ) * 100
  );
}

/** `paise × percent / 100`, rounded up to the next whole rupee. */
function percentToRupeeUp(paise: number, percent: string): number {
  const { numerator, scale } = parseDecimal(percent);
  const product = BigInt(paise) * numerator;
  const denominator = 100n * pow10(scale) * 100n;
  const rupees = (product + denominator - 1n) / denominator;
  return Number(rupees) * 100;
}

/** `a × b ÷ c` rounded half up, on bigint. */
function mulDiv(a: number, b: number, c: number): number {
  return Number(divideRounded(BigInt(a) * BigInt(b), BigInt(c)));
}

/** ESI contribution periods (ADR CM-0008): April–September and October–March. */
export function esiContributionPeriod(month: MonthKey): {
  start: MonthKey;
  end: MonthKey;
} {
  const number = monthNumber(month);
  if (number >= 4 && number <= 9) {
    const start = addMonths(month, 4 - number);
    return { start, end: addMonths(start, 5) };
  }
  const start = addMonths(month, number >= 10 ? 10 - number : -(number + 2));
  return { start, end: addMonths(start, 5) };
}

/**
 * Whether a member is ESI-eligible for a contribution period (ADR CM-0008):
 * their gross at the start of the period was within the ceiling (₹21,000
 * is eligible; ₹21,000.01 is not). Eligible means for the whole period,
 * even if a raise takes them above the ceiling.
 */
export function isEsiEligible(
  grossAtPeriodStart: number,
  rate: EsiRate | null,
): boolean {
  return rate != null && grossAtPeriodStart <= rate.wageCeiling;
}

/** Calculates one member's month. See the module comment for every rule. */
export function calculateSalary(
  input: SalaryCalculationInput,
): SalaryBreakdown {
  const { structure, statutory, month } = input;
  const days = daysOfMonth(month);
  const monthHalves = days * 2;

  const counts = input.days;
  const h = {
    workingDays: halves(counts.workingDays, "workingDays"),
    present: halves(counts.present, "present"),
    halfDays: halves(counts.halfDays, "halfDays"),
    absent: halves(counts.absent, "absent"),
    paidLeave: halves(counts.paidLeave, "paidLeave"),
    unpaidLeave: halves(counts.unpaidLeave, "unpaidLeave"),
    weekOff: halves(counts.weekOff, "weekOff"),
    holidays: halves(counts.holidays, "holidays"),
    notEmployed: halves(counts.notEmployed ?? 0, "notEmployed"),
  };
  if (!Number.isInteger(counts.halfDays))
    throw invalid(
      "SALARY_DAYS_INVALID",
      "Half days are counted in whole days.",
      "days.halfDays",
    );
  const accounted =
    h.present +
    h.halfDays +
    h.absent +
    h.paidLeave +
    h.unpaidLeave +
    h.weekOff +
    h.holidays +
    h.notEmployed;
  if (accounted > monthHalves || h.workingDays > monthHalves)
    throw invalid(
      "SALARY_DAYS_INVALID",
      `The day counts come to more than the ${String(days)} days in ${month}.`,
      "days",
    );

  // A half day is half absent (ADR CM-0012 §13).
  const absentOff = structure.deductAbsentDays ? h.absent + h.halfDays / 2 : 0;
  const unpaidOff = structure.deductUnpaidLeave ? h.unpaidLeave : 0;
  const notEmployedOff = h.notEmployed;
  const payableHalves = Math.max(
    0,
    monthHalves - absentOff - unpaidOff - notEmployedOff,
  );

  const components = componentAmounts(
    structure,
    input.employee.baseMonthly,
    input.employee.componentOverrides,
  );
  const fullMonthGross = components.reduce(
    (sum, line) => sum + line.monthly,
    0,
  );
  const earnings: EarningsLine[] = components.map((line) => ({
    componentId: line.componentId,
    name: line.name,
    monthly: line.monthly,
    earned: mulDiv(line.monthly, payableHalves, monthHalves),
    countsForPfWage: line.countsForPfWage,
  }));
  const earned = earnings.reduce((sum, line) => sum + line.earned, 0);
  const prorated = fullMonthGross - earned;
  // Days before the salary starts come off first; the rest is split
  // between absent days and unpaid leave in proportion.
  const notEmployedDeduction =
    notEmployedOff === 0
      ? 0
      : mulDiv(
          prorated,
          notEmployedOff,
          absentOff + unpaidOff + notEmployedOff,
        );
  let absentDeduction = 0;
  let unpaidLeaveDeduction = 0;
  if (absentOff + unpaidOff > 0) {
    absentDeduction = mulDiv(
      prorated - notEmployedDeduction,
      absentOff,
      absentOff + unpaidOff,
    );
    unpaidLeaveDeduction = prorated - notEmployedDeduction - absentDeduction;
  }

  // Overtime (ADR CM-0012 §14): 2 × gross ÷ days ÷ the day's shift hours.
  let overtimeHundredths = 0;
  let paidOvertimeHundredths = 0;
  let overtimePay = 0;
  input.overtime.forEach((day, index) => {
    const hours = hundredths(day.hours, `overtime.${String(index)}.hours`);
    overtimeHundredths += hours;
    if (!day.overtimeAllowed || hours === 0) return;
    const shiftHours = hundredths(
      day.shiftWorkingHours,
      `overtime.${String(index)}.shiftWorkingHours`,
      { positive: true },
    );
    paidOvertimeHundredths += hours;
    overtimePay += mulDiv(2 * fullMonthGross, hours, days * shiftHours);
  });
  const totalHours =
    hundredths(input.totalHours, "totalHours", { unbounded: true }) / 100;

  const grossEarnings = earned + overtimePay;

  // PF (ADR CM-0008).
  const pfRate = statutory.pf;
  const pfOn = structure.pf.applicable && pfRate != null;
  const pfWage = earnings
    .filter((line) => line.countsForPfWage)
    .reduce((sum, line) => sum + line.earned, 0);
  const pfCeiling = structure.pf.wageCeiling ?? pfRate?.wageCeiling ?? null;
  const contributoryWage =
    pfOn && structure.pf.capAtCeiling && pfCeiling != null
      ? Math.min(pfWage, pfCeiling)
      : pfWage;
  const pfEmployeePercent =
    structure.pf.employeePercent ?? pfRate?.employeePercent ?? null;
  const pfEmployee =
    pfOn && pfEmployeePercent != null
      ? percentToRupeeHalfUp(contributoryWage, pfEmployeePercent)
      : 0;
  const pfEmployerTotal = pfOn
    ? percentToRupeeHalfUp(contributoryWage, pfRate.employerPercent)
    : 0;
  const pfEmployerEps = pfOn
    ? Math.min(
        percentToRupeeHalfUp(
          Math.min(pfWage, pfRate.wageCeiling),
          pfRate.epsPercent,
        ),
        pfEmployerTotal,
      )
    : 0;

  // ESI (ADR CM-0008): eligibility comes from the period's start.
  const esiRate = statutory.esi;
  const esiOn =
    structure.esi.applicable && input.esiEligible && esiRate != null;
  const esiEmployeePercent =
    structure.esi.employeePercent ?? esiRate?.employeePercent ?? null;
  const esiEmployee =
    esiOn && esiEmployeePercent != null
      ? percentToRupeeUp(grossEarnings, esiEmployeePercent)
      : 0;
  const esiEmployer = esiOn
    ? percentToRupeeUp(grossEarnings, esiRate.employerPercent)
    : 0;

  // Professional tax.
  let ptBasis: StatutorySnapshot["pt"]["basis"] = "none";
  let ptSlab: PtSlab | null = null;
  let ptDue = 0;
  if (structure.pt.applicable) {
    if (structure.pt.monthlyAmount != null) {
      ptBasis = "flat";
      ptDue = grossEarnings > 0 ? structure.pt.monthlyAmount : 0;
    } else if (statutory.ptStateCode != null) {
      ptBasis = "slab";
      const charge = ptFor(statutory.ptSlabs, {
        stateCode: statutory.ptStateCode,
        month,
        gross: grossEarnings,
        gender: input.employee.gender,
      });
      ptSlab = charge.slab;
      ptDue = charge.amount;
    }
  }

  // Net never negative: PT, then other deductions, then advances are cut.
  let available = grossEarnings - pfEmployee - esiEmployee;
  const professionalTax = Math.min(ptDue, Math.max(0, available));
  available -= professionalTax;
  const otherDeductions = structure.otherDeductions.map((deduction) => {
    const charged = Math.min(deduction.amount, Math.max(0, available));
    available -= charged;
    return { name: deduction.name, amount: deduction.amount, charged };
  });
  const advances = input.advances.map((advance, index) => {
    if (!Number.isSafeInteger(advance.due) || advance.due < 0)
      throw invalid(
        "ADVANCE_DUE_INVALID",
        "An advance instalment is a whole number of paise, 0 or more.",
        `advances.${String(index)}.due`,
      );
    const recovered = Math.min(advance.due, Math.max(0, available));
    available -= recovered;
    return { advanceId: advance.advanceId, due: advance.due, recovered };
  });
  const otherDeductionsTotal = otherDeductions.reduce(
    (sum, line) => sum + line.charged,
    0,
  );
  const advanceRecovered = advances.reduce(
    (sum, line) => sum + line.recovered,
    0,
  );
  const shortfall = {
    professionalTax: ptDue - professionalTax,
    otherDeductions: otherDeductions.reduce(
      (sum, line) => sum + line.amount - line.charged,
      0,
    ),
    advance: advances.reduce((sum, line) => sum + line.due - line.recovered, 0),
  };
  const totalDeductions =
    pfEmployee +
    esiEmployee +
    professionalTax +
    otherDeductionsTotal +
    advanceRecovered;

  return {
    month,
    daysInMonth: days,
    days: { ...counts, payable: payableHalves / 2 },
    overtimeHours: overtimeHundredths / 100,
    paidOvertimeHours: paidOvertimeHundredths / 100,
    totalHours,
    baseMonthly: input.employee.baseMonthly,
    earnings,
    fullMonthGross,
    notEmployedDeduction,
    absentDeduction,
    unpaidLeaveDeduction,
    overtimePay,
    grossEarnings,
    pf: {
      wage: pfOn ? pfWage : 0,
      contributoryWage: pfOn ? contributoryWage : 0,
      employee: pfEmployee,
      employerEpf: pfEmployerTotal - pfEmployerEps,
      employerEps: pfEmployerEps,
      employerTotal: pfEmployerTotal,
    },
    esi: {
      wage: esiOn ? grossEarnings : 0,
      employee: esiEmployee,
      employer: esiEmployer,
    },
    professionalTax,
    otherDeductions,
    otherDeductionsTotal,
    advances,
    advanceRecovered,
    totalDeductions,
    netPayable: grossEarnings - totalDeductions,
    shortfall:
      shortfall.professionalTax +
        shortfall.otherDeductions +
        shortfall.advance >
      0
        ? shortfall
        : null,
    statutorySnapshot: {
      month,
      rounding: {
        earnings: "half_up_paisa",
        pf: "half_up_rupee",
        esi: "up_to_rupee",
      },
      pf: {
        applicable: structure.pf.applicable,
        rateEffectiveFrom: pfRate?.effectiveFrom ?? null,
        source: pfRate?.source ?? null,
        capAtCeiling: structure.pf.capAtCeiling,
        wageCeiling: pfCeiling,
        tableWageCeiling: pfRate?.wageCeiling ?? null,
        employeePercent: pfEmployeePercent,
        employerPercent: pfRate?.employerPercent ?? null,
        epsPercent: pfRate?.epsPercent ?? null,
        employeePercentOverridden: structure.pf.employeePercent != null,
        wageCeilingOverridden: structure.pf.wageCeiling != null,
      },
      esi: {
        applicable: structure.esi.applicable,
        eligible: input.esiEligible,
        rateEffectiveFrom: esiRate?.effectiveFrom ?? null,
        source: esiRate?.source ?? null,
        wageCeiling: esiRate?.wageCeiling ?? null,
        employeePercent: esiEmployeePercent,
        employerPercent: esiRate?.employerPercent ?? null,
        employeePercentOverridden: structure.esi.employeePercent != null,
      },
      pt: {
        applicable: structure.pt.applicable,
        basis: ptBasis,
        stateCode: ptBasis === "slab" ? statutory.ptStateCode : null,
        gender: input.employee.gender,
        slab:
          ptSlab == null
            ? null
            : {
                effectiveFrom: ptSlab.effectiveFrom,
                appliesTo: ptSlab.appliesTo,
                grossFrom: ptSlab.grossFrom,
                grossTo: ptSlab.grossTo,
                monthlyAmount: ptSlab.monthlyAmount,
                specialMonth: ptSlab.specialMonth,
                specialMonthAmount: ptSlab.specialMonthAmount,
                source: ptSlab.source,
              },
        amount: professionalTax,
      },
    },
  };
}

/**
 * The Salary Structure screen's sample (CM-314): a full month present for
 * a base salary, no overtime, no advance, ESI eligibility from that gross.
 */
export function sampleSalary(input: {
  structure: SalaryStructure;
  baseMonthly: number;
  month: MonthKey;
  statutory: SalaryStatutoryFigures;
  gender?: PtGender;
}): SalaryBreakdown {
  const days = daysOfMonth(input.month);
  const gross = componentAmounts(input.structure, input.baseMonthly).reduce(
    (sum, line) => sum + line.monthly,
    0,
  );
  return calculateSalary({
    structure: input.structure,
    employee: {
      baseMonthly: input.baseMonthly,
      componentOverrides: {},
      gender: input.gender ?? null,
    },
    month: input.month,
    days: {
      workingDays: days,
      present: days,
      halfDays: 0,
      absent: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      weekOff: 0,
      holidays: 0,
    },
    overtime: [],
    totalHours: 0,
    statutory: input.statutory,
    esiEligible: isEsiEligible(gross, input.statutory.esi),
    advances: [],
  });
}
