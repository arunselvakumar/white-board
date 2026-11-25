import { queryOptions } from "@tanstack/react-query";

import type {
  ChildFeeAccountView,
  DuesListView,
  FeeHeadListView,
  FeeHeadView,
  FeePaymentListView,
  FeePaymentMethod,
  FeeStructureListView,
  FeeStructureView,
  FeeSummaryView,
  InvoiceView,
  ReceiptView,
} from "@/src/preschool/application/fee-views";
import type { FeeHeadKind } from "@/src/preschool/domain/fee-structure";
import type { FeeFrequency } from "@/src/preschool/domain/fees";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export {
  indianMobileNumber,
  whatsappReminderUrl,
} from "@/src/preschool/domain/fee-reminder";

export type PreschoolFeeHead = FeeHeadView;
export type PreschoolFeeHeadList = FeeHeadListView;
export type PreschoolFeeStructure = FeeStructureView;
export type PreschoolFeeStructureList = FeeStructureListView;
export type PreschoolInvoice = InvoiceView;
export type PreschoolChildFeeAccount = ChildFeeAccountView;
export type PreschoolFeePaymentList = FeePaymentListView;
export type PreschoolReceipt = ReceiptView;
export type PreschoolDues = DuesListView;
export type PreschoolFeeSummary = FeeSummaryView;
export type PreschoolFeePaymentMethod = FeePaymentMethod;
export type PreschoolFeeFrequency = FeeFrequency;

export type PreschoolFeeHeadInput = {
  name: string;
  kind: FeeHeadKind;
  royaltyBearing?: boolean;
  refundable?: boolean;
};

export type SavePreschoolFeeStructureInput = {
  academicYearId: string;
  programmeId: string;
  /** Null saves the Workspace default (Owner only). */
  centreId: string | null;
  /** Every line; this replaces what was there. */
  items: { feeHeadId: string; amountPaise: number; frequency: FeeFrequency }[];
};

export type CreatePreschoolInvoiceInput = {
  childId: string;
  feeHeadId: string;
  label: string;
  /** YYYY-MM-DD */
  dueOn: string;
  amountPaise: number;
};

export type UpdatePreschoolInvoiceInput = {
  label: string;
  /** YYYY-MM-DD */
  dueOn: string;
  amountPaise: number;
};

export type PreschoolInvoiceConcessionInput = {
  /** Zero removes the concession. */
  concessionPaise: number;
  /** Required when the concession is above zero. */
  reason?: string | null;
};

export type RecordPreschoolFeePaymentInput = {
  childId: string;
  amountPaise: number;
  method: FeePaymentMethod;
  /** YYYY-MM-DD; defaults to today in India. */
  receivedOn?: string;
  reference?: string | null;
  note?: string | null;
  /** Allocate only across these Invoices, oldest first. */
  invoiceIds?: string[];
};

export type PreschoolFeePaymentFilters = {
  centreId: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

export type PreschoolDuesFilters = {
  centreId: string;
  classroomId?: string;
  only?: "overdue" | "all";
};

const BASE = "/api/preschool/fees";

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query))
    if (value != null) params.set(name, String(value));
  const search = params.toString();
  return `${BASE}${path}${search === "" ? "" : `?${search}`}`;
}

export const feeKeys = {
  all: [...preschoolKeys.all, "fees"] as const,
  heads: (includeArchived: boolean) =>
    [...feeKeys.all, "heads", { includeArchived }] as const,
  structures: (query: { academicYearId?: string; centreId?: string }) =>
    [...feeKeys.all, "structures", query] as const,
  account: (childId: string) => [...feeKeys.all, "account", childId] as const,
  payments: (filters: PreschoolFeePaymentFilters) =>
    [...feeKeys.all, "payments", filters] as const,
  receipt: (id: string) => [...feeKeys.all, "receipt", id] as const,
  dues: (filters: PreschoolDuesFilters) =>
    [...feeKeys.all, "dues", filters] as const,
  summary: (centreId?: string) =>
    [...feeKeys.all, "summary", centreId ?? "all"] as const,
};

export function feeHeadsQueryOptions(options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false;
  return queryOptions({
    queryKey: feeKeys.heads(includeArchived),
    queryFn: ({ meta }) =>
      apiJson<FeeHeadListView>(
        withQuery("/heads", { includeArchived: String(includeArchived) }),
        {},
        meta,
      ),
  });
}

