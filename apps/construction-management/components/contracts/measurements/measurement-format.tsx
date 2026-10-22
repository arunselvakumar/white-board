import { Badge } from "@repo/ui/components/badge";

import {
  MEASUREMENT_STATUS_LABELS,
  SIDE_LABELS,
  type MeasurementStatus,
  type Side,
} from "@/src/contracts/domain/contract-terms";

export { quantity, quantityInput } from "../boq/boq-format";
export { dateText } from "../work-orders/work-order-format";

/** Short status words for badges ("Checked", not the JMR's full name). */
const SHORT: Record<MeasurementStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  checked: "Checked",
};

export function MeasurementStatusBadge({
  status,
  billed = false,
}: {
  status: MeasurementStatus;
  billed?: boolean;
}) {
  if (billed) return <Badge variant="outline">Billed</Badge>;
  return (
    <Badge
      variant={status === "checked" ? "default" : "secondary"}
      title={MEASUREMENT_STATUS_LABELS[status]}
    >
      {SHORT[status]}
    </Badge>
  );
}

/** "Client side" / "Contractor side · WO/26-27/00001". */
export function sideText(side: Side, workOrderNumber: string | null): string {
  const base = `${SIDE_LABELS[side]} side`;
  return workOrderNumber == null ? base : `${base} · ${workOrderNumber}`;
}

/** `"12.50"` → `"12.5%"`. */
export function percentText(value: string | null | undefined): string {
  if (value == null) return "—";
  return `${value.replace(/\.?0+$/, "")}%`;
}
