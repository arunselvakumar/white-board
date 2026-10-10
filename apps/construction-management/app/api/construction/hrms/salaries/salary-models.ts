import { z } from "zod";

import type {
  CalculateResult,
  SalaryCapabilities,
  SalarySlipRecord,
  SkippedMember,
} from "@/src/hrms/application/salary-run-handlers";
import type { SalaryMonthTotals } from "@/src/hrms/application/salary-run-ports";
import {
  MAX_ADVANCE_INSTALMENTS,
  PAYMENT_MODES,
  SALARY_SLIP_KINDS,
  SALARY_SLIP_STATUSES,
} from "@/src/hrms/domain/salary-slip";

/**
 * Salary run models (CM-316, CM-317), menu `hrms.salaries`. Money is
 * integer paise. Amounts are null on others' slips without `financial`;
 * one's own slips always show them.
 */

const money = z.number().int().describe("Paise.");
const nullableMoney = money
  .nullable()
  .describe("Paise; null without `hrms.salaries` financial.");
const month = z.string().describe("`YYYY-MM`.");
const expectedUpdatedAt = z.iso
  .datetime()
  .describe("The `updatedAt` you loaded; a mismatch is 409.");

export const ConstructionHrmsSalarySlipModel = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  memberName: z.string(),
  designationName: z.string().nullable(),
  month,
  kind: z.enum(SALARY_SLIP_KINDS),
  status: z.enum(SALARY_SLIP_STATUSES),
  structureName: z.string().nullable(),
  /** The caller's own slip. */
  own: z.boolean(),
  amountsVisible: z.boolean(),
  days: z.object({
    daysInMonth: z.number().int(),
    workingDays: z.number(),
    present: z.number(),
    halfDays: z.number(),
    absent: z.number(),
    paidLeave: z.number(),
    unpaidLeave: z.number(),
    weekOff: z.number(),
    holidays: z.number(),
    notEmployed: z
      .number()
      .describe("Days before the member's salary started (a joiner)."),
    payable: z.number(),
    overtimeHours: z.number(),
    paidOvertimeHours: z.number(),
    totalHours: z.number(),
  }),
  amounts: z
    .object({
      baseMonthly: money,
      fullMonthGross: money,
      notEmployedDeduction: money,
      absentDeduction: money,
      unpaidLeaveDeduction: money,
      overtimePay: money,
      grossEarnings: money,
      pfEmployee: money,
      esiEmployee: money,
      professionalTax: money,
      otherDeductions: money,
      advanceRecovered: money,
      totalDeductions: money,
      netPayable: money,
      pfEmployer: money.describe("Employer EPF share (A/c 1)."),
      epsEmployer: money.describe("Employer EPS share (A/c 10)."),
      esiEmployer: money,
      components: z.array(
        z.object({ name: z.string(), monthly: money, earned: money }),
      ),
      otherDeductionLines: z.array(
        z.object({ name: z.string(), amount: money, charged: money }),
      ),
      shortfall: z
        .object({
          professionalTax: money,
          otherDeductions: money,
          advance: money,
        })
        .nullable()
        .describe("What could not be taken so net pay stays 0 or more."),
    })
    .nullable()
    .describe("Null without `hrms.salaries` financial (others' slips)."),
  statutory: z.object({
    pfApplicable: z
      .boolean()
      .describe("The slip has PF: its member belongs in the ECR."),
    esiEligible: z.boolean(),
    esiApplicable: z
      .boolean()
      .describe(
        "ESI was charged (on in the structure and eligible): the member belongs in the ESI upload.",
      ),
    esiBasisMonth: z.string().nullable(),
    uan: z.string().nullable(),
    esiIpNumber: z.string().nullable(),
  }),
  advance: z
    .object({
      amount: nullableMoney,
      instalments: z.number().int(),
      advanceDate: z.string(),
      firstRecoveryMonth: month,
      reason: z.string().nullable(),
      recovered: nullableMoney.describe(
        "Recovered on Approved or Paid slips; null without financial.",
      ),
    })
    .nullable()
    .describe("On an advance slip: the advance it paid."),
  approvedAt: z.iso.datetime().nullable(),
  paidAt: z.iso.datetime().nullable(),
  payment: z
    .object({
      mode: z.enum(PAYMENT_MODES),
      date: z.string(),
      reference: z.string().nullable(),
    })
    .nullable(),
  hasPayslip: z
    .boolean()
    .describe(
      "An Approved or Paid regular slip: the payslip PDF can be downloaded.",
    ),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsSalarySlipModel = z.infer<
  typeof ConstructionHrmsSalarySlipModel
>;

const SkippedModel = z.object({
  memberId: z.uuid(),
  name: z.string(),
  designationName: z.string().nullable(),
  reason: z.enum([
    "not_joined",
    "not_configured",
    "starts_later",
    "not_calculated",
    "calculation_failed",
  ]),
  message: z.string(),
});

