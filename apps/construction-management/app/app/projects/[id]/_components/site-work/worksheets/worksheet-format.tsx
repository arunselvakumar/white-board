import { Badge } from "@repo/ui/components/badge";

import {
  SHEET_APPROVAL_LABELS,
  WORK_SHIFT_LABELS,
  type SheetApprovalStatus,
  type WorkShift,
} from "@/src/site-work/domain/shift";

/** Words, paths and badges the Daily Worksheet screens share (CM-602). */

export function worksheetsPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/worksheets${rest}`;
}

export function shiftLabel(shift: string): string {
  return shift in WORK_SHIFT_LABELS
    ? WORK_SHIFT_LABELS[shift as WorkShift]
    : shift;
}

/** The approval badge; nothing for a sheet that needs no approval. */
export function SheetApprovalBadge({
  status,
}: {
  status: SheetApprovalStatus;
}) {
  if (status === "not_required") return null;
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
      {SHEET_APPROVAL_LABELS[status]}
    </Badge>
  );
}

/** `12.500` → `12.5`, `10.000` → `10`. */
export function quantityText(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** "4 skilled · 6 unskilled", or a dash. */
export function headcountText(sheet: {
  skilledCount: number | null;
  unskilledCount: number | null;
}): string {
  if (sheet.skilledCount == null && sheet.unskilledCount == null) return "—";
  return `${String(sheet.skilledCount ?? 0)} skilled · ${String(sheet.unskilledCount ?? 0)} unskilled`;
}
