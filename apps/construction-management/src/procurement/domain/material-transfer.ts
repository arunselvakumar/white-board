import type { ApprovalStatus } from "@/src/shared-kernel/approval";
import { optionalText } from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import { PROCUREMENT_DOCUMENTS } from "./documents";
import { sameStockLocation, type StockLocation } from "./stock-location";
import { MAX_MOVEMENT_LINES, movementQuantity } from "./stock-movement";

/**
 * A Material Transfer (CM-507, ADR CM-0015 §4): stock moving Project ↔
 * Project, Project ↔ Store or Store ↔ Store. Pending moves nothing;
 * Approve dispatches it (Transferred out at the source on the transfer
 * date); Mark as Delivered receives it (Transferred in at the destination
 * on the delivery date). Reject moves nothing. Only a pending transfer is
 * edited or deleted.
 */

export const TRANSFER_NAMING = PROCUREMENT_DOCUMENTS.material_transfer.naming;

export const TRANSFER_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
  "rejected",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  delivered: "Delivered",
  rejected: "Rejected",
};

export type TransferType =
  | "project_to_project"
  | "project_to_store"
  | "store_to_project"
  | "store_to_store";

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  project_to_project: "Project to Project",
  project_to_store: "Project to Store",
  store_to_project: "Store to Project",
  store_to_store: "Store to Store",
};

export const RECEIVER_NAME_MAX = 120;

export type TransferState = {
  approvalStatus: ApprovalStatus;
  deliveredOn: CalendarDate | null;
};

export function transferStatus(state: TransferState): TransferStatus {
  if (state.approvalStatus === "pending") return "pending";
  if (state.approvalStatus === "rejected") return "rejected";
  return state.deliveredOn == null ? "in_transit" : "delivered";
}

export function transferType(
  from: StockLocation,
  to: StockLocation,
): TransferType {
  return `${from.kind}_to_${to.kind}` as TransferType;
}

/** 400 `TRANSFER_SAME_LOCATION` when the source is the destination. */
export function assertTransferRoute(
  from: StockLocation,
  to: StockLocation,
): void {
  if (sameStockLocation(from, to))
    throw new DomainError(
      "TRANSFER_SAME_LOCATION",
      "Choose a destination other than the source.",
      { details: { field: "to" } },
    );
}

export type TransferLineInput = {
  materialId: string;
  quantity: string;
  remark?: string | null;
};

export type TransferLine = {
  materialId: string;
  /** `12.500`. */
  quantity: string;
  remark: string | null;
};

/** 1–100 lines, each material once, quantities above 0. */
export function transferLines(
  lines: readonly TransferLineInput[],
): TransferLine[] {
  if (lines.length === 0)
    throw new DomainError("TRANSFER_LINES_REQUIRED", "Add a material.", {
      details: { field: "lines" },
    });
  if (lines.length > MAX_MOVEMENT_LINES)
    throw new DomainError(
      "TRANSFER_TOO_MANY_LINES",
      `Add at most ${String(MAX_MOVEMENT_LINES)} materials.`,
      { details: { field: "lines" } },
    );
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const materialId = line.materialId.toLowerCase();
    if (seen.has(materialId))
      throw new DomainError(
        "TRANSFER_MATERIAL_REPEATED",
        "Each material can be on a transfer once.",
        { details: { field: `lines.${String(index)}.materialId` } },
      );
    seen.add(materialId);
    return {
      materialId,
      quantity: movementQuantity(
        line.quantity,
        `lines.${String(index)}.quantity`,
      ),
      remark: optionalText(line.remark, `lines.${String(index)}.remark`),
    };
  });
}

export function receiverName(raw: string | null | undefined): string | null {
  const name = raw?.trim() ?? "";
  if (name.length > RECEIVER_NAME_MAX)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(RECEIVER_NAME_MAX)} characters.`,
      { details: { field: "receiverName" } },
    );
  return name === "" ? null : name;
}

/** 409 `MATERIAL_TRANSFER_NOT_PENDING`: only a pending transfer is edited or deleted. */
export function assertTransferPending(state: TransferState): void {
  const status = transferStatus(state);
  if (status !== "pending")
    throw conflict(
      `${TRANSFER_NAMING.code}_NOT_PENDING`,
      `This ${TRANSFER_NAMING.label} is ${TRANSFER_STATUS_LABELS[status].toLowerCase()}, not pending.`,
      { status },
    );
}

/**
 * Mark as Delivered: the transfer is in transit, and the delivery date is
 * on or after the transfer date and not after today.
 */
export function assertDeliverable(
  state: TransferState,
  transferDate: CalendarDate,
  deliveredOn: CalendarDate,
  today: CalendarDate,
): void {
  const status = transferStatus(state);
  if (status !== "in_transit")
    throw conflict(
      `${TRANSFER_NAMING.code}_NOT_IN_TRANSIT`,
      status === "pending"
        ? `Approve this ${TRANSFER_NAMING.label} before marking it delivered.`
        : `This ${TRANSFER_NAMING.label} is ${TRANSFER_STATUS_LABELS[status].toLowerCase()}.`,
      { status },
    );
  if (deliveredOn < transferDate)
    throw new DomainError(
      "DELIVERY_DATE_BEFORE_TRANSFER",
      "The delivery date cannot be before the transfer date.",
      { details: { field: "deliveredOn" } },
    );
  if (deliveredOn > today)
    throw new DomainError(
      "DELIVERY_DATE_IN_FUTURE",
      "The delivery date cannot be after today.",
      { details: { field: "deliveredOn" } },
    );
}

/** Transfer dates are today or earlier. */
export function assertTransferDate(
  date: CalendarDate,
  today: CalendarDate,
): void {
  if (date > today)
    throw new DomainError(
      "TRANSFER_DATE_IN_FUTURE",
      "The transfer date cannot be after today.",
      { details: { field: "transferDate" } },
    );
}