export const ListConstructionHrmsTeamSalariesQueryModel = z.object({
  month: month,
});

export const ListConstructionHrmsTeamSalariesResponseModel = z.object({
  month,
  items: z.array(ConstructionHrmsSalarySlipModel),
  skipped: z
    .array(SkippedModel)
    .describe("Live Team Members without a regular slip this month, and why."),
  totals: z
    .object({
      slips: z.number().int(),
      grossEarnings: money,
      deductions: money,
      netPayable: money,
      employerContributions: money,
      advancesPaid: money,
    })
    .nullable()
    .describe("Regular slips' totals (64-bit sums); null without financial."),
  can: z.object({
    calculate: z.boolean(),
    approve: z.boolean(),
    markPaid: z.boolean(),
    payAdvance: z.boolean(),
    report: z.boolean(),
    financial: z.boolean(),
    viewAll: z.boolean(),
    exportReturns: z
      .boolean()
      .describe("PF ECR and ESI exports: `export` and `financial`."),
  }),
  myMemberId: z.uuid().nullable(),
});

export type ListConstructionHrmsTeamSalariesResponseModel = z.infer<
  typeof ListConstructionHrmsTeamSalariesResponseModel
>;

export const ListConstructionHrmsMySalariesResponseModel = z.object({
  member: z
    .object({
      memberId: z.uuid(),
      name: z.string(),
      designationName: z.string().nullable(),
    })
    .nullable(),
  items: z.array(ConstructionHrmsSalarySlipModel),
});

export type ListConstructionHrmsMySalariesResponseModel = z.infer<
  typeof ListConstructionHrmsMySalariesResponseModel
>;

export const ConstructionHrmsSalaryIdParamsModel = z.object({ id: z.uuid() });

export const CalculateConstructionHrmsSalariesRequestModel = z.object({
  month: month,
  memberIds: z
    .array(z.uuid())
    .max(500)
    .nullish()
    .describe("Only these members; every live member when left out."),
});

export const CalculateConstructionHrmsSalariesResponseModel = z.object({
  month,
  calculated: z.number().int(),
  kept: z.number().int().describe("Approved or Paid slips left as they are."),
  skipped: z.array(SkippedModel),
});

export type CalculateConstructionHrmsSalariesResponseModel = z.infer<
  typeof CalculateConstructionHrmsSalariesResponseModel
>;

export const RecalculateConstructionHrmsSalaryRequestModel = z.object({
  id: z.uuid(),
  expectedUpdatedAt,
});

const slipVersions = z
  .array(z.object({ id: z.uuid(), expectedUpdatedAt }))
  .max(500)
  .describe("The slips, each with the `updatedAt` you loaded.");

export const ApproveConstructionHrmsSalariesRequestModel = z.object({
  slips: slipVersions,
});

export const MarkConstructionHrmsSalariesPaidRequestModel = z.object({
  slips: slipVersions,
  mode: z.string().describe("`cash` or `bank`."),
  paymentDate: z.string().describe("`YYYY-MM-DD`, not after today."),
  reference: z.string().nullish(),
});

export const ConstructionHrmsSalarySlipsResponseModel = z.object({
  items: z.array(ConstructionHrmsSalarySlipModel),
});

export type ConstructionHrmsSalarySlipsResponseModel = z.infer<
  typeof ConstructionHrmsSalarySlipsResponseModel
>;

export const PayConstructionHrmsAdvanceSalaryRequestModel = z.object({
  memberId: z.uuid(),
  amount: z.number().describe("Paise, above 0."),
  instalments: z
    .number()
    .nullish()
    .describe(
      `Recovered over 1–${String(MAX_ADVANCE_INSTALMENTS)} later regular slips; 1 when left out.`,
    ),
  advanceDate: z.string().describe("`YYYY-MM-DD`, not after today."),
  mode: z.string().describe("`cash` or `bank`."),
  reference: z.string().nullish(),
  reason: z.string().nullish(),
});

export const RunConstructionHrmsScheduledSalaryResponseModel = z.object({
  companies: z.number().int(),
  calculated: z.number().int(),
});

export type RunConstructionHrmsScheduledSalaryResponseModel = z.infer<
  typeof RunConstructionHrmsScheduledSalaryResponseModel
>;

