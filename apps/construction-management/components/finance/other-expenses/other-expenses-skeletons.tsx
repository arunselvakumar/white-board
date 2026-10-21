import type { SkeletonColumn } from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";

/** Other Expenses' columns, without bulk approval's tick column. */
export const OTHER_EXPENSE_COLUMNS: SkeletonColumn[] = [
  { header: "Expense" },
  { header: "Category", kind: "muted" },
  { header: "Paid to", kind: "muted" },
  { header: "Paid from", kind: "muted" },
  { header: "Amount", kind: "number", className: "text-right" },
  { header: "Status", kind: "badge" },
];

/** The expenses under the real filter bar: the totals line, then the list. */
export function OtherExpenseRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Other Expenses"
      count
      columns={OTHER_EXPENSE_COLUMNS}
    />
  );
}
