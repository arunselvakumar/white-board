import { z } from "zod";

import type {
  PaymentActions,
  PaymentView,
  TdsSuggestionView,
} from "@/src/finance/application/party-payment-handlers";
import { PARTY_TEXT_LIMITS } from "@/src/finance/domain/party";

import {
  ConstructionFinancePartyPlaceResponseModel,
  ConstructionFinancePartyRefResponseModel,
  pageQuery,
  Paise,
  PartyTypeModel,
  PaymentDirectionModel,
  PaymentModeModel,
  money,
  moneyOrNull,
  placeResponse,
} from "../parties/party-shared-models";

export const PARTY_PAYMENTS_PATH = "/api/construction/finance/party-payments";

const Allocation = z.object({
  invoiceId: z.uuid(),
  /** Paise of the payment's settled amount applied to this invoice. */
  amount: Paise.positive(),
});

const TdsRate = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/);

export const RecordConstructionFinancePartyPaymentRequestModel = z.object({
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  /** One of the two: a Project, or a Store for a store Supplier (Owner only). */
  projectId: z.uuid().nullable().optional(),
  storeId: z.uuid().nullable().optional(),
  /**
   * `in` (Payment In) from an Other Party or a Client; a Client only pays in
   * (400 `PAYMENT_OUT_NOT_FOR_CLIENTS`). Default `out`.
   */
  direction: PaymentDirectionModel.optional(),
  paymentDate: z.iso.date(),
  /** The account paid from or received into (the account picker). */
  accountId: z.uuid(),
  mode: PaymentModeModel,
  /** Required for Cheque. */
  chequeNumber: z
    .string()
    .max(PARTY_TEXT_LIMITS.reference)
    .nullable()
    .optional(),
  /** Required for Online and UPI. */
  reference: z.string().max(PARTY_TEXT_LIMITS.reference).nullable().optional(),
  /** The cheque or transfer date. */
  modeDate: z.iso.date().nullable().optional(),
  /** Paise: the money that moved. */
  amount: Paise.positive(),
  /**
   * Paise deducted (Contractors, out only). The server recomputes the
   * suggestion; a different amount needs `tdsOverrideReason`.
   */
  tdsAmount: Paise.min(0).nullable().optional(),
  tdsBase: Paise.min(0).nullable().optional(),
  /** Percent, e.g. `1` or `0.75`, when overriding. */
  tdsRate: TdsRate.nullable().optional(),
  tdsOverrideReason: z
    .string()
    .max(PARTY_TEXT_LIMITS.reason)
    .nullable()
    .optional(),
  /**
   * Clients, Payment In (CM-1107): paise of income-tax TDS the Client
   * deducted (194C, or 393 from 1 April 2026). Settles the invoice like
   * money; the account moves only by `amount`.
   */
  clientTdsAmount: Paise.min(0).nullable().optional(),
  /** Clients, Payment In: paise of GST-TDS (s.51, 2 %) a government Client deducted. */
  gstTdsAmount: Paise.min(0).nullable().optional(),
  paymentCategoryId: z.uuid().nullable().optional(),
  /** A Team Member; defaults to the caller's. */
  paidByMemberId: z.uuid().nullable().optional(),
  remarks: z.string().max(PARTY_TEXT_LIMITS.remarks).nullable().optional(),
  /** Σ at most amount + TDS (+ the Client's TDS and GST-TDS); the rest is an advance. */
  allocations: z.array(Allocation).max(200).optional(),
  /** Save even when the cheque number or reference is already used (409 `DUPLICATE_REFERENCE`). */
  confirmDuplicateReference: z.boolean().optional(),
});
export type RecordConstructionFinancePartyPaymentRequestModel = z.input<
  typeof RecordConstructionFinancePartyPaymentRequestModel
>;

export const CancelConstructionFinancePartyPaymentRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ApplyConstructionFinancePartyPaymentAdvanceRequestModel = z.object(
  {
    expectedUpdatedAt: z.iso.datetime(),
    allocations: z.array(Allocation).min(1).max(200),
  },
);
export type ApplyConstructionFinancePartyPaymentAdvanceRequestModel = z.input<
  typeof ApplyConstructionFinancePartyPaymentAdvanceRequestModel
>;

export const SuggestConstructionFinanceTdsRequestModel = z.object({
  contractorId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  paymentDate: z.iso.date(),
  /** Paise: paid + TDS. */
  settled: Paise.min(0),
  allocations: z.array(Allocation).max(200).optional(),
});
export type SuggestConstructionFinanceTdsRequestModel = z.input<
  typeof SuggestConstructionFinanceTdsRequestModel
>;

export const SuggestConstructionFinanceTdsResponseModel = z.object({
  /** `194C`. */
  section: z.string(),
  /** What to print: `393 (194C)` from 1 April 2026. */
  label: z.string(),
  /** Percent, two places. */
  rate: z.string(),
  base: Paise,
  amount: Paise,
  reason: z.enum([
    "not_applicable",
    "below_threshold",
    "single",
    "aggregate",
    "aggregate_crossed",
  ]),
  /** Earlier undeducted base of the year caught up by this payment. */
  catchUpBase: Paise,
  payeeKind: z.enum(["individual_huf", "other", "no_pan"]),
});
export type SuggestConstructionFinanceTdsResponse = z.infer<
  typeof SuggestConstructionFinanceTdsResponseModel
>;

