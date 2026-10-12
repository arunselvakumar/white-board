import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionFinanceInvoiceResponse,
  CreateConstructionFinanceInvoiceRequestModel,
  ListConstructionFinanceAwaitingGoodsReceiptsResponse,
  ListConstructionFinanceInvoicesResponse,
  ListConstructionFinanceOutstandingInvoicesResponse,
  UpdateConstructionFinanceInvoiceRequestModel,
} from "@/app/api/construction/finance/invoices/invoice-models";
import type {
  GetConstructionFinancePartyFormOptionsResponse,
  ListConstructionFinancePartyBalancesResponse,
} from "@/app/api/construction/finance/parties/party-balance-models";
import type {
  ConstructionFinancePartyOpeningResponse,
  ListConstructionFinancePartyOpeningsResponse,
  SetConstructionFinancePartyOpeningRequestModel,
} from "@/app/api/construction/finance/party-openings/party-opening-models";
import type {
  ApplyConstructionFinancePartyPaymentAdvanceRequestModel,
  ConstructionFinancePartyPaymentResponse,
  ListConstructionFinancePartyPaymentsResponse,
  RecordConstructionFinancePartyPaymentRequestModel,
  SuggestConstructionFinanceTdsRequestModel,
  SuggestConstructionFinanceTdsResponse,
} from "@/app/api/construction/finance/party-payments/party-payment-models";
import type { GetConstructionFinancePartyStatementResponse } from "@/app/api/construction/finance/party-statements/party-statement-models";
import type {
  ConstructionFinanceSettlementResponse,
  ListConstructionFinanceSettlementsResponse,
} from "@/app/api/construction/finance/settlements/settlement-models";
import type { GetConstructionFinanceTdsLedgerResponse } from "@/app/api/construction/finance/tds/tds-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { FINANCE_ACCOUNTS_KEY } from "./finance-accounts";
import { apiJson } from "./http";

/**
 * Contractor, Supplier and Other Party money (CM-705, CM-706, CM-708):
 * balances, invoices, payments, openings, settlements, statements and the
 * TDS ledger. Every write invalidates `FINANCE_PARTIES_KEY` and the
 * account balances.
 */

export type PartyType = "contractor" | "supplier" | "other_party";
export type PartyBalances = ListConstructionFinancePartyBalancesResponse;
export type PartyBalance = PartyBalances["items"][number];
export type Invoice = ConstructionFinanceInvoiceResponse;
export type InvoicePage = ListConstructionFinanceInvoicesResponse;
export type AwaitingGoodsReceipt =
  ListConstructionFinanceAwaitingGoodsReceiptsResponse["items"][number];
export type PartyPayment = ConstructionFinancePartyPaymentResponse;
export type PartyPaymentPage = ListConstructionFinancePartyPaymentsResponse;
export type PartyStatement = GetConstructionFinancePartyStatementResponse;
export type PartyOpening = ConstructionFinancePartyOpeningResponse;
export type Settlement = ConstructionFinanceSettlementResponse;
export type TdsLedger = GetConstructionFinanceTdsLedgerResponse;
export type TdsSuggestion = SuggestConstructionFinanceTdsResponse;
export type CreateInvoiceInput = CreateConstructionFinanceInvoiceRequestModel;
export type UpdateInvoiceInput = UpdateConstructionFinanceInvoiceRequestModel;
export type RecordPartyPaymentInput =
  RecordConstructionFinancePartyPaymentRequestModel;
export type TdsSuggestionInput = SuggestConstructionFinanceTdsRequestModel;
export type SetOpeningInput = SetConstructionFinancePartyOpeningRequestModel;
export type ApplyAdvanceInput =
  ApplyConstructionFinancePartyPaymentAdvanceRequestModel;

export const FINANCE_PARTIES_KEY = [...FINANCE_KEY, "parties"] as const;

function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${FINANCE_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function search(values: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value != null && value !== "") params.set(key, value);
  return params.toString();
}

export function partyBalancesQuery(projectId: string, partyType: PartyType) {
  const query = search({ projectId, partyType });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "balances", query],
    queryFn: () => apiJson<PartyBalances>(`${FINANCE_API}/parties?${query}`),
  });
}

export function partyFormOptionsQuery(
  projectId: string,
  partyType: PartyType,
  partyId: string,
) {
  const query = search({ projectId, partyType, partyId });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "form-options", query],
    queryFn: () =>
      apiJson<GetConstructionFinancePartyFormOptionsResponse>(
        `${FINANCE_API}/parties/form-options?${query}`,
      ),
    staleTime: 60_000,
  });
}

export type InvoiceFilters = {
  partyType?: PartyType;
  partyId?: string;
  direction?: "payable" | "receivable";
  status?: "open" | "partly_paid" | "paid" | "settled";
  outstanding?: boolean;
  overdue?: boolean;
  cursor?: { after?: string; before?: string } | null;
};

export function invoicesQuery(projectId: string, filters: InvoiceFilters = {}) {
  const query = search({
    projectId,
    partyType: filters.partyType,
    partyId: filters.partyId,
    direction: filters.direction,
    status: filters.status,
    outstanding: filters.outstanding === true ? "true" : null,
    overdue: filters.overdue === true ? "true" : null,
    after: filters.cursor?.after,
    before: filters.cursor?.before,
    limit: "50",
  });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "invoices", query],
    queryFn: () => apiJson<InvoicePage>(`${FINANCE_API}/invoices?${query}`),
  });
}

