import { Badge } from "@repo/ui/components/badge";

import {
  BILL_STATUS_LABELS,
  type BillStatus,
} from "@/src/contracts/domain/contract-terms";

export {
  dateText,
  moneyOrDash,
  percentText,
  quantity,
  whenText,
} from "../work-orders/work-order-format";

/** "CB/26-27/00001", or "Draft" before the first submission. */
export function billNumber(number: string | null): string {
  return number ?? "Draft";
}

/** "RA 2", "RA 3 · Final", or "" before submission. */
export function raLabel(bill: {
  ordinal: number | null;
  isFinal: boolean;
}): string {
  if (bill.ordinal == null) return bill.isFinal ? "Final" : "";
  return `RA ${String(bill.ordinal)}${bill.isFinal ? " · Final" : ""}`;
}

function variant(status: BillStatus) {
  switch (status) {
    case "approved":
      return "default" as const;
    case "rejected":
    case "reversed":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  return <Badge variant={variant(status)}>{BILL_STATUS_LABELS[status]}</Badge>;
}

/** "−1 × 0.9 × 2.1", "12.5" for a direct row: how a row's quantity was found. */
export function rowWorking(row: {
  nos: string | null;
  length: string | null;
  breadth: string | null;
  depth: string | null;
  direct: boolean;
}): string {
  if (row.direct) return "Direct";
  const trim = (value: string) => value.replace(/\.?0+$/, "");
  const parts = [row.nos ?? "1", row.length, row.breadth, row.depth]
    .filter((value): value is string => value != null)
    .map((value) => trim(value).replace(/^-/, "−"));
  return parts.join(" × ");
}
