import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";

import type { StockLocationKind } from "./stock-location";

/** A GRN was posted, edited or deleted (CM-505); M7 builds payables from it. */
export type GoodsReceiptPosted = DomainEvent & {
  type: "procurement.goods_receipt_posted";
  goodsReceiptId: string;
  change: "posted" | "edited" | "deleted";
  supplierId: string;
  locationKind: StockLocationKind;
  locationId: string;
  inventoryDate: CalendarDate;
  /** Paise including GST. */
  totalValue: bigint;
};

/** Stock at a location fell to or below its minimum (CM-506, CM-0015 §10). */
export type StockBelowMinimum = DomainEvent & {
  type: "procurement.stock_below_minimum";
  locationKind: StockLocationKind;
  locationId: string;
  materialId: string;
  /** Decimal strings. */
  stock: string;
  minimum: string;
};

// ---------------------------------------------------------------------------
// CM-904: events messaging turns into notifications (ADR CM-0021 §6)
// ---------------------------------------------------------------------------

type TransferSide = { kind: StockLocationKind; id: string };

/**
 * A Material Transfer left its source: approved (or Save & Approve), when
 * Transferred out is posted at the source. The receiving side is told.
 */
export type MaterialTransferSent = DomainEvent & {
  type: "procurement.material_transfer_sent";
  transferId: string;
  number: string | null;
  from: TransferSide;
  to: TransferSide;
  /** User id of who approved it; never notified of it. */
  by: string;
  /** User id of who raised the transfer (the sender). */
  createdBy: string;
};

/**
 * A Material Transfer was marked delivered: Transferred in is posted at the
 * destination. The sender is told.
 */
export type MaterialTransferDelivered = DomainEvent & {
  type: "procurement.material_transfer_delivered";
  transferId: string;
  number: string | null;
  from: TransferSide;
  to: TransferSide;
  /** User id of who marked it delivered; never notified of it. */
  by: string;
  createdBy: string;
};

/** A Project raised a Material Request to the Central Store. */
export type MaterialRequestRaised = DomainEvent & {
  type: "procurement.material_request_raised";
  requestId: string;
  number: string | null;
  projectId: string;
  /** The Central Store asked; null when the Company has none yet. */
  storeId: string | null;
  /** User id of who raised it; never notified of it. */
  by: string;
};

/**
 * Material asked for in a Material Request reached its Project: a Delivery
 * Note against it was marked delivered. The requester is told.
 */
export type MaterialRequestDelivered = DomainEvent & {
  type: "procurement.material_request_delivered";
  requestId: string;
  number: string | null;
  deliveryNoteId: string;
  deliveryNoteNumber: string | null;
  projectId: string;
  /** User id of who raised the Material Request. */
  requestedBy: string;
  /** User id of who marked the Delivery Note delivered. */
  by: string;
};
