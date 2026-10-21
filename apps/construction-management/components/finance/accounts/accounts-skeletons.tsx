import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import type { PageHeaderBack } from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";
import {
  ResponsiveListSkeleton,
  SummaryTilesSkeleton,
} from "@/components/finance/finance-skeletons";

export const LEDGER_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Particulars" },
  { header: "Mode", kind: "muted" },
  { header: "Credit", kind: "number", className: "text-right" },
  { header: "Debit", kind: "number", className: "text-right" },
  { header: "Balance", kind: "number", className: "text-right" },
];

export const LEDGER_SUMMARY = ["Opening", "Money in", "Money out", "Closing"];

/**
 * An account's Ledger while it loads: the real back link, the period's
 * From and To, the four figures and the ledger table. It sits in the
 * Ledger's `space-y-6` frame.
 */
export function LedgerSkeleton({ back }: { back: PageHeaderBack }) {
  return (
    <>
      <PageHeaderSkeleton back={back} />
      <SkeletonGroup label="Loading the Ledger" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3">
          {["From", "To"].map((label) => (
            <div key={label} className="space-y-1">
              <span className="block text-xs leading-none font-medium">
                {label}
              </span>
              <Skeleton className="h-9 w-40 rounded-md" />
            </div>
          ))}
        </div>
        <SummaryTilesSkeleton labels={LEDGER_SUMMARY} />
        <ResponsiveListSkeleton columns={LEDGER_COLUMNS} />
      </SkeletonGroup>
    </>
  );
}
