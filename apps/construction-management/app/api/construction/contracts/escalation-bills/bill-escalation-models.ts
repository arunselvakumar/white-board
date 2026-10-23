import { z } from "zod";

import type { OutstandingEscalation } from "@/src/contracts/application/escalation-recoveries";
import { BILL_TYPES } from "@/src/contracts/domain/contract-terms";

/**
 * What running bills (RA) carry about escalation (CM-1109): the type and
 * period on list rows, the negative escalation bill an "other" deduction
 * recovers, and the contract's escalation bills still to recover.
 */

export const billTypeField = z
  .enum(BILL_TYPES)
  .describe("`running` (an RA bill) or `escalation` (CM-1109).");

export const billPeriodFields = {
  periodFrom: z
    .string()
    .nullable()
    .describe(
      "Escalation bills: the first day of the period; null on RA bills.",
    ),
  periodTo: z
    .string()
    .nullable()
    .describe(
      "Escalation bills: the last day of the period; null on RA bills.",
    ),
};

export const billTypeFilter = z
  .enum(BILL_TYPES)
  .optional()
  .describe("Running (RA) or escalation bills; both when left out.");

/** The `escalationBillId` an "other" deduction names. */
export const billDeductionEscalationBillId = z
  .uuid()
  .nullable()
  .optional()
  .describe(
    "An `other` deduction recovering an approved negative escalation bill of the same contract (400 BILL_ESCALATION_RECOVERY_INVALID, BILL_ESCALATION_RECOVERY_DUPLICATE, BILL_ESCALATION_RECOVERY_OVER_BALANCE).",
  );

export const ConstructionContractsBillEscalationRecoveryModel = z.object({
  escalationBillId: z.uuid(),
  number: z.string().nullable(),
  periodFrom: z.string(),
  periodTo: z.string(),
  amount: z
    .int()
    .nullable()
    .describe(
      "Paise to recover: the negative escalation's size. Null without Financial.",
    ),
  recovered: z
    .int()
    .nullable()
    .describe("Paise recovered on other approved bills."),
  balance: z.int().nullable().describe("Paise still to recover."),
  reason: z
    .string()
    .describe(
      "The deduction reason a recovery carries: “Escalation recovery on …”.",
    ),
});

export function toBillEscalationRecoveriesResponse(
  rows: readonly OutstandingEscalation[],
  financial: boolean,
): z.infer<typeof ConstructionContractsBillEscalationRecoveryModel>[] {
  const paise = (value: bigint) => (financial ? Number(value) : null);
  return rows.map((row) => ({
    escalationBillId: row.id,
    number: row.number,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    amount: paise(row.amount),
    recovered: paise(row.recovered),
    balance: paise(row.balance),
    reason: row.reason,
  }));
}
