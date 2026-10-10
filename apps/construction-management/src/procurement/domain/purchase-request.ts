import {
  optionalText,
  type ApprovalStatus,
} from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { Quantity } from "@/src/shared-kernel/quantity";

import { PROCUREMENT_DOCUMENTS } from "./documents";

/**
 * Purchase Requests (CM-503, ADR CM-0015 §2 and §7): the site asks for
 * materials; an approver decides; Purchase Orders (or Mark as Ordered)
 * fulfil it. Approval and fulfilment are two statuses.
 */

export const PURCHASE_REQUEST = PROCUREMENT_DOCUMENTS.purchase_request.naming;

export const ORDER_STATUSES = [
  "not_ordered",
  "partially_ordered",
  "ordered",
  "excess_ordered",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PURCHASE_REQUEST_SOURCES = ["manual", "inventory"] as const;
export type PurchaseRequestSource = (typeof PURCHASE_REQUEST_SOURCES)[number];

export const PURCHASE_REQUEST_LIMITS = {
  /** Materials on one Purchase Request. */
  maxItems: 200,
  /** `decimal(14,3)`: eleven whole digits. */
  maxQuantityMilli: 10n ** 14n - 1n,
} as const;

/** What a line copies from the Material master at save. */
export type LineMaterial = {
  id: string;
  name: string;
  uomId: string;
  uomName: string;
  categoryId: string | null;
  disabled: boolean;
};

export type PurchaseRequestLineInput = {
  materialId: string;
  quantity: string;
  remark?: string | null;
};

export type PurchaseRequestLine = {
  materialId: string;
  materialName: string;
  categoryId: string | null;
  uomId: string;
  uomName: string;
  /** Decimal string with three decimals. */
  quantity: string;
  remark: string | null;
};

/**
 * A quantity > 0 with at most three decimals that fits `decimal(14,3)`, as
 * `12.500`. Throws 400 `QUANTITY_INVALID` with the line's index.
 */
export function lineQuantity(raw: string, index: number): string {
  let quantity: Quantity;
  try {
    quantity = Quantity.of(raw, "line");
  } catch {
    throw new DomainError(
      "QUANTITY_INVALID",
      "Enter a quantity with at most three decimals.",
      { details: { field: "quantity", index } },
    );
  }
  if (!quantity.isPositive())
    throw new DomainError(
      "QUANTITY_INVALID",
      "A quantity must be more than 0.",
      { details: { field: "quantity", index } },
    );
  if (quantity.toMilli() > PURCHASE_REQUEST_LIMITS.maxQuantityMilli)
    throw new DomainError("QUANTITY_INVALID", "This quantity is too large.", {
      details: { field: "quantity", index },
    });
  return quantity.toDecimalString();
}

/**
 * The lines of a Purchase Request: at least one, each Material once, live
 * and enabled (400 `MATERIAL_NOT_FOUND` naming the unknown ids). The name,
 * unit and category are copied from the master. A line keeps its remark
 * only when the request has separate remarks.
 */
export function purchaseRequestLines(
  inputs: readonly PurchaseRequestLineInput[],
  materials: ReadonlyMap<string, LineMaterial>,
  separateRemarks: boolean,
): PurchaseRequestLine[] {
  if (inputs.length === 0)
    throw new DomainError("ITEMS_REQUIRED", "Add at least one material.", {
      details: { field: "items" },
    });
  if (inputs.length > PURCHASE_REQUEST_LIMITS.maxItems)
    throw new DomainError(
      "TOO_MANY_ITEMS",
      `Add at most ${String(PURCHASE_REQUEST_LIMITS.maxItems)} materials.`,
      { details: { field: "items" } },
    );
  const seen = new Set<string>();
  const repeated = inputs
    .map((input) => input.materialId)
    .filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (repeated.length > 0)
    throw new DomainError(
      "MATERIAL_REPEATED",
      "Each material can be on the request once. Change its quantity instead.",
      { details: { field: "materialId", ids: [...new Set(repeated)] } },
    );
  const missing = inputs
    .map((input) => input.materialId)
    .filter((id) => {
      const material = materials.get(id);
      return material == null || material.disabled;
    });
  if (missing.length > 0)
    throw new DomainError(
      "MATERIAL_NOT_FOUND",
      "Some materials were not found or are disabled. Choose them again.",
      { details: { field: "materialId", ids: missing } },
    );
  return inputs.map((input, index) => {
    const material = materials.get(input.materialId);
    if (material == null) throw new Error("checked above");
    return {
      materialId: material.id,
      materialName: material.name,
      categoryId: material.categoryId,
      uomId: material.uomId,
      uomName: material.uomName,
      quantity: lineQuantity(input.quantity, index),
      remark: separateRemarks ? optionalText(input.remark, "remark") : null,
    };
  });
}

/** Required Date, when given, is on or after the request date. */
export function assertRequiredDate(
  requestDate: CalendarDate,
  requiredDate: CalendarDate | null,
): void {
  if (requiredDate != null && requiredDate < requestDate)
    throw new DomainError(
      "REQUIRED_DATE_BEFORE_REQUEST_DATE",
      "Required Date cannot be before the Purchase Request Date.",
      { details: { field: "requiredDate" } },
    );
}

/** A document date is not after the Company's today. */
export function assertNotFuture(
  date: CalendarDate,
  today: CalendarDate,
  field: string,
): void {
  if (date > today)
    throw new DomainError(
      "DATE_IN_FUTURE",
      "This date cannot be after today.",
      {
        details: { field },
      },
    );
}

/** The state the edit and fulfilment rules read. */
export type PurchaseRequestState = {
  approvalStatus: ApprovalStatus;
  orderStatus: OrderStatus;
  markedOrderedAt: Date | null;
};

/** Editable while pending or rejected (CM-0015 §2); 409 otherwise. */
export function assertPurchaseRequestEditable(
  state: PurchaseRequestState,
): void {
  if (state.approvalStatus === "approved")
    throw conflict(
      "PURCHASE_REQUEST_NOT_EDITABLE",
      "An approved Purchase Request cannot be edited.",
      { status: state.approvalStatus },
    );
}

/** A Purchase Request a Purchase Order line points at is never deleted (§7). */
export function assertPurchaseRequestDeletable(orderLines: number): void {
  if (orderLines > 0)
    throw conflict(
      "PURCHASE_REQUEST_HAS_ORDERS",
      "Purchase Orders were raised against this Purchase Request, so it cannot be deleted.",
      { orderLines },
    );
}

/** Whether more can be ordered against it: approved, not (fully) ordered. */
export function isOrderable(state: PurchaseRequestState): boolean {
  return (
    state.approvalStatus === "approved" &&
    state.markedOrderedAt == null &&
    (state.orderStatus === "not_ordered" ||
      state.orderStatus === "partially_ordered")
  );
}

/** Mark as Ordered: from approved (not ordered) or partially ordered (§7). */
export function assertCanMarkOrdered(state: PurchaseRequestState): void {
  if (!isOrderable(state))
    throw conflict(
      "PURCHASE_REQUEST_NOT_ORDERABLE",
      state.approvalStatus === "approved"
        ? "This Purchase Request is already ordered."
        : `This Purchase Request is ${state.approvalStatus}, not approved.`,
      {
        approvalStatus: state.approvalStatus,
        orderStatus: state.orderStatus,
      },
    );
}

/** A Purchase Order may be raised against it (Generate PO, PR on a PO). */
export function assertCanOrderAgainst(state: PurchaseRequestState): void {
  assertCanMarkOrdered(state);
}

/**
 * The fulfilment status from each item's requested and ordered quantity
 * (`modules/06` P3): Mark as Ordered wins; any item ordered beyond its
 * request is excess (a warning, not a block); every item fully ordered is
 * ordered; something ordered is partially ordered; else not ordered.
 */
export function orderStatusOf(
  items: readonly { quantity: string; orderedQty: string }[],
  markedOrdered: boolean,
): OrderStatus {
  if (markedOrdered) return "ordered";
  let anyOrdered = false;
  let allCovered = items.length > 0;
  let excess = false;
  for (const item of items) {
    const requested = Quantity.of(item.quantity, "q");
    const ordered = Quantity.of(item.orderedQty, "q");
    if (ordered.isPositive()) anyOrdered = true;
    const comparison = ordered.compare(requested);
    if (comparison > 0) excess = true;
    if (comparison < 0) allCovered = false;
  }
  if (excess) return "excess_ordered";
  if (allCovered) return "ordered";
  return anyOrdered ? "partially_ordered" : "not_ordered";
}

/** Requested − ordered, never below zero. */
export function pendingQuantity(quantity: string, orderedQty: string): string {
  const pending = Quantity.of(quantity, "q").subtract(
    Quantity.of(orderedQty, "q"),
  );
  return pending.isNegative() ? "0.000" : pending.toDecimalString();
}

/**
 * Balanced estimated qty (step 2 of the wizard): the estimated quantity
 * less what is in stock and what is already requested or ordered but not
 * received. Null without an estimate; negative when more is covered than
 * estimated.
 */
export function balancedEstimatedQty(
  estimatedQty: string | null,
  stock: string,
  onTheWay: string,
): string | null {
  if (estimatedQty == null) return null;
  return Quantity.of(estimatedQty, "q")
    .subtract(Quantity.of(stock, "q"))
    .subtract(Quantity.of(onTheWay, "q"))
    .toDecimalString();
}
