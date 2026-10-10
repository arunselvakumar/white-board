import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { isUuid } from "@/src/shared-kernel/ids";
import { Quantity } from "@/src/shared-kernel/quantity";

import { positiveQuantity } from "./material-request";

/**
 * A Delivery Note (ADR CM-0015 §2, §4, §11): what a Central Store sends
 * against a Material Request. Pending moves nothing; Approve dispatches
 * (Issued at the store); Mark as Delivered receives it at the Project
 * (Received from store) and counts towards the request. There is no
 * reject: a pending note is edited or deleted.
 */

export const DELIVERY_NOTE_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
] as const;
export type DeliveryNoteStatus = (typeof DELIVERY_NOTE_STATUSES)[number];

export const DELIVERY_NOTE_STATUS_LABELS: Record<DeliveryNoteStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  delivered: "Delivered",
};

export function deliveryNoteStatus(note: {
  approvalStatus: "pending" | "approved" | "rejected";
  deliveredAt: Date | null;
}): DeliveryNoteStatus {
  if (note.deliveredAt != null) return "delivered";
  return note.approvalStatus === "approved" ? "in_transit" : "pending";
}

export type DeliveryNoteLineInput = {
  materialRequestItemId: string;
  quantity: string;
};

/** A request line as the store sees it when it sends. */
export type RequestLineAvailability = {
  id: string;
  materialId: string;
  materialName: string;
  /** Decimal string: Ask Qty less delivered less held by other live notes. */
  pendingQty: string;
  /** Decimal string: the store's stock of the material. */
  storeStock: string;
};

export type DeliveryNoteLine = {
  materialRequestItemId: string;
  materialId: string;
  quantity: string;
};

/**
 * Lines of a note: at least one, each a line of the request once, each
 * quantity > 0, at most what the line still waits for and at most the
 * store's stock. Over-pending or short stock is a 409 listing every line.
 */
export function deliveryNoteLines(
  input: readonly DeliveryNoteLineInput[],
  available: ReadonlyMap<string, RequestLineAvailability>,
): DeliveryNoteLine[] {
  if (input.length === 0)
    throw new DomainError(
      "DELIVERY_NOTE_ITEMS_REQUIRED",
      "Enter a delivered quantity for at least one material.",
      { details: { field: "items" } },
    );
  const seen = new Set<string>();
  const lines = input.map((line, index) => {
    const id = line.materialRequestItemId.trim().toLowerCase();
    const field = `items.${String(index)}`;
    const request = isUuid(id) ? available.get(id) : undefined;
    if (request == null)
      throw new DomainError(
        "MATERIAL_REQUEST_ITEM_NOT_FOUND",
        "This material is not on the Material Request.",
        { details: { field: `${field}.materialRequestItemId` } },
      );
    if (seen.has(id))
      throw new DomainError(
        "MATERIAL_REQUEST_ITEM_REPEATED",
        "Each material can be on the note once.",
        { details: { field: `${field}.materialRequestItemId` } },
      );
    seen.add(id);
    return {
      materialRequestItemId: id,
      materialId: request.materialId,
      quantity: positiveQuantity(line.quantity, `${field}.quantity`),
    };
  });

  const overPending = [];
  const short = [];
  for (const line of lines) {
    const request = available.get(line.materialRequestItemId);
    if (request == null) continue;
    const quantity = Quantity.of(line.quantity, "unit");
    if (quantity.compare(Quantity.of(request.pendingQty, "unit")) > 0)
      overPending.push({
        materialRequestItemId: request.id,
        materialName: request.materialName,
        quantity: line.quantity,
        pendingQty: request.pendingQty,
      });
    if (quantity.compare(Quantity.of(request.storeStock, "unit")) > 0)
      short.push({
        materialRequestItemId: request.id,
        materialName: request.materialName,
        quantity: line.quantity,
        storeStock: request.storeStock,
      });
  }
  const [firstOver] = overPending;
  if (firstOver != null)
    throw conflict(
      "DELIVERY_NOTE_EXCEEDS_PENDING",
      `Only ${trim(firstOver.pendingQty)} of ${firstOver.materialName} is still pending on the request.`,
      { lines: overPending },
    );
  const [firstShort] = short;
  if (firstShort != null)
    throw conflict(
      "STOCK_INSUFFICIENT",
      `The store has only ${trim(firstShort.storeStock)} of ${firstShort.materialName}.`,
      { lines: short },
    );
  return lines;
}

function trim(decimal: string): string {
  return decimal.includes(".")
    ? decimal.replace(/0+$/, "").replace(/\.$/, "")
    : decimal;
}

const NAMING = "Delivery Note";

/** Edit and delete: a pending note only. */
export function assertDeliveryNotePending(status: DeliveryNoteStatus): void {
  if (status !== "pending")
    throw conflict(
      "DELIVERY_NOTE_NOT_PENDING",
      `This ${NAMING} is ${DELIVERY_NOTE_STATUS_LABELS[status].toLowerCase()}, not pending.`,
      { status },
    );
}

/** Mark as Delivered: an approved note not yet delivered, on or after its date. */
export function assertDeliverable(
  status: DeliveryNoteStatus,
  deliveryDate: string,
  deliveredOn: string,
): void {
  if (status !== "in_transit")
    throw conflict(
      "DELIVERY_NOTE_NOT_IN_TRANSIT",
      status === "pending"
        ? `Approve this ${NAMING} before marking it delivered.`
        : `This ${NAMING} is already delivered.`,
      { status },
    );
  if (deliveredOn < deliveryDate)
    throw new DomainError(
      "DELIVERED_BEFORE_DISPATCH",
      `The delivery date cannot be before the note's date, ${deliveryDate}.`,
      { details: { field: "deliveredOn" } },
    );
}
