import {
  requiredText,
  type ApprovalStatus,
  type DocumentNaming,
} from "@/src/shared-kernel/approval";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import {
  assertBoqAmount,
  boqDescription,
  boqItemNo,
  boqItemQuantity,
  boqItemRate,
  boqSacHsn,
} from "./boq";

/**
 * A Variation (CM-1103, ADR CM-0023 §4): the only way to change a BOQ
 * item's quantity or rate once a checked measurement names it, and the way
 * to add an extra item. It is numbered by the `variation` sequence rule,
 * carries a reason and waits for the BOQ menu's Approve flag. On approval:
 *
 * - an **extra item** creates its BOQ item, whose original figures are the
 *   Variation's;
 * - a **quantity** or **rate** change sets the item's current figure and
 *   keeps the one it replaced on the Variation (`previous*`).
 */

export const VARIATION_KINDS = ["extra_item", "quantity", "rate"] as const;
export type VariationKind = (typeof VARIATION_KINDS)[number];

export const VARIATION_KIND_LABELS: Record<VariationKind, string> = {
  extra_item: "Extra item",
  quantity: "Quantity change",
  rate: "Rate change",
};

/** As stored; the approval kernel says `pending`. */
export const VARIATION_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];

export const VARIATION_NAMING: DocumentNaming = {
  code: "VARIATION",
  label: "Variation",
};

export function toApprovalStatus(status: VariationStatus): ApprovalStatus {
  return status === "pending_approval" ? "pending" : status;
}

export function fromApprovalStatus(status: ApprovalStatus): VariationStatus {
  return status === "pending" ? "pending_approval" : status;
}

export type VariationInput = {
  kind: VariationKind;
  reason: string;
  /** Quantity and rate changes: the BOQ item changed. */
  boqItemId?: string | null;
  /** Extra item: the section it joins and what it adds. */
  sectionId?: string | null;
  itemNo?: string | null;
  description?: string | null;
  uomId?: string | null;
  sacHsn?: string | null;
  /** Extra item and quantity change. */
  newQuantity?: string | number | null;
  /** Extra item and rate change: paise per UoM. */
  newRate?: number | bigint | null;
};

export type VariationContent =
  | {
      kind: "extra_item";
      reason: string;
      sectionId: string;
      itemNo: string;
      description: string;
      uomId: string;
      sacHsn: string | null;
      newQuantity: bigint;
      newRate: bigint;
    }
  | { kind: "quantity"; reason: string; boqItemId: string; newQuantity: bigint }
  | { kind: "rate"; reason: string; boqItemId: string; newRate: bigint };

function required(
  value: string | null | undefined,
  code: string,
  message: string,
  name: string,
): string {
  const text = value?.trim() ?? "";
  if (text === "")
    throw new DomainError(code, message, { details: { field: name } });
  return text;
}

/** Checks what a Variation of `input.kind` needs; anything else sent is dropped. */
export function variationContent(input: VariationInput): VariationContent {
  const reason = requiredText(
    input.reason,
    "VARIATION_REASON_REQUIRED",
    "reason",
  );
  switch (input.kind) {
    case "extra_item": {
      const sectionId = required(
        input.sectionId,
        "VARIATION_SECTION_REQUIRED",
        "Pick the section the extra item joins.",
        "sectionId",
      );
      const itemNo = boqItemNo(input.itemNo);
      const description = boqDescription(input.description);
      const uomId = required(
        input.uomId,
        "BOQ_ITEM_UOM_REQUIRED",
        "Pick the item's UoM.",
        "uomId",
      );
      const sacHsn = boqSacHsn(input.sacHsn);
      const newQuantity = boqItemQuantity(input.newQuantity, "newQuantity");
      const newRate = boqItemRate(input.newRate ?? -1, "newRate");
      assertBoqAmount(newQuantity, newRate);
      return {
        kind: "extra_item",
        reason,
        sectionId,
        itemNo,
        description,
        uomId,
        sacHsn,
        newQuantity,
        newRate,
      };
    }
    case "quantity":
      return {
        kind: "quantity",
        reason,
        boqItemId: required(
          input.boqItemId,
          "VARIATION_ITEM_REQUIRED",
          "Pick the BOQ item.",
          "boqItemId",
        ),
        newQuantity: boqItemQuantity(input.newQuantity, "newQuantity"),
      };
    case "rate":
      return {
        kind: "rate",
        reason,
        boqItemId: required(
          input.boqItemId,
          "VARIATION_ITEM_REQUIRED",
          "Pick the BOQ item.",
          "boqItemId",
        ),
        newRate: boqItemRate(input.newRate ?? -1, "newRate"),
      };
  }
}

/** The figures a quantity or rate change replaces and sets. */
export type CurrentFigures = { quantity: bigint; rate: bigint };

/**
 * What an approved quantity or rate change does to its item: the new
 * current figures, and the ones it replaced (kept on the Variation). The
 * amount must stay within ₹1,000 crore.
 */
export function appliedChange(
  content:
    | { kind: "quantity"; newQuantity: bigint }
    | { kind: "rate"; newRate: bigint },
  current: CurrentFigures,
): {
  next: CurrentFigures;
  previousQuantity: bigint | null;
  previousRate: bigint | null;
} {
  const next =
    content.kind === "quantity"
      ? { quantity: content.newQuantity, rate: current.rate }
      : { quantity: current.quantity, rate: content.newRate };
  assertBoqAmount(next.quantity, next.rate);
  return {
    next,
    previousQuantity: content.kind === "quantity" ? current.quantity : null,
    previousRate: content.kind === "rate" ? current.rate : null,
  };
}

export const variationNotFound = () =>
  notFound("VARIATION_NOT_FOUND", "This Variation was not found.");

export const variationChanged = () =>
  conflict(
    "VARIATION_CHANGED",
    "Someone changed this Variation after you opened it. Reload to see the latest.",
  );

/** A quantity or rate change already waits for approval on this item. */
export const variationPending = (number: string) =>
  conflict(
    "VARIATION_PENDING",
    `Variation ${number} already waits for approval on this item. Approve, reject or edit it first.`,
    { number },
  );

/** Only a pending Variation can be edited or deleted. */
export const variationNotPending = (status: VariationStatus) =>
  conflict(
    "VARIATION_NOT_PENDING",
    `This Variation is ${status === "approved" ? "approved" : "rejected"}, not pending.`,
    { status: toApprovalStatus(status) },
  );
