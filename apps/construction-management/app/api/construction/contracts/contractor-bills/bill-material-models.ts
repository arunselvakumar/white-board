import { z } from "zod";

import type { BillMaterialView } from "@/src/contracts/application/contractor-bill-handlers";
import { ISSUE_BASES } from "@/src/contracts/domain/contract-terms";
import { reconciliationQuantityText } from "@/src/contracts/domain/material-reconciliation";

/**
 * What a Contractor Bill shows of its Work Order's material
 * reconciliation (CM-1110): per material it issues, the excess at this
 * bill and what the bill may recover, at the penal rate and at cost.
 */

/** The `materialId` a material deduction names. */
export const billDeductionMaterialId = z
  .uuid()
  .nullable()
  .optional()
  .describe(
    "Material reconciliation recovery (required) and material issued at cost (optional): a Material the Work Order issues (400 BILL_MATERIAL_REQUIRED, BILL_MATERIAL_INVALID, BILL_MATERIAL_DUPLICATE). A recovery above its suggestion needs a reason in `description` (400 BILL_MATERIAL_RECOVERY_REASON_REQUIRED, details.max) and Contractor Bills Approve (403 BILL_MATERIAL_RECOVERY_OVER_SUGGESTION). Ignored on other kinds and on Client Bills.",
  );

const money = (description: string) =>
  z.int().nullable().describe(`${description} Null without Financial.`);

export const ConstructionContractsBillMaterialModel = z.object({
  materialId: z.uuid(),
  materialName: z.string(),
  uomName: z.string(),
  issueBasis: z.enum(ISSUE_BASES),
  excess: z
    .string()
    .describe("Cumulative excess over the allowed quantity, three places."),
  penalRate: money("Paise per UoM charged on the excess."),
  recoveredBefore: money("Paise recovered on earlier approved bills."),
  recoverySuggested: money(
    "Paise: excess × penal rate less what earlier bills recovered; the most this bill recovers without Approve.",
  ),
  atCostDeductedBefore: money(
    "Paise of material issued at cost deducted on earlier approved bills.",
  ),
  atCostSuggested: money(
    "Paise: at-cost issues × issue rate not yet deducted.",
  ),
});

export function toBillMaterialsResponse(
  rows: readonly BillMaterialView[],
  financial: boolean,
): z.infer<typeof ConstructionContractsBillMaterialModel>[] {
  const paise = (value: bigint | null) =>
    financial && value != null ? Number(value) : null;
  return rows.map((row) => ({
    materialId: row.materialId,
    materialName: row.materialName,
    uomName: row.uomName,
    issueBasis: row.issueBasis,
    excess: reconciliationQuantityText(row.excess),
    penalRate: paise(row.penalRate),
    recoveredBefore: paise(row.recoveredBefore),
    recoverySuggested: paise(row.recoverySuggested),
    atCostDeductedBefore: paise(row.atCostDeductedBefore),
    atCostSuggested: paise(row.atCostSuggested),
  }));
}
