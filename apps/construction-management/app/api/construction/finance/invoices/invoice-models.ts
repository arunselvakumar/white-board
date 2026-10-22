import { z } from "zod";

import type {
  InvoiceActions,
  InvoiceView,
} from "@/src/finance/application/invoice-handlers";
import type { StoredSettlement } from "@/src/finance/application/party-ports";
import type { GoodsReceiptFacts } from "@/src/finance/application/ports";
import { INVOICE_STATUSES } from "@/src/finance/domain/invoice";
import { PARTY_TEXT_LIMITS } from "@/src/finance/domain/party";

import {
  ConstructionFinancePartyPlaceResponseModel,
  ConstructionFinancePartyRefResponseModel,
  InvoiceDirectionModel,
  pageQuery,
  Paise,
  PartyTypeModel,
  money,
  moneyOrNull,
  placeResponse,
} from "../parties/party-shared-models";

export const INVOICES_PATH = "/api/construction/finance/invoices";

const InvoiceBody = z.object({
  /** Typed for a bill from the party; ignored on a sales invoice (INV rule). */
  invoiceNumber: z
    .string()
    .max(PARTY_TEXT_LIMITS.invoiceNumber)
    .nullable()
    .optional(),
  invoiceDate: z.iso.date(),
  /** On or after the invoice date. */
  dueDate: z.iso.date().nullable().optional(),
  /** Contractor invoices: one of the Contractor's Departments. */
  departmentId: z.uuid().nullable().optional(),
  /** Paise; with GST at most the amount. */
  taxableAmount: Paise.min(0).nullable().optional(),
  gstAmount: Paise.min(0).nullable().optional(),
  /** Paise. A supplier invoice from GRNs defaults to their total value. */
  amount: Paise.positive().nullable().optional(),
  remarks: z.string().max(PARTY_TEXT_LIMITS.remarks).nullable().optional(),
});

export const CreateConstructionFinanceInvoiceRequestModel = InvoiceBody.extend({
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  /** One of the two: a Project, or a Store for a store Supplier (Owner only). */
  projectId: z.uuid().nullable().optional(),
  storeId: z.uuid().nullable().optional(),
  /** `receivable` is an Other Party sales invoice. Default `payable`. */
  direction: InvoiceDirectionModel.optional(),
  /** A Supplier's GRNs awaiting an invoice, gathered into this one. */
  goodsReceiptIds: z.array(z.uuid()).max(100).optional(),
});
export type CreateConstructionFinanceInvoiceRequestModel = z.input<
  typeof CreateConstructionFinanceInvoiceRequestModel
>;

export const UpdateConstructionFinanceInvoiceRequestModel = InvoiceBody.extend({
  /** The invoice's `updatedAt` as last seen; 409 `INVOICE_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});
export type UpdateConstructionFinanceInvoiceRequestModel = z.input<
  typeof UpdateConstructionFinanceInvoiceRequestModel
>;

export const DeleteConstructionFinanceInvoiceRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const SettleConstructionFinanceInvoiceRequestModel = z.object({
  /** Why the rest is written off. */
  reason: z.string().max(PARTY_TEXT_LIMITS.reason),
});

