import { z } from "zod";

import type {
  PartyBalancesReadModel,
  StatementReadModel,
} from "@/src/labour/application/balance-handlers";
import type { PeriodSummary } from "@/src/labour/domain/ledger";

export const BALANCES_PATH = "/api/construction/labour/balances";

const partyType = z.enum(["labour", "vendor"]);

// Requests

export const GetConstructionLabourBalancesRequestModel = z.object({
  projectId: z.uuid(),
  partyType,
  /** Monthly (calendar month), weekly (Monday to Sunday) or custom. */
  kind: z.enum(["monthly", "weekly", "custom"]).optional().default("monthly"),
  /** A day in the period (monthly, weekly) or its first day (custom); defaults to today. */
  anchor: z.iso.date().optional(),
  /** Custom only: the last day (defaults to `anchor`). */
  to: z.iso.date().optional(),
});

export const GetConstructionLabourStatementRequestModel = z.object({
  /** The Project the screen is on; the party must be on it or have entries in it. */
  projectId: z.uuid(),
  partyType,
  partyId: z.uuid(),
  from: z.iso.date(),
  /** At most 3660 days after `from`. */
  to: z.iso.date(),
});

// Responses (paise; null without the menu's Financial flag)

const money = z.int().nullable();

export const ConstructionLabourPeriodSummaryResponseModel = z.object({
  /** Owed before the period (opening balance included). */
  previousBalance: money,
  earned: money,
  overtime: money,
  /** earned + overtime in the period. */
  toPay: money,
  /** Advances paid in the period. */
  advance: money,
  /** Payments made in the period. */
  paid: money,
  /** previousBalance + toPay − advance − paid. */
  finalAmount: money,
});

export const ConstructionLabourBalanceRowResponseModel =
  ConstructionLabourPeriodSummaryResponseModel.extend({
    partyId: z.uuid(),
    name: z.string(),
    /** "Labour Id"; null for vendors. */
    code: z.string().nullable(),
    isActive: z.boolean(),
    /** On the Project now (labour) or assigned to it (vendor). */
    onProject: z.boolean(),
  });

export const GetConstructionLabourBalancesResponseModel = z.object({
  projectId: z.uuid(),
  partyType,
  kind: z.enum(["monthly", "weekly", "custom"]),
  from: z.iso.date(),
  to: z.iso.date(),
  /** Whether amounts are shown (the menu's Financial flag). */
  financial: z.boolean(),
  /** Party-wide figures: a balance belongs to the party, across Projects. */
  items: z.array(ConstructionLabourBalanceRowResponseModel),
  totals: ConstructionLabourPeriodSummaryResponseModel,
});

export type GetConstructionLabourBalancesResponseModel = z.infer<
  typeof GetConstructionLabourBalancesResponseModel
>;

export const ConstructionLabourStatementLineResponseModel = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  kind: z.enum(["opening", "earned", "overtime", "payment", "advance"]),
  /** Signed: positive is owed to the party. */
  amount: money,
  /** Owed to the party after this entry. */
  balance: money,
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  /** What wrote the entry: `labour`/`vendor` (opening), `labour_attendance`, `vendor_attendance`, `wage_payment`. */
  sourceType: z.string(),
  sourceId: z.uuid(),
  /** This entry cancels an earlier one. */
  isReversal: z.boolean(),
  /** A later entry cancels this one. */
  isReversed: z.boolean(),
  payment: z
    .object({
      id: z.uuid(),
      mode: z.enum(["cash", "bank"]),
      reference: z.string().nullable(),
      remarks: z.string().nullable(),
      cancelled: z.boolean(),
      /** Send as `expectedUpdatedAt` to cancel. */
      updatedAt: z.iso.datetime(),
      hasReceipt: z.boolean(),
    })
    .nullable(),
});

export const GetConstructionLabourStatementResponseModel = z.object({
  partyType,
  partyId: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  from: z.iso.date(),
  to: z.iso.date(),
  financial: z.boolean(),
  openingBalance: money,
  closingBalance: money,
  /** Oldest first. */
  lines: z.array(ConstructionLabourStatementLineResponseModel),
});

export type GetConstructionLabourStatementResponseModel = z.infer<
  typeof GetConstructionLabourStatementResponseModel
>;

function summaryResponse(summary: PeriodSummary, financial: boolean) {
  const show = (value: number) => (financial ? value : null);
  return {
    previousBalance: show(summary.previousBalance),
    earned: show(summary.earned),
    overtime: show(summary.overtime),
    toPay: show(summary.toPay),
    advance: show(summary.advance),
    paid: show(summary.paid),
    finalAmount: show(summary.finalAmount),
  };
}

export function toBalancesResponse(
  model: PartyBalancesReadModel,
  financial: boolean,
): GetConstructionLabourBalancesResponseModel {
  return {
    projectId: model.projectId,
    partyType: model.partyType,
    kind: model.kind,
    from: model.from,
    to: model.to,
    financial,
    items: model.items.map((item) => ({
      partyId: item.id,
      name: item.name,
      code: item.code,
      isActive: item.isActive,
      onProject: item.onProject,
      ...summaryResponse(item.summary, financial),
    })),
    totals: summaryResponse(model.totals, financial),
  };
}

export function toStatementResponse(
  model: StatementReadModel,
  financial: boolean,
): GetConstructionLabourStatementResponseModel {
  const show = (value: number) => (financial ? value : null);
  return {
    partyType: model.partyType,
    partyId: model.party.id,
    name: model.party.name,
    code: model.party.code,
    from: model.from,
    to: model.to,
    financial,
    openingBalance: show(model.openingBalance),
    closingBalance: show(model.closingBalance),
    lines: model.lines.map((line) => ({
      id: line.id,
      date: line.entryDate,
      kind: line.kind,
      amount: show(line.amount),
      balance: show(line.balance),
      projectId: line.projectId,
      projectName: line.projectName,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      isReversal: line.reversesEntryId != null,
      isReversed: line.isReversed,
      payment:
        line.payment == null
          ? null
          : {
              ...line.payment,
              updatedAt: line.payment.updatedAt.toISOString(),
            },
    })),
  };
}
