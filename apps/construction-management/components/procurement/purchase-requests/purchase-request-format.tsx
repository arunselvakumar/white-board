import { Badge } from "@repo/ui/components/badge";

import {
  LOCATION_TYPES,
  type LocationRef,
} from "@/src/shared-kernel/location-ref";

/** Words and badges the Purchase Request screens share (CM-503). */

export const APPROVAL_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export const ORDER_LABELS = {
  not_ordered: "Not ordered",
  partially_ordered: "Partially Ordered",
  ordered: "Ordered",
  excess_ordered: "Excess Ordered",
} as const;

export type ApprovalStatus = keyof typeof APPROVAL_LABELS;
export type OrderStatus = keyof typeof ORDER_LABELS;

/** The list's status chips: approval and fulfilment, never mixed in one filter. */
export const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "ordered", label: "Ordered" },
  { key: "partially_ordered", label: "Partially Ordered" },
  { key: "excess_ordered", label: "Excess Ordered" },
] as const;

export type StatusChip = (typeof STATUS_CHIPS)[number]["key"];

export function chipFilter(chip: StatusChip): {
  approvalStatus?: ApprovalStatus;
  orderStatus?: OrderStatus;
} {
  switch (chip) {
    case "all":
      return {};
    case "pending":
    case "approved":
    case "rejected":
      return { approvalStatus: chip };
    default:
      return { orderStatus: chip };
  }
}

export const LOCATION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LOCATION_TYPES.map((item) => [item.key, item.label]),
);

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge
      variant={
        status === "approved"
          ? "default"
          : status === "rejected"
            ? "destructive"
            : "secondary"
      }
    >
      {APPROVAL_LABELS[status]}
    </Badge>
  );
}

export function OrderBadge({ status }: { status: OrderStatus }) {
  if (status === "not_ordered") return null;
  return (
    <Badge variant={status === "excess_ordered" ? "destructive" : "outline"}>
      {ORDER_LABELS[status]}
    </Badge>
  );
}

/** `12.500` → `12.5`, `10.000` → `10`. */
export function quantityText(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** A LocationRef as the request body takes it (mutable arrays). */
export function siteLocationInput(ref: LocationRef | null) {
  if (ref == null) return null;
  switch (ref.type) {
    case "wing":
      return {
        type: ref.type,
        wingId: ref.wingId,
        floorIds: [...ref.floorIds],
        unitIds: [...ref.unitIds],
      };
    case "amenity":
    case "common_development":
      return { type: ref.type, developmentId: ref.developmentId };
    case "location":
      return { type: ref.type, locationId: ref.locationId };
  }
}
