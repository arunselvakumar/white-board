import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  FilterBarSkeleton,
  ResponsiveListSkeleton,
  SummaryTilesSkeleton,
} from "@/components/finance/finance-skeletons";

/** The vouchers table's columns, without bulk approval's tick column. */
export const VOUCHER_COLUMNS: SkeletonColumn[] = [
  { header: "Voucher" },
  { header: "Date", kind: "muted" },
  { header: "Paid to / received from" },
  { header: "Project", kind: "muted" },
  { header: "Amount", kind: "number", className: "text-right" },
  { header: "Status", kind: "badge" },
];

export const STATEMENT_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Voucher" },
  { header: "Particulars", kind: "muted" },
  { header: "In", kind: "number", className: "text-right" },
  { header: "Out", kind: "number", className: "text-right" },
  { header: "Balance", kind: "number", className: "text-right" },
];

/** An account's vouchers under the real filters: the totals line, the list. */
export function VoucherRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading vouchers"
      count
      columns={VOUCHER_COLUMNS}
    />
  );
}

/** The whole vouchers panel: scope toggle, filters, then the rows. */
export function PettyCashVouchersSkeleton() {
  return (
    <SkeletonGroup label="Loading vouchers" className="space-y-3">
      <Skeleton className="h-8 w-56 rounded-md" />
      <FilterBarSkeleton
        size="sm"
        filters={["Date", "Type", "Status", "Category"]}
      />
      <VoucherRowsSkeleton />
    </SkeletonGroup>
  );
}

/** A statement's four figures and its lines, under the real From and To. */
export function StatementLinesSkeleton() {
  return (
    <SkeletonGroup label="Loading the statement" className="space-y-3">
      <SummaryTilesSkeleton
        labels={["Opening", "Money in", "Money out", "Closing"]}
      />
      <ResponsiveListSkeleton columns={STATEMENT_COLUMNS} />
    </SkeletonGroup>
  );
}
