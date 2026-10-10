import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { MonthKey } from "../domain/calendar";
import type { PayslipDocument } from "../domain/payslip";
import type {
  AdvanceForRecovery,
  SalaryAdvanceTerms,
  SalaryPayment,
  SalarySlipKind,
  SalarySlipStatus,
} from "../domain/salary-slip";

/**
 * Where salary runs live (CM-316), as interfaces; Prisma implements them
 * in infrastructure. Every method is scoped to one Company. Money is
 * integer paise; sums across members are 64-bit (ADR CM-0004).
 */

export type SalarySlipDays = {
  daysInMonth: number;
  workingDays: number;
  present: number;
  halfDays: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  weekOff: number;
  holidays: number;
  payable: number;
  overtimeHours: number;
  totalHours: number;
};

export type SalarySlipMoney = {
  baseMonthly: number;
  overtimePay: number;
  grossEarnings: number;
  pfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  absentDeduction: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  advanceRecovered: number;
  netPayable: number;
  /** Employer EPF share (A/c 1). */
  pfEmployer: number;
  /** Employer EPS share (A/c 10). */
  epsEmployer: number;
  esiEmployer: number;
};

export type SalarySlipComponent = {
  componentId: string;
  name: string;
  monthly: number;
  earned: number;
};

/**
 * What the slip keeps beside its columns, under `statutory_snapshot.slip`:
 * the figures the payslip prints that have no column of their own.
 */
export type SalarySlipDetails = {
  structureName: string;
  /** Full-month gross: the rate of wages ESI eligibility is decided on. */
  fullMonthGross: number;
  salaryStartsOn: CalendarDate | null;
  notEmployedDays: number;
  notEmployedDeduction: number;
  paidOvertimeHours: number;
  otherDeductions: { name: string; amount: number; charged: number }[];
  shortfall: {
    professionalTax: number;
    otherDeductions: number;
    advance: number;
  } | null;
  esi: { basisMonth: MonthKey; basisGross: number };
  employee: {
    name: string;
    designationName: string | null;
    uan: string | null;
    esiIpNumber: string | null;
  };
};

export type StoredSalaryAdvance = {
  id: string;
  amount: number;
  instalments: number;
  advanceDate: CalendarDate;
  firstRecoveryMonth: MonthKey;
  reason: string | null;
  /** Recovered on Approved or Paid slips. */
  recovered: number;
};

export type StoredSalarySlip = {
  id: string;
  runId: string | null;
  memberId: string;
  month: MonthKey;
  kind: SalarySlipKind;
  status: SalarySlipStatus;
  structureId: string | null;
  days: SalarySlipDays;
  money: SalarySlipMoney;
  components: SalarySlipComponent[];
  /** The statutory figures used (ADR CM-0008) plus `slip` details. */
  statutorySnapshot: Record<string, unknown>;
  details: SalarySlipDetails | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  paidBy: string | null;
  paidAt: Date | null;
  payment: SalaryPayment | null;
  payslipKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** On a regular slip: the advance instalments it recovers. */
  recoveries: { advanceId: string; amount: number }[];
  /** On an advance slip: the advance it paid. */
  advance: StoredSalaryAdvance | null;
};

/** A Calculated slip to write: new, or replacing the one the run read. */
export type CalculatedSlipWrite = {
  memberId: string;
  /** The Calculated slip it replaces, as read; null for a new slip. */
  replaces: { id: string; updatedAt: Date } | null;
  structureId: string;
  days: SalarySlipDays;
  money: SalarySlipMoney;
  components: SalarySlipComponent[];
  statutorySnapshot: Record<string, unknown>;
  recoveries: { advanceId: string; amount: number }[];
};

export type SlipVersion = { id: string; expectedUpdatedAt: Date };

/** Month totals; every sum is 64-bit in SQL. */
export type SalaryMonthTotals = {
  slips: number;
  grossEarnings: number;
  deductions: number;
  netPayable: number;
  employerContributions: number;
  advancesPaid: number;
};