export const GetConstructionHrmsTeamSalaryReportQueryModel = z.object({
  month: month,
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toSalarySlipModel(
  record: SalarySlipRecord,
): ConstructionHrmsSalarySlipModel {
  const { slip, member } = record;
  const details = slip.details;
  const visible = record.amountsVisible;
  const m = slip.money;
  const snapshotEsi = slip.statutorySnapshot["esi"];
  const esiEligible =
    snapshotEsi != null &&
    typeof snapshotEsi === "object" &&
    (snapshotEsi as { eligible?: unknown }).eligible === true;
  const esiApplicable =
    esiEligible &&
    (snapshotEsi as { applicable?: unknown }).applicable === true &&
    (snapshotEsi as { rateEffectiveFrom?: unknown }).rateEffectiveFrom != null;
  const snapshotPf = slip.statutorySnapshot["pf"];
  const pfApplicable =
    snapshotPf != null &&
    typeof snapshotPf === "object" &&
    (snapshotPf as { applicable?: unknown }).applicable === true &&
    (snapshotPf as { rateEffectiveFrom?: unknown }).rateEffectiveFrom != null;
  return {
    id: slip.id,
    memberId: slip.memberId,
    memberName: member.name,
    designationName: member.designationName,
    month: slip.month,
    kind: slip.kind,
    status: slip.status,
    structureName: details?.structureName ?? null,
    own: record.own,
    amountsVisible: visible,
    days: {
      daysInMonth: slip.days.daysInMonth,
      workingDays: slip.days.workingDays,
      present: slip.days.present,
      halfDays: slip.days.halfDays,
      absent: slip.days.absent,
      paidLeave: slip.days.paidLeave,
      unpaidLeave: slip.days.unpaidLeave,
      weekOff: slip.days.weekOff,
      holidays: slip.days.holidays,
      notEmployed: details?.notEmployedDays ?? 0,
      payable: slip.days.payable,
      overtimeHours: slip.days.overtimeHours,
      paidOvertimeHours: details?.paidOvertimeHours ?? slip.days.overtimeHours,
      totalHours: slip.days.totalHours,
    },
    amounts: visible
      ? {
          baseMonthly: m.baseMonthly,
          fullMonthGross:
            details?.fullMonthGross ??
            slip.components.reduce((sum, line) => sum + line.monthly, 0),
          notEmployedDeduction: details?.notEmployedDeduction ?? 0,
          absentDeduction: m.absentDeduction,
          unpaidLeaveDeduction: m.unpaidLeaveDeduction,
          overtimePay: m.overtimePay,
          grossEarnings: m.grossEarnings,
          pfEmployee: m.pfEmployee,
          esiEmployee: m.esiEmployee,
          professionalTax: m.professionalTax,
          otherDeductions: m.otherDeductions,
          advanceRecovered: m.advanceRecovered,
          totalDeductions:
            m.pfEmployee +
            m.esiEmployee +
            m.professionalTax +
            m.otherDeductions +
            m.advanceRecovered,
          netPayable: m.netPayable,
          pfEmployer: m.pfEmployer,
          epsEmployer: m.epsEmployer,
          esiEmployer: m.esiEmployer,
          components: slip.components.map((line) => ({
            name: line.name,
            monthly: line.monthly,
            earned: line.earned,
          })),
          otherDeductionLines: details?.otherDeductions ?? [],
          shortfall: details?.shortfall ?? null,
        }
      : null,
    statutory: {
      pfApplicable,
      esiEligible,
      esiApplicable,
      esiBasisMonth: details?.esi.basisMonth ?? null,
      uan: details?.employee.uan ?? null,
      esiIpNumber: details?.employee.esiIpNumber ?? null,
    },
    advance:
      slip.advance == null
        ? null
        : {
            amount: visible ? slip.advance.amount : null,
            instalments: slip.advance.instalments,
            advanceDate: slip.advance.advanceDate,
            firstRecoveryMonth: slip.advance.firstRecoveryMonth,
            reason: slip.advance.reason,
            recovered: visible ? slip.advance.recovered : null,
          },
    approvedAt: slip.approvedAt?.toISOString() ?? null,
    paidAt: slip.paidAt?.toISOString() ?? null,
    payment: slip.payment,
    hasPayslip: slip.kind === "regular" && slip.status !== "calculated",
    updatedAt: slip.updatedAt.toISOString(),
  };
}

export function toSkippedModel(item: SkippedMember) {
  return { ...item };
}

export function toCalculateModel(
  result: CalculateResult,
): CalculateConstructionHrmsSalariesResponseModel {
  return {
    month: result.month,
    calculated: result.calculated,
    kept: result.kept,
    skipped: result.skipped.map(toSkippedModel),
  };
}

export function toTeamModel(view: {
  month: string;
  records: SalarySlipRecord[];
  skipped: SkippedMember[];
  totals: SalaryMonthTotals | null;
  can: SalaryCapabilities;
  myMemberId: string | null;
}): ListConstructionHrmsTeamSalariesResponseModel {
  return {
    month: view.month,
    items: view.records.map(toSalarySlipModel),
    skipped: view.skipped.map(toSkippedModel),
    totals: view.totals,
    can: view.can,
    myMemberId: view.myMemberId,
  };
}
