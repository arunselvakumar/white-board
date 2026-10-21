import {
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  FilterBarSkeleton,
  ResponsiveListSkeleton,
  SummaryTilesSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";

/** The Transactions register's columns, without bulk approval's tick column. */
export const TRANSACTION_COLUMNS: SkeletonColumn[] = [
  { header: "Number" },
  { header: "Date", kind: "muted" },
  { header: "Type", kind: "muted" },
  { header: "Account", kind: "muted" },
  { header: "Paid To / Received From" },
  { header: "Amount", kind: "number", className: "text-right" },
  { header: "Status", kind: "badge" },
  { header: srOnly("Actions"), kind: "actions", className: "w-12" },
];

/** The Transactions register while it loads: filters, totals, the list. */
export function TransactionRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Transactions" className="flex flex-col gap-3">
      <FilterBarSkeleton
        size="sm"
        filters={[
          "Date",
          "Type",
          "Account",
          "Category",
          "Mode",
          "Party",
          "Status",
        ]}
      />
      <SummaryTilesSkeleton
        labels={["Payment In", "Payment Out", "Net", "Transferred"]}
      />
      <SkeletonText width="14rem" />
      <ResponsiveListSkeleton columns={TRANSACTION_COLUMNS} />
    </SkeletonGroup>
  );
}