export function invoiceQuery(id: string) {
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "invoice", id],
    queryFn: () => apiJson<Invoice>(`${FINANCE_API}/invoices/${id}`),
  });
}

export function outstandingInvoicesQuery(
  projectId: string,
  partyType: PartyType,
  partyId: string,
  direction: "payable" | "receivable" = "payable",
) {
  const query = search({ projectId, partyType, partyId, direction });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "outstanding", query],
    queryFn: () =>
      apiJson<ListConstructionFinanceOutstandingInvoicesResponse>(
        `${FINANCE_API}/invoices/outstanding?${query}`,
      ),
  });
}

export function awaitingGoodsReceiptsQuery(
  projectId: string,
  supplierId: string | null = null,
) {
  const query = search({ projectId, supplierId });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "awaiting-grns", query],
    queryFn: () =>
      apiJson<ListConstructionFinanceAwaitingGoodsReceiptsResponse>(
        `${FINANCE_API}/invoices/awaiting-goods-receipts?${query}`,
      ),
  });
}

export function partyPaymentsQuery(
  projectId: string,
  filters: {
    partyType?: PartyType;
    partyId?: string;
    cursor?: { after?: string; before?: string } | null;
  } = {},
) {
  const query = search({
    projectId,
    partyType: filters.partyType,
    partyId: filters.partyId,
    after: filters.cursor?.after,
    before: filters.cursor?.before,
    limit: "50",
  });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "payments", query],
    queryFn: () =>
      apiJson<PartyPaymentPage>(`${FINANCE_API}/party-payments?${query}`),
  });
}

export function partyPaymentQuery(id: string) {
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "payment", id],
    queryFn: () => apiJson<PartyPayment>(`${FINANCE_API}/party-payments/${id}`),
  });
}

/** The receipt PDF of a payment (Parties print). */
export function partyPaymentReceiptUrl(id: string): string {
  return `${FINANCE_API}/party-payments/${id}/receipt`;
}

export function partyStatementQuery(
  projectId: string,
  partyType: PartyType,
  partyId: string,
) {
  const query = search({ projectId, partyType, partyId });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "statement", query],
    queryFn: () =>
      apiJson<PartyStatement>(`${FINANCE_API}/party-statements?${query}`),
  });
}

export function partyOpeningsQuery(projectId: string, partyType: PartyType) {
  const query = search({ projectId, partyType });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "openings", query],
    queryFn: () =>
      apiJson<ListConstructionFinancePartyOpeningsResponse>(
        `${FINANCE_API}/party-openings?${query}`,
      ),
  });
}

export function settlementsQuery(filters: {
  status?: "pending" | "approved" | "rejected";
  projectId?: string;
}) {
  const query = search(filters);
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "settlements", query],
    queryFn: () =>
      apiJson<ListConstructionFinanceSettlementsResponse>(
        `${FINANCE_API}/settlements?${query}`,
      ),
  });
}

export function tdsLedgerQuery(contractorId: string, financialYear: number) {
  const query = search({ contractorId, fy: String(financialYear) });
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "tds", query],
    queryFn: () => apiJson<TdsLedger>(`${FINANCE_API}/tds?${query}`),
  });
}

/** The TDS suggestion for a Contractor payment, while the form is filled. */
export function tdsSuggestionQuery(input: TdsSuggestionInput) {
  return queryOptions({
    queryKey: [...FINANCE_PARTIES_KEY, "tds-suggestion", input],
    queryFn: () =>
      postJson<TdsSuggestion>("/party-payments/tds-suggestion", input),
    staleTime: 30_000,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: FINANCE_PARTIES_KEY }),
      queryClient.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_KEY }),
    ]);
  };
}

export function useCreateInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      postJson<Invoice>("/invoices", input),
    onSuccess: invalidate,
  });
}

export function useUpdateInvoice(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateInvoiceInput) =>
      postJson<Invoice>(`/invoices/${id}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteInvoice(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      postJson<undefined>(`/invoices/${id}/delete`, { expectedUpdatedAt }),
    onSuccess: invalidate,
  });
}

export function useSettleInvoice(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (reason: string) =>
      postJson<Invoice>(`/invoices/${id}/settle`, { reason }),
    onSuccess: invalidate,
  });
}

export function useDecideSettlement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input:
        | { id: string; approve: true }
        | { id: string; approve: false; reason: string },
    ) =>
      input.approve
        ? postJson<Settlement>(`/settlements/${input.id}/approve`, {})
        : postJson<Settlement>(`/settlements/${input.id}/reject`, {
            reason: input.reason,
          }),
    onSuccess: invalidate,
  });
}

export function useRecordPartyPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RecordPartyPaymentInput) =>
      postJson<PartyPayment>("/party-payments", input),
    onSuccess: invalidate,
  });
}

export function useCancelPartyPayment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      postJson<undefined>(`/party-payments/${id}/cancel`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

export function useApplyAdvance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ApplyAdvanceInput) =>
      postJson<PartyPayment>(`/party-payments/${id}/apply-advance`, input),
    onSuccess: invalidate,
  });
}

export function useSetOpening() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SetOpeningInput) =>
      postJson<PartyOpening>("/party-openings", input),
    onSuccess: invalidate,
  });
}

export function useRemoveOpening() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; expectedUpdatedAt: string }) =>
      postJson<undefined>(`/party-openings/${input.id}/delete`, {
        expectedUpdatedAt: input.expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}
