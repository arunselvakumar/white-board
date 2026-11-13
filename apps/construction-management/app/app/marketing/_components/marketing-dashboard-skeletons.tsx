import { Skeleton } from "@repo/ui/components/skeleton";
import {
  MetricGridSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

/*
 * The Marketing Dashboard while its figures load (ADR-0047): the real
 * totals labels and section titles, bars where figures will appear.
 */

/** The totals grid, for the loaded cards and their skeleton alike. */
export const MARKETING_TOTALS_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4";

/** A section's card and its heading. */
export const MARKETING_SECTION =
  "bg-card min-w-0 space-y-4 rounded-2xl border p-4 shadow-xs sm:p-5";
export const MARKETING_SECTION_HEADING = "text-base font-medium tracking-tight";

const TOTAL_LABELS = [
  "Visits completed",
  "Visits planned",
  "Visits missed",
  "Follow-ups due today",
  "Follow-ups overdue",
  "New Prospect Companies",
  "Won",
];

const SECTIONS = [
  "Visits over time",
  "Companies by Stage",
  "Recent activity",
  "Hot companies with no Follow-up",
];

function Rows({ count }: { count: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: count }, (_, row) => (
        <li key={row} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <span className="min-w-0 flex-1 space-y-1">
            <SkeletonText width={["70%", "55%", "80%", "62%"][row % 4]} />
            <SkeletonText size="xs" width="40%" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MarketingDashboardSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the Marketing Dashboard"
      className="space-y-6"
    >
      <MetricGridSkeleton
        labels={TOTAL_LABELS}
        className={MARKETING_TOTALS_GRID}
      />
      <section className={MARKETING_SECTION}>
        <h2 className={MARKETING_SECTION_HEADING}>Today</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Rows count={2} />
          <Rows count={2} />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map((title) => (
          <section key={title} className={MARKETING_SECTION}>
            <h2 className={MARKETING_SECTION_HEADING}>{title}</h2>
            {title === "Visits over time" ? (
              <Skeleton className="h-56 w-full rounded-md" />
            ) : (
              <Rows count={4} />
            )}
          </section>
        ))}
      </div>
    </SkeletonGroup>
  );
}
