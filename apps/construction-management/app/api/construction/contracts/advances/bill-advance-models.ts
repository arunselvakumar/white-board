import { z } from "zod";

import type { BillAdvanceView } from "@/src/contracts/application/ra-bill-common";
import {
  ADVANCE_KINDS,
  DEDUCTION_KINDS,
  RECOVERY_MODES,
} from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";

/**
 * What a Contractor or Client Bill shows of its contract's advances
 * (CM-1108): each with what other approved bills recovered, what is left
 * and what this bill's gross suggests. Shared by both sides' models.
 */

/** The `advanceId` a recovery deduction names. */
export const billDeductionAdvanceId = z
  .uuid()
  .nullable()
  .optional()
  .describe(
    "Mobilisation and secured advance recoveries: the advance recovered, of this bill's contract (400 BILL_RECOVERY_ADVANCE_REQUIRED / BILL_RECOVERY_ADVANCE_INVALID / BILL_RECOVERY_KIND_MISMATCH / BILL_RECOVERY_DUPLICATE; above what is left, 400 BILL_RECOVERY_OVER_BALANCE with details.max). Ignored on other kinds.",
  );

const money = (description: string) =>
  z.int().nullable().describe(`${description} Null without Financial.`);

export const ConstructionContractsBillAdvanceModel = z.object({
  id: z.uuid(),
  kind: z.enum(ADVANCE_KINDS),
  recoveryKind: z
    .enum(DEDUCTION_KINDS)
    .describe("The deduction kind that recovers it."),
  advanceOn: z.string(),
  amount: money("Paise."),
  recoveryMode: z.enum(RECOVERY_MODES),
  recoveryPercent: z.string().nullable().describe('`percent`: "10.00".'),
  recoveryAmount: money("`fixed`: paise per bill."),
  recovered: money("Paise recovered on other approved bills."),
  balance: money("Paise left to recover before this bill."),
  suggested: money(
    "Paise this bill's gross suggests: min(the rule, what is left).",
  ),
});

export function toBillAdvancesResponse(
  advances: readonly BillAdvanceView[],
  financial: boolean,
): z.infer<typeof ConstructionContractsBillAdvanceModel>[] {
  const paise = (value: bigint) => (financial ? Number(value) : null);
  return advances.map((advance) => ({
    id: advance.id,
    kind: advance.kind,
    recoveryKind: advance.recoveryKind,
    advanceOn: advance.advanceOn,
    amount: paise(advance.amount),
    recoveryMode: advance.recoveryMode,
    recoveryPercent:
      advance.recoveryMode === "percent"
        ? fixedDecimal(advance.recoveryValue, PERCENT_SCALE)
        : null,
    recoveryAmount:
      advance.recoveryMode === "fixed" ? paise(advance.recoveryValue) : null,
    recovered: paise(advance.recovered),
    balance: paise(advance.balance),
    suggested: paise(advance.suggested),
  }));
}

/** Σ suggested mobilisation recoveries, or null when none (the CM-1106/1107 field). */
export function mobilisationSuggestion(
  advances: readonly BillAdvanceView[],
  financial: boolean,
): number | null {
  if (!financial) return null;
  const mobilisation = advances.filter(
    (advance) => advance.kind === "mobilisation" && advance.suggested > 0n,
  );
  if (mobilisation.length === 0) return null;
  return Number(
    mobilisation.reduce((sum, advance) => sum + advance.suggested, 0n),
  );
}
