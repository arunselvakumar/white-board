import { z } from "zod";

import type { ReconciliationStatement } from "@/src/contracts/application/reconciliation-handlers";
import {
  BILL_STATUSES,
  ISSUE_BASES,
  WORK_ORDER_STATUSES,
} from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import { reconciliationQuantityText } from "@/src/contracts/domain/material-reconciliation";

/**
 * A Work Order's material reconciliation statement (CM-1110, ADR CM-0023
 * §10). Quantities are strings with three places in the material's UoM;
 * money is paise, null without Work Order Financial.
 */

export const GetConstructionContractsWorkOrderReconciliationRequestModel =
  z.object({
    billId: z
      .uuid()
      .optional()
      .describe(
        "A live running bill of the Work Order (404 BILL_NOT_FOUND). Left out: the latest approved bill, else the open one, else to date.",
      ),
  });

const quantity = (description: string) =>
  z.string().describe(`${description} Three places, in the material's UoM.`);
const money = (description: string) =>
  z.int().nullable().describe(`${description} Null without Financial.`);

export const ConstructionContractsReconciliationBillModel = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  ordinal: z.int().nullable(),
  status: z.enum(BILL_STATUSES),
  billDate: z.string(),
  measuredUpTo: z
    .string()
    .describe("Issues delivered on or before this date count."),
});

const IssueModel = z.object({
  id: z.uuid().describe("The Delivery Note line."),
  deliveryNoteId: z.uuid(),
  deliveryNoteNumber: z.string(),
  materialRequestId: z.uuid(),
  materialRequestNumber: z.string(),
  date: z.string().describe("The Delivery Note's “delivered on”."),
  materialId: z.uuid(),
  quantity: quantity("Delivered."),
  how: z
    .enum(["named", "auto", "unattributed"])
    .describe(
      "`named`: the Material Request names the Work Order; `auto`: the only open Work Order of the Contractor listing the material; `unattributed`: none or several could.",
    ),
});

export const ConstructionContractsWorkOrderReconciliationResponseModel =
  z.object({
    workOrder: z.object({
      id: z.uuid(),
      number: z.string().nullable(),
      projectId: z.uuid(),
      contractorId: z.uuid(),
      contractorName: z.string(),
      status: z.enum(WORK_ORDER_STATUSES),
    }),
    bill: ConstructionContractsReconciliationBillModel.nullable().describe(
      "The bill the statement is cumulative to; null: to date.",
    ),
    bills: z
      .array(ConstructionContractsReconciliationBillModel)
      .describe(
        "Running bills to pick (not rejected or reversed), newest first.",
      ),
    materials: z.array(
      z.object({
        materialId: z.uuid(),
        materialName: z.string(),
        uomName: z.string(),
        issueBasis: z.enum(ISSUE_BASES),
        wastagePercent: z.string(),
        issueRate: money("Paise per UoM, at cost."),
        penalRate: money("Paise per UoM on the excess."),
        theoretical: quantity(
          "Σ billed quantity × coefficient over approved running bills up to and including the bill.",
        ),
        allowed: quantity("Theoretical × (1 + wastage %)."),
        underUseLimit: quantity("Theoretical × (1 − wastage %)."),
        issued: quantity("Issues counted towards the Work Order."),
        returned: quantity("Returns (none until procurement records them)."),
        netIssued: quantity("Issued − returned."),
        excess: quantity("max(0, net issued − allowed)."),
        underUse: z
          .boolean()
          .describe(
            "Net issued below the under-use limit: work may be short of material.",
          ),
        excessValue: money("Paise: cumulative excess × penal rate."),
        recoveredBefore: money("Paise recovered on earlier approved bills."),
        recoverySuggested: money(
          "Paise: excess value less what earlier bills recovered.",
        ),
        onThisBill: money(
          "Paise of material reconciliation recovery on the bill itself; null when it has none.",
        ),
        reason: z
          .string()
          .nullable()
          .describe("The reason on a recovery above its suggestion."),
        atCostValue: money("Paise: net issued × issue rate, at cost."),
        atCostDeductedBefore: money(
          "Paise of material at cost deducted on earlier approved bills.",
        ),
        atCostSuggested: money("Paise: at-cost value not yet deducted."),
        atCostOnThisBill: money(
          "Paise of material at cost on the bill itself; null when it has none.",
        ),
      }),
    ),
    issues: z.array(IssueModel).describe("Issues counted, up to the bill."),
    unattributed: z
      .array(
        IssueModel.extend({
          candidates: z
            .int()
            .describe(
              "Open Work Orders of the Contractor listing the material on that date (0 or several).",
            ),
        }),
      )
      .describe(
        "Issues of the Work Order's materials to its Contractor that no rule attributes; assign one with POST /api/construction/procurement/material-requests/{id}/assign-work-order.",
      ),
    returnsRecorded: z
      .boolean()
      .describe("False: procurement records no returns from Contractors yet."),
    financial: z.boolean(),
    canAssign: z
      .boolean()
      .describe(
        "Material Requests update on the Project: may assign unattributed issues.",
      ),
  });
export type ConstructionContractsWorkOrderReconciliationResponseModel = z.infer<
  typeof ConstructionContractsWorkOrderReconciliationResponseModel
>;

export function toWorkOrderReconciliationResponse(
  statement: ReconciliationStatement,
  canAssign: boolean,
): ConstructionContractsWorkOrderReconciliationResponseModel {
  const { financial } = statement;
  const paise = (value: bigint | null) =>
    financial && value != null ? Number(value) : null;
  const q = reconciliationQuantityText;
  const issue = (row: ReconciliationStatement["issues"][number]) => ({
    id: row.id,
    deliveryNoteId: row.deliveryNoteId,
    deliveryNoteNumber: row.deliveryNoteNumber,
    materialRequestId: row.materialRequestId,
    materialRequestNumber: row.materialRequestNumber,
    date: row.date,
    materialId: row.materialId,
    quantity: fixedDecimal(row.quantity, 3),
    how: row.how,
  });
  return {
    workOrder: statement.workOrder,
    bill: statement.bill,
    bills: statement.bills,
    materials: statement.materials.map((row) => ({
      materialId: row.materialId,
      materialName: row.materialName,
      uomName: row.uomName,
      issueBasis: row.terms.issueBasis,
      wastagePercent: fixedDecimal(row.terms.wastagePercent, PERCENT_SCALE),
      issueRate: paise(row.terms.issueRate),
      penalRate: paise(row.terms.penalRate),
      theoretical: q(row.theoretical),
      allowed: q(row.allowed),
      underUseLimit: q(row.underUseLimit),
      issued: q(row.issued),
      returned: q(row.returned),
      netIssued: q(row.netIssued),
      excess: q(row.excess),
      underUse: row.underUse,
      excessValue: paise(row.excessValue),
      recoveredBefore: paise(row.recoveredBefore),
      recoverySuggested: paise(row.recoverySuggested),
      onThisBill: paise(row.onThisBill),
      reason: row.reason,
      atCostValue: paise(row.atCostValue),
      atCostDeductedBefore: paise(row.atCostDeductedBefore),
      atCostSuggested: paise(row.atCostSuggested),
      atCostOnThisBill: paise(row.atCostOnThisBill),
    })),
    issues: statement.issues.map(issue),
    unattributed: statement.unattributed.map((row) => ({
      ...issue(row),
      candidates: row.candidates,
    })),
    returnsRecorded: statement.returnsRecorded,
    financial,
    canAssign,
  };
}
