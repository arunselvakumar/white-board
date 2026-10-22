import { Badge } from "@repo/ui/components/badge";

import { formatPaise } from "@/components/money/money-input";
import {
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderStatus,
} from "@/src/contracts/domain/contract-terms";

export { money, quantity, quantityInput } from "../boq/boq-format";

/** "WO/26-27/00001", or "Draft" before the first submission. */
export function workOrderNumber(number: string | null): string {
  return number ?? "Draft";
}

/** `"5.00"` → `"5%"`, null → "—". */
export function percentText(value: string | null | undefined): string {
  if (value == null) return "—";
  return `${value.replace(/\.?0+$/, "")}%`;
}

/** A percentage as an input value: `"5.00"` → `"5"`. */
export function percentInput(value: string | null | undefined): string {
  return value == null ? "" : value.replace(/\.?0+$/, "");
}

/** `2026-10-20` → `20 Oct 2026`. */
export function dateText(value: string | null | undefined): string {
  if (value == null) return "—";
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An ISO time as `20 Oct 2026`. */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function moneyOrDash(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

function variant(status: WorkOrderStatus) {
  switch (status) {
    case "issued":
      return "default" as const;
    case "cancelled":
      return "destructive" as const;
    case "closed":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <Badge variant={variant(status)}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>
  );
}
