import { optionalText, requiredText } from "@/src/shared-kernel/approval";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { isUuid } from "@/src/shared-kernel/ids";
import { Quantity } from "@/src/shared-kernel/quantity";

/**
 * A Material Request (ADR CM-0015 §2, §11): a Project asks a Central Store
 * for materials. It has no approval; its fulfilment comes from the
 * quantities of Delivery Notes marked delivered. Close ends what is left,
 * which is how a store refuses what it cannot supply.
 */

export const MATERIAL_REQUEST_STATUSES = [
  "requested",
  "partially_delivered",
  "delivered",
  "closed",
] as const;
export type MaterialRequestStatus = (typeof MATERIAL_REQUEST_STATUSES)[number];

export const MATERIAL_REQUEST_STATUS_LABELS: Record<
  MaterialRequestStatus,
  string
> = {
  requested: "Requested",
  partially_delivered: "Partially delivered",
  delivered: "Delivered",
  closed: "Closed",
};

export const MATERIAL_REQUEST_LIMITS = {
  lines: 200,
  receiverName: 200,
} as const;

export type MaterialRequestLineInput = {
  materialId: string;
  askQty: string;
  remark?: string | null;
};

export type MaterialRequestLine = {
  materialId: string;
  /** Decimal string, > 0, three decimals. */
  askQty: string;
  remark: string | null;
};

/** A positive quantity with at most three decimals, as `12.500`. */
export function positiveQuantity(
  raw: string,
  field: string,
  code = "QUANTITY_INVALID",
): string {
  let quantity: Quantity;
  try {
    quantity = Quantity.of(raw.trim(), "unit");
  } catch {
    throw new DomainError(code, "Enter a quantity with at most 3 decimals.", {
      details: { field },
    });
  }
  if (!quantity.isPositive())
    throw new DomainError(code, "A quantity must be more than 0.", {
      details: { field },
    });
  return quantity.toDecimalString();
}

/** The lines of a request: 1–200, one per Material, Ask Qty > 0. */
export function materialRequestLines(
  input: readonly MaterialRequestLineInput[],
): MaterialRequestLine[] {
  if (input.length === 0)
    throw new DomainError(
      "MATERIAL_REQUEST_ITEMS_REQUIRED",
      "Add at least one material.",
      { details: { field: "items" } },
    );
  if (input.length > MATERIAL_REQUEST_LIMITS.lines)
    throw new DomainError(
      "TOO_MANY",
      `Add at most ${String(MATERIAL_REQUEST_LIMITS.lines)} materials.`,
      { details: { field: "items" } },
    );
  const seen = new Set<string>();
  return input.map((line, index) => {
    const materialId = line.materialId.trim().toLowerCase();
    if (!isUuid(materialId))
      throw new DomainError("MATERIAL_NOT_FOUND", "Choose a material.", {
        details: { field: `items.${String(index)}.materialId` },
      });
    if (seen.has(materialId))
      throw new DomainError(
        "MATERIAL_REPEATED",
        "Each material can be on the request once.",
        { details: { field: `items.${String(index)}.materialId` } },
      );
    seen.add(materialId);
    return {
      materialId,
      askQty: positiveQuantity(line.askQty, `items.${String(index)}.askQty`),
      remark: optionalText(line.remark, `items.${String(index)}.remark`),
    };
  });
}

/** Receiver name: trimmed, empty is null, ≤ 200. */
export function receiverName(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (text.length > MATERIAL_REQUEST_LIMITS.receiverName)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(MATERIAL_REQUEST_LIMITS.receiverName)} characters.`,
      { details: { field: "receiverName" } },
    );
  return text === "" ? null : text;
}

type ItemQuantities = { askQty: string; deliveredQty: string };

/**
 * Requested → partially delivered → delivered, from delivered quantities
 * only (CM-0015 §4). A closed request stays closed.
 */
export function deriveMaterialRequestStatus(
  items: readonly ItemQuantities[],
  closed: boolean,
): MaterialRequestStatus {
  if (closed) return "closed";
  let any = false;
  let all = items.length > 0;
  for (const item of items) {
    const ask = Quantity.of(item.askQty, "unit");
    const delivered = Quantity.of(item.deliveredQty, "unit");
    if (delivered.isPositive()) any = true;
    if (delivered.compare(ask) < 0) all = false;
  }
  if (all) return "delivered";
  return any ? "partially_delivered" : "requested";
}

/**
 * What a line still waits for: Ask Qty less what was delivered and what
 * live Delivery Notes not yet delivered already hold (`inFlight`). Never
 * below zero.
 */
export function pendingQuantity(
  askQty: string,
  deliveredQty: string,
  inFlight: string,
): string {
  const pending = Quantity.of(askQty, "unit")
    .subtract(Quantity.of(deliveredQty, "unit"))
    .subtract(Quantity.of(inFlight, "unit"));
  return pending.isNegative() ? "0.000" : pending.toDecimalString();
}

const NAMING = "Material Request";

export function isOpenMaterialRequest(status: MaterialRequestStatus): boolean {
  return status === "requested" || status === "partially_delivered";
}

/** Edit: only while no Delivery Note exists and it is not closed. */
export function assertMaterialRequestEditable(
  status: MaterialRequestStatus,
  deliveryNotes: number,
): void {
  if (status === "closed")
    throw conflict("MATERIAL_REQUEST_CLOSED", `This ${NAMING} is closed.`);
  if (deliveryNotes > 0)
    throw conflict(
      "MATERIAL_REQUEST_HAS_DELIVERY_NOTES",
      `This ${NAMING} has Delivery Notes, so it can no longer be changed.`,
    );
}

/** Delete: refused once a Delivery Note exists (CM-0015 §11). */
export function assertMaterialRequestDeletable(deliveryNotes: number): void {
  if (deliveryNotes > 0)
    throw conflict(
      "MATERIAL_REQUEST_HAS_DELIVERY_NOTES",
      `This ${NAMING} has Delivery Notes, so it cannot be deleted.`,
    );
}

/**
 * Close: the store ends what is left of an open request, with a reason.
 * Refused while a Delivery Note is pending or in transit, so what is
 * closed is exactly what was never sent.
 */
export function closeReason(
  status: MaterialRequestStatus,
  undeliveredNotes: number,
  reason: string | null | undefined,
): string {
  if (!isOpenMaterialRequest(status))
    throw conflict(
      "MATERIAL_REQUEST_NOT_OPEN",
      `This ${NAMING} is ${MATERIAL_REQUEST_STATUS_LABELS[status].toLowerCase()}, so there is nothing left to close.`,
      { status },
    );
  if (undeliveredNotes > 0)
    throw conflict(
      "MATERIAL_REQUEST_HAS_OPEN_DELIVERY_NOTES",
      "Deliver or delete its pending and in-transit Delivery Notes first.",
    );
  return requiredText(reason, "CLOSE_REASON_REQUIRED", "reason");
}
