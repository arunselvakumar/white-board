import { Badge } from "@repo/ui/components/badge";

import type {
  OtherExpense,
  OtherExpenseStatus,
} from "@/src/queries/finance-other-expenses";

export const MODE_LABELS: Record<OtherExpense["mode"], string> = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
};

export const STATUS_LABELS: Record<OtherExpenseStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** "UPI · 4412 9981": the mode and its cheque number or reference. */
export function modeText(expense: Pick<OtherExpense, "mode" | "reference">) {
  const mode = MODE_LABELS[expense.mode];
  return expense.reference == null ? mode : `${mode} · ${expense.reference}`;
}

/** Pending, Approved or Rejected (ADR CM-0017 §4: only Approved moves money). */
export function ExpenseStatusBadge({ status }: { status: OtherExpenseStatus }) {
  if (status === "approved")
    return <Badge variant="secondary">{STATUS_LABELS.approved}</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive">{STATUS_LABELS.rejected}</Badge>;
  return <Badge variant="outline">{STATUS_LABELS.pending}</Badge>;
}