/** Every Programme's default, the Centre's own amounts, and what is in force. */
export function feeStructuresQueryOptions(query: {
  academicYearId?: string;
  centreId?: string;
}) {
  return queryOptions({
    queryKey: feeKeys.structures(query),
    queryFn: ({ meta }) =>
      apiJson<FeeStructureListView>(withQuery("/structures", query), {}, meta),
  });
}

export function childFeeAccountQueryOptions(childId: string) {
  return queryOptions({
    queryKey: feeKeys.account(childId),
    queryFn: ({ meta }) =>
      apiJson<ChildFeeAccountView>(`${BASE}/children/${childId}`, {}, meta),
  });
}

export function feePaymentsQueryOptions(filters: PreschoolFeePaymentFilters) {
  return queryOptions({
    queryKey: feeKeys.payments(filters),
    queryFn: ({ meta }) =>
      apiJson<FeePaymentListView>(withQuery("/payments", filters), {}, meta),
  });
}

export function receiptQueryOptions(id: string) {
  return queryOptions({
    queryKey: feeKeys.receipt(id),
    queryFn: ({ meta }) =>
      apiJson<ReceiptView>(`${BASE}/payments/${id}`, {}, meta),
  });
}

export function duesQueryOptions(filters: PreschoolDuesFilters) {
  return queryOptions({
    queryKey: feeKeys.dues(filters),
    queryFn: ({ meta }) =>
      apiJson<DuesListView>(withQuery("/dues", filters), {}, meta),
  });
}

/** One Centre, or every Centre the User manages without one. */
export function feeSummaryQueryOptions(centreId?: string) {
  return queryOptions({
    queryKey: feeKeys.summary(centreId),
    queryFn: ({ meta }) =>
      apiJson<FeeSummaryView>(withQuery("/summary", { centreId }), {}, meta),
  });
}

export function createFeeHead(
  body: PreschoolFeeHeadInput,
): Promise<FeeHeadView> {
  return post<FeeHeadView>("/heads", body);
}

export function updateFeeHeadDetails(
  id: string,
  body: PreschoolFeeHeadInput,
): Promise<FeeHeadView> {
  return post<FeeHeadView>(`/heads/${id}/details`, body);
}

export function archiveFeeHead(id: string): Promise<FeeHeadView> {
  return post<FeeHeadView>(`/heads/${id}/archive`);
}

export function restoreFeeHead(id: string): Promise<FeeHeadView> {
  return post<FeeHeadView>(`/heads/${id}/restore`);
}

export function saveFeeStructure(
  body: SavePreschoolFeeStructureInput,
): Promise<FeeStructureView> {
  return post<FeeStructureView>("/structures", body);
}

/** Removes a Centre's own amounts; the Workspace default applies again. */
export function removeFeeStructure(id: string): Promise<void> {
  return post<undefined>(`/structures/${id}/remove`);
}

/** Raises the active Admission's Invoices from the Fee Structure in force. */
export function generateInvoices(
  childId: string,
): Promise<ChildFeeAccountView> {
  return post<ChildFeeAccountView>(`/children/${childId}/generate`);
}

export function createInvoice(
  body: CreatePreschoolInvoiceInput,
): Promise<InvoiceView> {
  return post<InvoiceView>("/invoices", body);
}

export function updateInvoiceDetails(
  id: string,
  body: UpdatePreschoolInvoiceInput,
): Promise<InvoiceView> {
  return post<InvoiceView>(`/invoices/${id}/details`, body);
}

export function setInvoiceConcession(
  id: string,
  body: PreschoolInvoiceConcessionInput,
): Promise<InvoiceView> {
  return post<InvoiceView>(`/invoices/${id}/concession`, body);
}

export function cancelInvoice(id: string): Promise<InvoiceView> {
  return post<InvoiceView>(`/invoices/${id}/cancel`);
}

/** Records a Fee Payment and returns its Receipt. */
export function recordFeePayment(
  body: RecordPreschoolFeePaymentInput,
): Promise<ReceiptView> {
  return post<ReceiptView>("/payments", body);
}
