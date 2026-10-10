import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  approvedState,
  optionalText,
  pendingState,
  requiredText,
  type ApprovalState,
  type ApprovalStatus,
  type Decider,
} from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import {
  defaultSupplyType,
  documentTotals,
  lineAmounts,
  type DocumentTotals,
  type LineAmounts,
  type LineDiscount,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";

import { PROCUREMENT_DOCUMENTS } from "./documents";
import { lineQuantity, type LineMaterial } from "./purchase-request";

/**
 * Purchase Orders (CM-504, ADR CM-0015 §2, §6 and §8): a priced order to a
 * Supplier for a Project or a Store, with GST split by state. Totals are
 * computed here from the lines with the kernel's GST math, on the server
 * as in the browser; a client's totals are never trusted.
 */

export const PURCHASE_ORDER = PROCUREMENT_DOCUMENTS.purchase_order.naming;

export const RECEIPT_STATUSES = [
  "not_received",
  "partially_received",
  "received",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const PURCHASE_ORDER_LIMITS = {
  maxItems: 200,
  maxTerms: 20,
  /** Payment Terms (Days). */
  maxPaymentTermsDays: 3650,
  maxAddressLength: 1000,
  maxNameLength: 120,
} as const;

const HSN_RE = /^\d{4}(\d{2}){0,2}$/;

export type PurchaseOrderLineInput = {
  materialId: string;
  purchaseRequestItemId?: string | null;
  quantity: string;
  /** Paise per unit. */
  unitRate: bigint;
  discount?: LineDiscount;
  /** Percent string, 0–100. */
  gstRate?: string | null;
  hsnCode?: string | null;
  remark?: string | null;
};

export type PurchaseOrderLine = LineAmounts & {
  materialId: string;
  materialName: string;
  uomId: string;
  uomName: string;
  purchaseRequestItemId: string | null;
  hsnCode: string | null;
  quantity: string;
  unitRate: bigint;
  discountType: "amount" | "percent" | null;
  /** Two decimals when the discount is a percent. */
  discountPercent: string | null;
  /** Two decimals. */
  gstRate: string;
  remark: string | null;
};

/** A percent with two decimals: `"18"` → `"18.00"`. */
function twoDecimals(raw: string): string {
  const [whole = "0", fraction = ""] = raw.trim().split(".");
  return `${String(Number(whole))}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

/** HSN of 4, 6 or 8 digits, or null. */
export function hsnCode(raw: string | null | undefined, index: number) {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (!HSN_RE.test(value))
    throw new DomainError("HSN_INVALID", "An HSN code has 4, 6 or 8 digits.", {
      details: { field: "hsnCode", index },
    });
  return value;
}

function withIndex(error: unknown, index: number): unknown {
  if (error instanceof DomainError)
    return new DomainError(error.code, error.message, {
      kind: error.kind,
      details: { index },
    });
  return error;
}

/**
 * Prices the lines of a Purchase Order: each Material live and enabled
 * (400 `MATERIAL_NOT_FOUND`), quantity > 0 (≤ 3 decimals), the discount
 * and GST % within 0–100, HSN 4–8 digits; amounts by `lineAmounts` for
 * the supply type. Name and unit are copied from the master.
 */
export function purchaseOrderLines(
  inputs: readonly PurchaseOrderLineInput[],
  materials: ReadonlyMap<string, LineMaterial>,
  supplyType: SupplyType,
): PurchaseOrderLine[] {
  if (inputs.length === 0)
    throw new DomainError("ITEMS_REQUIRED", "Add at least one material.", {
      details: { field: "items" },
    });
  if (inputs.length > PURCHASE_ORDER_LIMITS.maxItems)
    throw new DomainError(
      "TOO_MANY_ITEMS",
      `Add at most ${String(PURCHASE_ORDER_LIMITS.maxItems)} materials.`,
      { details: { field: "items" } },
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
      { details: { field: "materialId", ids: [...new Set(missing)] } },
    );
  return inputs.map((input, index) => {
    const material = materials.get(input.materialId);
    if (material == null) throw new Error("checked above");
    const quantity = lineQuantity(input.quantity, index);
    const discount = input.discount ?? null;
    const gstRate = input.gstRate?.trim() ?? "";
    let amounts: LineAmounts;
    try {
      amounts = lineAmounts(
        {
          quantity,
          unitRate: input.unitRate,
          discount,
          gstRate: gstRate === "" ? "0" : gstRate,
        },
        supplyType,
      );
    } catch (error) {
      throw withIndex(error, index);
    }
    return {
      ...amounts,
      materialId: material.id,
      materialName: material.name,
      uomId: material.uomId,
      uomName: material.uomName,
      purchaseRequestItemId: input.purchaseRequestItemId ?? null,
      hsnCode: hsnCode(input.hsnCode, index),
      quantity,
      unitRate: input.unitRate,
      discountType: discount?.type ?? null,
      discountPercent:
        discount?.type === "percent" ? twoDecimals(discount.percent) : null,
      gstRate: twoDecimals(gstRate === "" ? "0" : gstRate),
      remark: optionalText(input.remark, "remark"),
    };
  });
}

/** Header totals from the priced lines (CM-0015 §6). */
export function purchaseOrderTotals(
  lines: readonly PurchaseOrderLine[],
  charges: { additionalCharges: bigint; deductionAmount: bigint },
): DocumentTotals {
  return documentTotals(lines, charges);
}

/**
 * Place of supply (§6): the delivery address's state when "Delivery
 * address is other than the Project address" is ticked, else the
 * Project's (or Store's) state; null when unknown.
 */
export function placeOfSupply(input: {
  deliveryAddressDiffers: boolean;
  deliveryStateCode: string | null;
  locationStateCode: string | null;
}): string | null {
  return input.deliveryAddressDiffers
    ? input.deliveryStateCode
    : input.locationStateCode;
}

/** The supply type the form asked for, or the default from the states. */
export function supplyTypeFor(input: {
  requested: SupplyType | null;
  supplierStateCode: string | null;
  placeOfSupplyStateCode: string | null;
}): SupplyType {
  return (
    input.requested ??
    defaultSupplyType(input.supplierStateCode, input.placeOfSupplyStateCode)
  );
}

export type DeliveryAddress = {
  deliveryAddressDiffers: boolean;
  deliveryAddress: string | null;
  deliveryStateCode: string | null;
};

/** The delivery override: address and GST state required when ticked. */
export function deliveryAddress(input: {
  differs: boolean;
  address?: string | null;
  stateCode?: string | null;
}): DeliveryAddress {
  if (!input.differs)
    return {
      deliveryAddressDiffers: false,
      deliveryAddress: null,
      deliveryStateCode: null,
    };
  const address = input.address?.trim() ?? "";
  if (address === "")
    throw new DomainError(
      "DELIVERY_ADDRESS_REQUIRED",
      "Enter the delivery address.",
      { details: { field: "deliveryAddress" } },
    );
  if (address.length > PURCHASE_ORDER_LIMITS.maxAddressLength)
    throw new DomainError("TEXT_TOO_LONG", "This address is too long.", {
      details: { field: "deliveryAddress" },
    });
  const stateCode = input.stateCode?.trim() ?? "";
  if (stateCode !== "" && !isGstStateCode(stateCode))
    throw new DomainError("STATE_INVALID", "Choose a state from the list.", {
      details: { field: "deliveryStateCode" },
    });
  return {
    deliveryAddressDiffers: true,
    deliveryAddress: address,
    deliveryStateCode: stateCode === "" ? null : stateCode,
  };
}

export type PointOfContact = { name: string | null; mobile: string | null };

/** A Supplier or Site POC: a name and an Indian mobile, both optional. */
export function pointOfContact(
  input: { name?: string | null; mobile?: string | null },
  field: "supplierPoc" | "sitePoc",
): PointOfContact {
  const name = input.name?.trim() ?? "";
  if (name.length > PURCHASE_ORDER_LIMITS.maxNameLength)
    throw new DomainError("TEXT_TOO_LONG", "This name is too long.", {
      details: { field: `${field}Name` },
    });
  const rawMobile = input.mobile?.trim() ?? "";
  let mobile: string | null = null;
  if (rawMobile !== "") {
    mobile = normalizeMobile(rawMobile);
    if (mobile?.startsWith("+91") !== true)
      throw new DomainError(
        "MOBILE_INVALID",
        "Enter a 10-digit Indian mobile number, like 77081 65767.",
        { details: { field: `${field}Mobile` } },
      );
  }
  return { name: name === "" ? null : name, mobile };
}

export function paymentTermsDays(raw: number | null | undefined) {
  if (raw == null) return null;
  if (
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > PURCHASE_ORDER_LIMITS.maxPaymentTermsDays
  )
    throw new DomainError(
      "PAYMENT_TERMS_INVALID",
      "Payment Terms are whole days, 0 to 3650.",
      { details: { field: "paymentTermsDays" } },
    );
  return raw;
}

/** Expected Delivery Date is on or after the PO date. */
export function assertExpectedDeliveryDate(
  orderDate: CalendarDate,
  expectedDeliveryDate: CalendarDate,
): void {
  if (expectedDeliveryDate < orderDate)
    throw new DomainError(
      "EXPECTED_DELIVERY_BEFORE_ORDER_DATE",
      "Expected Delivery Date cannot be before the Purchase Order Date.",
      { details: { field: "expectedDeliveryDate" } },
    );
}

/** What the state rules of a Purchase Order read. */
export type PurchaseOrderState = {
  approvalStatus: ApprovalStatus;
  orderedAt: Date | null;
  closedAt: Date | null;
  receiptStatus: ReceiptStatus;
};

/**
 * The approval state after an edit (§2): pending, or approved with Save &
 * Approve. Ordered (or closed) POs are not edited: Close and raise again.
 * Editing an approved, not-yet-ordered PO sends it back to pending.
 */
export function editedApproval(
  state: PurchaseOrderState,
  approveNow: Decider | null,
): ApprovalState {
  if (state.orderedAt != null || state.closedAt != null)
    throw conflict(
      "PURCHASE_ORDER_NOT_EDITABLE",
      "An ordered Purchase Order cannot be edited. Close it and raise a new one.",
      { status: state.approvalStatus },
    );
  return approveNow == null ? pendingState() : approvedState(approveNow);
}

/** Mark as Ordered: approved and not yet ordered. */
export function assertCanMarkPurchaseOrderOrdered(
  state: PurchaseOrderState,
): void {
  if (state.approvalStatus !== "approved" || state.orderedAt != null)
    throw conflict(
      "PURCHASE_ORDER_NOT_ORDERABLE",
      state.orderedAt != null
        ? "This Purchase Order is already marked as ordered."
        : `This Purchase Order is ${state.approvalStatus}, not approved.`,
      { approvalStatus: state.approvalStatus },
    );
}

/**
 * Close (§8): an ordered PO that is not fully received stops expecting
 * more; the reason is required.
 */
export function closeReason(
  state: PurchaseOrderState,
  reason: string | null | undefined,
): string {
  if (
    state.orderedAt == null ||
    state.closedAt != null ||
    state.receiptStatus === "received"
  )
    throw conflict(
      "PURCHASE_ORDER_NOT_CLOSABLE",
      state.closedAt != null
        ? "This Purchase Order is already closed."
        : state.orderedAt == null
          ? "Only an ordered Purchase Order can be closed."
          : "This Purchase Order is fully received.",
    );
  return requiredText(reason, "CLOSE_REASON_REQUIRED", "reason");
}

/** A PO with a Goods Receipt against it is never deleted (§8). */
export function assertPurchaseOrderDeletable(goodsReceipts: number): void {
  if (goodsReceipts > 0)
    throw conflict(
      "PURCHASE_ORDER_HAS_RECEIPTS",
      "Goods were received against this Purchase Order, so it cannot be deleted.",
      { goodsReceipts },
    );
}

/** The fulfilment a list shows: ordered and closed are dates, receipt is GRN-derived. */
export type PurchaseOrderStage =
  "pending" | "approved" | "rejected" | "ordered" | "closed";

export function purchaseOrderStage(
  state: PurchaseOrderState,
): PurchaseOrderStage {
  if (state.closedAt != null) return "closed";
  if (state.orderedAt != null) return "ordered";
  return state.approvalStatus;
}

/** An amount of paise that fits a JSON number exactly. */
export function assertSafePaise(value: bigint, field: string): void {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < -BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new DomainError("AMOUNT_TOO_LARGE", "This amount is too large.", {
      details: { field },
    });
}
