import { z } from "zod";

import type { SettlementView } from "@/src/finance/application/settlement-handlers";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

import {
  ConstructionFinancePartyPlaceResponseModel,
  ConstructionFinancePartyRefResponseModel,
  InvoiceDirectionModel,
  Paise,
  PartyTypeModel,
  money,
  placeResponse,
} from "../parties/party-shared-models";

export const SETTLEMENTS_PATH = "/api/construction/finance/settlements";

const Status = z.enum(["pending", "approved", "rejected"]);

export const ListConstructionFinanceSettlementsRequestModel = z.object({
  status: Status.optional(),
  /** One Project; without it every Project the caller reads Parties on. */
  projectId: z.uuid().optional(),
  /** Settlements of one party type's invoices. */
  partyType: PartyTypeModel.optional(),
});

export const RejectConstructionFinanceSettlementRequestModel = z.object({
  reason: z.string().max(APPROVAL_LIMITS.maxTextLength),
});

export const BulkApproveConstructionFinanceSettlementsRequestModel = z.object({
  ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
});

export const BulkRejectConstructionFinanceSettlementsRequestModel = z.object({
  ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
  reason: z.string().max(APPROVAL_LIMITS.maxTextLength),
});

export const ConstructionFinanceSettlementResponseModel = z.object({
  id: z.uuid(),
  /** Paise: the balance when raised, or what was written off once approved. */
  amount: Paise,
  reason: z.string(),
  status: Status,
  rejectReason: z.string().nullable(),
  raisedBy: z.object({ userId: z.string(), name: z.string().nullable() }),
  decidedBy: z
    .object({ userId: z.string(), name: z.string().nullable() })
    .nullable(),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
  invoice: z.object({
    id: z.uuid(),
    party: ConstructionFinancePartyRefResponseModel,
    place: ConstructionFinancePartyPlaceResponseModel,
    direction: InvoiceDirectionModel,
    invoiceNumber: z.string(),
    invoiceDate: z.iso.date(),
    amount: Paise,
    balance: Paise,
  }),
  actions: z.object({ approve: z.boolean(), reject: z.boolean() }),
});
export type ConstructionFinanceSettlementResponse = z.infer<
  typeof ConstructionFinanceSettlementResponseModel
>;

export const ListConstructionFinanceSettlementsResponseModel = z.object({
  items: z.array(ConstructionFinanceSettlementResponseModel),
});
export type ListConstructionFinanceSettlementsResponse = z.infer<
  typeof ListConstructionFinanceSettlementsResponseModel
>;

export function toSettlementResponse(
  view: SettlementView,
): ConstructionFinanceSettlementResponse {
  return {
    id: view.id,
    amount: money(view.amount),
    reason: view.reason,
    status: view.approvalStatus,
    rejectReason: view.rejectReason,
    raisedBy: { userId: view.createdBy, name: view.raisedByName },
    decidedBy:
      view.decidedBy == null
        ? null
        : { userId: view.decidedBy, name: view.decidedByName },
    createdAt: view.createdAt.toISOString(),
    decidedAt: view.decidedAt?.toISOString() ?? null,
    invoice: {
      id: view.invoice.id,
      party: {
        type: view.invoice.partyType,
        id: view.invoice.partyId,
        name: view.invoice.partyName,
      },
      place: placeResponse(view.invoice.place, view.invoice.placeName),
      direction: view.invoice.direction,
      invoiceNumber: view.invoice.invoiceNumber,
      invoiceDate: view.invoice.invoiceDate,
      amount: money(view.invoice.amount),
      balance: money(view.invoice.balance),
    },
    actions: view.actions,
  };
}