export const ListConstructionFinanceInvoicesRequestModel = z
  .object({
    projectId: z.uuid().optional(),
    storeId: z.uuid().optional(),
    partyType: PartyTypeModel.optional(),
    partyId: z.uuid().optional(),
    direction: InvoiceDirectionModel.optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    /** Only invoices with a balance (Open or Partly paid). */
    outstanding: z.enum(["true", "false"]).optional(),
    /** Only overdue invoices. */
    overdue: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(100).optional(),
    ...pageQuery,
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ListConstructionFinanceOutstandingInvoicesRequestModel = z.object({
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  /** `payable` for a Payment Out (default), `receivable` for a Payment In. */
  direction: InvoiceDirectionModel.optional(),
});

export const ListConstructionFinanceAwaitingGoodsReceiptsRequestModel =
  z.object({
    projectId: z.uuid().optional(),
    storeId: z.uuid().optional(),
    supplierId: z.uuid().optional(),
  });

const SettlementSummary = z.object({
  id: z.uuid(),
  amount: Paise,
  reason: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  rejectReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

export const ConstructionFinanceInvoiceActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  settle: z.boolean(),
  pay: z.boolean(),
});

export const ConstructionFinanceInvoiceResponseModel = z.object({
  id: z.uuid(),
  party: ConstructionFinancePartyRefResponseModel,
  place: ConstructionFinancePartyPlaceResponseModel,
  direction: InvoiceDirectionModel,
  origin: z
    .enum(["manual", "goods_receipt", "ra_bill", "retention_release"])
    .describe(
      "`ra_bill`: from an approved Contractor Bill (CM-1106, payable) or Client Bill (CM-1107, receivable to a Client); `retention_release`: retention released on a Work Order (payable) or the client contract (receivable), CM-1108. Both read-only here (409 INVOICE_FROM_CONTRACTOR_BILL / INVOICE_FROM_CLIENT_BILL / INVOICE_FROM_RETENTION_RELEASE).",
    ),
  /** `ra_bill`: the Contractor or Client Bill's id (the party type says which); `retention_release`: the release's. */
  sourceId: z.uuid().nullable(),
  retentionRelease: z
    .object({
      side: z.enum(["contractor", "client"]),
      workOrderId: z.uuid().nullable(),
      workOrderNumber: z.string().nullable(),
    })
    .nullable()
    .describe(
      "Origin `retention_release`: the Work Order the retention was released on (contractor side), or none (the client contract).",
    ),
  invoiceNumber: z.string(),
  invoiceDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  department: z
    .object({ id: z.uuid(), name: z.string().nullable() })
    .nullable(),
  taxableAmount: Paise.nullable(),
  gstAmount: Paise.nullable(),
  amount: Paise,
  remarks: z.string().nullable(),
  /** Σ live allocations (paid + TDS). */
  allocated: Paise,
  writtenOff: Paise,
  balance: Paise,
  status: z.enum(INVOICE_STATUSES),
  overdue: z.boolean(),
  daysOverdue: z.int(),
  goodsReceipts: z.array(
    z.object({ id: z.uuid(), number: z.string().nullable(), grnValue: Paise }),
  ),
  /** Σ GRN value; null without GRNs. */
  grnValue: Paise.nullable(),
  /** |amount − GRN value| above ₹1. */
  variance: z.boolean(),
  pendingSettlement: SettlementSummary.nullable(),
  settlements: z.array(SettlementSummary),
  payments: z.array(
    z.object({
      paymentId: z.uuid(),
      number: z.string(),
      paymentDate: z.iso.date(),
      amount: Paise,
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionFinanceInvoiceActionsResponseModel,
});
export type ConstructionFinanceInvoiceResponse = z.infer<
  typeof ConstructionFinanceInvoiceResponseModel
>;

export const ListConstructionFinanceInvoicesResponseModel = z.object({
  items: z.array(ConstructionFinanceInvoiceResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});
export type ListConstructionFinanceInvoicesResponse = z.infer<
  typeof ListConstructionFinanceInvoicesResponseModel
>;

export const ListConstructionFinanceOutstandingInvoicesResponseModel = z.object(
  { items: z.array(ConstructionFinanceInvoiceResponseModel) },
);
export type ListConstructionFinanceOutstandingInvoicesResponse = z.infer<
  typeof ListConstructionFinanceOutstandingInvoicesResponseModel
>;

export const ConstructionFinanceAwaitingGoodsReceiptResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  receiptDate: z.iso.date(),
  invoiceNo: z.string().nullable(),
  invoiceDate: z.iso.date().nullable(),
  invoiceAmount: Paise.nullable(),
  totalValue: Paise,
  paymentTermsDays: z.int().nullable(),
});

export const ListConstructionFinanceAwaitingGoodsReceiptsResponseModel =
  z.object({
    items: z.array(ConstructionFinanceAwaitingGoodsReceiptResponseModel),
  });
export type ListConstructionFinanceAwaitingGoodsReceiptsResponse = z.infer<
  typeof ListConstructionFinanceAwaitingGoodsReceiptsResponseModel
>;

function settlementResponse(row: StoredSettlement) {
  return {
    id: row.id,
    amount: money(row.amount),
    reason: row.reason,
    status: row.approvalStatus,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export function toInvoiceResponse(
  view: InvoiceView,
  actions: InvoiceActions,
): ConstructionFinanceInvoiceResponse {
  return {
    id: view.id,
    party: { type: view.partyType, id: view.partyId, name: view.partyName },
    place: placeResponse(view.place, view.placeName),
    direction: view.direction,
    origin: view.origin,
    sourceId: view.sourceId,
    retentionRelease: view.retentionRelease,
    invoiceNumber: view.invoiceNumber,
    invoiceDate: view.invoiceDate,
    dueDate: view.dueDate,
    department:
      view.departmentId == null
        ? null
        : { id: view.departmentId, name: view.departmentName },
    taxableAmount: moneyOrNull(view.taxableAmount),
    gstAmount: moneyOrNull(view.gstAmount),
    amount: money(view.amount),
    remarks: view.remarks,
    allocated: money(view.allocated),
    writtenOff: money(view.writtenOff),
    balance: money(view.balance),
    status: view.status,
    overdue: view.overdue,
    daysOverdue: view.daysOverdue,
    goodsReceipts: view.goodsReceipts.map((grn) => ({
      id: grn.id,
      number: grn.number,
      grnValue: money(grn.grnValue),
    })),
    grnValue: moneyOrNull(view.grnValue),
    variance: view.variance,
    pendingSettlement:
      view.pendingSettlement == null
        ? null
        : settlementResponse(view.pendingSettlement),
    settlements: view.settlements.map(settlementResponse),
    payments: view.payments.map((payment) => ({
      ...payment,
      amount: money(payment.amount),
    })),
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    actions,
  };
}

export function toAwaitingGoodsReceiptResponse(grn: GoodsReceiptFacts) {
  return {
    id: grn.id,
    number: grn.number,
    supplier: { id: grn.supplierId, name: grn.supplierName },
    receiptDate: grn.receiptDate,
    invoiceNo: grn.invoiceNo,
    invoiceDate: grn.invoiceDate,
    invoiceAmount: moneyOrNull(grn.invoiceAmount),
    totalValue: money(grn.totalValue),
    paymentTermsDays: grn.paymentTermsDays,
  };
}