export type AdvanceDueSource = {
  advance: AdvanceForRecovery;
  /** Recovered on live regular slips of earlier months. */
  recoveredBefore: number;
};

export type SalaryRunStore = {
  /** Live slips of the month (regular and advance), oldest member first. */
  listMonth(workspaceId: string, month: MonthKey): Promise<StoredSalarySlip[]>;
  /** A member's live slips, newest month first. */
  listMember(
    workspaceId: string,
    memberId: string,
  ): Promise<StoredSalarySlip[]>;
  find(workspaceId: string, id: string): Promise<StoredSalarySlip | null>;
  findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, StoredSalarySlip>>;
  totals(workspaceId: string, month: MonthKey): Promise<SalaryMonthTotals>;
  /** Whether the month has a run (any slip was ever calculated). */
  runExists(workspaceId: string, month: MonthKey): Promise<boolean>;
  /**
   * Each member's earliest live regular slip with a month in
   * [`from`, `before`), with its full-month gross (ESI period basis).
   */
  periodFirstSlips(
    workspaceId: string,
    memberIds: readonly string[],
    from: MonthKey,
    before: MonthKey,
  ): Promise<Map<string, { month: MonthKey; fullMonthGross: number }>>;
  /** Advances whose recovery has started by `month`, not yet recovered before it. */
  advancesDue(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, AdvanceDueSource[]>>;
  /** Each member's earliest live salary configuration start. */
  salaryStarts(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<Map<string, CalendarDate>>;
  /**
   * Writes the month's Calculated slips in one transaction (the month's
   * run serialised): a new slip, or one replacing a Calculated slip still
   * as read (else 409 `SALARY_SLIP_CHANGED`), with its advance recoveries
   * and an audit event each.
   */
  saveCalculated(input: {
    workspaceId: string;
    month: MonthKey;
    writes: readonly CalculatedSlipWrite[];
    by: string;
    now: Date;
  }): Promise<string[]>;
  /**
   * Approves Calculated slips still as read, all or none (409
   * `SALARY_SLIP_CHANGED` / `SALARY_SLIP_ALREADY_APPROVED`), and locks
   * each member's month (ADR CM-0012 §17), with audit events.
   */
  approve(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    by: string;
    now: Date;
  }): Promise<void>;
  /** Marks Approved slips still as read Paid, all or none, with audit events. */
  markPaid(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    payment: SalaryPayment;
    by: string;
    now: Date;
  }): Promise<void>;
  /**
   * Records an advance and the Paid advance slip that paid it; recovery
   * starts in the advance's month unless that month's regular slip is
   * already approved (then the next month). Returns the slip id.
   */
  payAdvance(input: {
    workspaceId: string;
    memberId: string;
    terms: SalaryAdvanceTerms;
    by: string;
    now: Date;
  }): Promise<string>;
  /** Companies with automatic salary calculation on, with their day. */
  autoSalaryCompanies(): Promise<{ workspaceId: string; day: number }[]>;
  /** Today in the Company's time zone. */
  today(workspaceId: string): Promise<CalendarDate>;
};

/** The Company as printed on a payslip. */
export type SalaryCompanyProfile = {
  name: string;
  currency: string;
  timezone: string;
};

export type SalaryCompanyReader = {
  profileFor(workspaceId: string): Promise<SalaryCompanyProfile>;
};

/** Renders a payslip as a PDF. */
export type PayslipRenderer = {
  render(document: PayslipDocument): Promise<Uint8Array>;
};

/**
 * Payslip PDFs in private storage, immutable once stored (`modules/10`
 * rebuild 6): the first one stored for a slip is kept forever.
 */
export type PayslipFiles = {
  read(key: string): Promise<Uint8Array | null>;
  /**
   * Stores the PDF and points the slip at it, unless another request did
   * first; returns the key the slip now has and whether it is this one.
   * Records the file and an audit event.
   */
  store(input: {
    workspaceId: string;
    slipId: string;
    bytes: Uint8Array;
    by: string;
    now: Date;
  }): Promise<{ key: string; ours: boolean }>;
};