export const ListConstructionFinancePartyPaymentsRequestModel = z
  .object({
    projectId: z.uuid().optional(),
    storeId: z.uuid().optional(),
    partyType: PartyTypeModel.optional(),
    partyId: z.uuid().optional(),
    direction: PaymentDirectionModel.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Part of the PAY number, cheque number or reference. */
    search: z.string().trim().max(100).optional(),
    ...pageQuery,
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionFinancePartyPaymentActionsResponseModel = z.object({
  cancel: z.boolean(),
  applyAdvance: z.boolean(),
  print: z.boolean(),
});

export const ConstructionFinancePartyPaymentResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  party: ConstructionFinancePartyRefResponseModel,
  place: ConstructionFinancePartyPlaceResponseModel,
  direction: PaymentDirectionModel,
  paymentDate: z.iso.date(),
  account: z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    kind: z.string().nullable(),
  }),
  mode: PaymentModeModel,
  chequeNumber: z.string().nullable(),
  reference: z.string().nullable(),
  modeDate: z.iso.date().nullable(),
  /** Paise moved. */
  amount: Paise,
  tds: z
    .object({
      section: z.string().nullable(),
      base: Paise.nullable(),
      rate: z.string().nullable(),
      amount: Paise,
      suggested: Paise.nullable(),
      overridden: z.boolean(),
      overrideReason: z.string().nullable(),
    })
    .nullable(),
  /**
   * Clients (CM-1107): what the Client deducted from this receipt; null
   * for other parties.
   */
  clientDeductions: z
    .object({
      /** Income-tax TDS (194C / 393). */
      tds: Paise,
      /** GST-TDS (s.51). */
      gstTds: Paise,
    })
    .nullable(),
  /** Paid + TDS (out); received + the Client's TDS and GST-TDS (in). */
  settled: Paise,
  allocated: Paise,
  /** The advance left to apply. */
  unallocated: Paise,
  contractAdvance: z
    .object({ label: z.string() })
    .nullable()
    .describe(
      "CM-1108: the Contracts advance this payment moved. Bills recover it; it cannot be cancelled or applied here (409 PAYMENT_FROM_ADVANCE).",
    ),
  paymentCategory: z
    .object({ id: z.uuid(), name: z.string().nullable() })
    .nullable(),
  paidBy: z.object({ id: z.uuid(), name: z.string().nullable() }).nullable(),
  remarks: z.string().nullable(),
  allocations: z.array(
    z.object({
      id: z.uuid(),
      invoiceId: z.uuid(),
      invoiceNumber: z.string().nullable(),
      invoiceDate: z.iso.date().nullable(),
      amount: Paise,
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionFinancePartyPaymentActionsResponseModel,
});
export type ConstructionFinancePartyPaymentResponse = z.infer<
  typeof ConstructionFinancePartyPaymentResponseModel
>;

export const ListConstructionFinancePartyPaymentsResponseModel = z.object({
  items: z.array(ConstructionFinancePartyPaymentResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});
export type ListConstructionFinancePartyPaymentsResponse = z.infer<
  typeof ListConstructionFinancePartyPaymentsResponseModel
>;

export function toPartyPaymentResponse(
  view: PaymentView,
  actions: PaymentActions,
): ConstructionFinancePartyPaymentResponse {
  return {
    id: view.id,
    number: view.number,
    party: { type: view.partyType, id: view.partyId, name: view.partyName },
    place: placeResponse(view.place, view.placeName),
    direction: view.direction,
    paymentDate: view.paymentDate,
    account: {
      id: view.accountId,
      name: view.accountName,
      kind: view.accountKind,
    },
    mode: view.mode,
    chequeNumber: view.chequeNumber,
    reference: view.reference,
    modeDate: view.modeDate,
    amount: money(view.amount),
    tds:
      view.partyType !== "contractor"
        ? null
        : {
            section: view.tdsSection,
            base: moneyOrNull(view.tdsBase),
            rate: view.tdsRate,
            amount: money(view.tdsAmount),
            suggested: moneyOrNull(view.tdsSuggested),
            overridden: view.tdsOverridden,
            overrideReason: view.tdsOverrideReason,
          },
    clientDeductions:
      view.partyType !== "client"
        ? null
        : {
            tds: money(view.clientTdsAmount),
            gstTds: money(view.gstTdsAmount),
          },
    settled: money(view.settled),
    allocated: money(view.allocated),
    unallocated: money(view.unallocated),
    contractAdvance: view.contractAdvance,
    paymentCategory:
      view.paymentCategoryId == null
        ? null
        : { id: view.paymentCategoryId, name: view.paymentCategoryName },
    paidBy:
      view.paidByMemberId == null
        ? null
        : { id: view.paidByMemberId, name: view.paidByName },
    remarks: view.remarks,
    allocations: view.allocations.map((allocation) => ({
      ...allocation,
      amount: money(allocation.amount),
    })),
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    actions,
  };
}

export function toTdsSuggestionResponse(
  suggestion: TdsSuggestionView,
): SuggestConstructionFinanceTdsResponse {
  return {
    section: suggestion.section,
    label: suggestion.label,
    rate: suggestion.rate,
    base: money(suggestion.base),
    amount: money(suggestion.amount),
    reason: suggestion.reason,
    catchUpBase: money(suggestion.catchUpBase),
    payeeKind: suggestion.payeeKind,
  };
}
