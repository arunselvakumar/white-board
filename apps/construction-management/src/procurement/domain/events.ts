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
