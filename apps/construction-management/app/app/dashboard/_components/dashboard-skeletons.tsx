import { Skeleton } from "@repo/ui/components/skeleton";
import {
  MetricGridSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

/*
 * The Company Dashboard while its figures load (ADR-0047): the real totals
 * labels, the "Your Projects" card with its real column headers on wider
 * screens and its real figure labels on phones.
 */

export const COMPANY_DASHBOARD_HEAD =
  "text-muted-foreground px-3 py-2 text-left text-[11px] font-semibold tracking-[0.08em] uppercase";
export const COMPANY_DASHBOARD_NUMBER = "px-3 py-3 text-right tabular-nums";

/** The per-Project table's columns; Due shows only with Payments Read. */
export const COMPANY_DASHBOARD_COLUMNS: readonly {
  header: string;
  className?: string;
}[] = [
  { header: "Project", className: "w-[28%]" },
  { header: "Status" },
  { header: "Progress", className: "w-[16%]" },
  { header: "Approvals", className: "text-right" },
  { header: "Pending issues", className: "text-right" },
  { header: "Labour today", className: "text-right" },
];

const TOTAL_LABELS = [
  "Active Projects",
  "Approvals waiting",
  "Pending Issues & Snags",
  "Pending Inspections",
  "Labours present today",
  // Amount due shows only with Payments Read, so its label waits for data.
  undefined,
];

const CARD_FIGURES = ["Approvals", "Pending issues", "Labour today", "Due"];
const NAME_WIDTHS = ["62%", "48%", "70%"];

function ProgressBarSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Skeleton className="h-1.5 w-full max-w-40 min-w-16 rounded-full" />
      <SkeletonText size="xs" width="2rem" />
    </div>
  );
}

export function CompanyDashboardSkeleton() {
  return (
    <SkeletonGroup label="Loading dashboard" className="space-y-6">
      <MetricGridSkeleton
        labels={TOTAL_LABELS}
        className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6"
      />
      <section className="bg-card min-w-0 rounded-2xl border p-2 shadow-xs sm:p-3">
        <h2 className="px-3 pt-3 pb-2 text-base tracking-tight">
          Your Projects
        </h2>
        <div className="p-1 md:p-0">
          <ul className="space-y-3 md:hidden">
            {NAME_WIDTHS.map((width, row) => (
              <li
                key={row}
                className="bg-card block min-w-0 space-y-3 rounded-xl border p-4"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <SkeletonText size="base" width={width} />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <ProgressBarSkeleton />
                <dl className="grid grid-cols-2 gap-2">
                  {CARD_FIGURES.map((label) => (
                    <div
                      key={label}
                      className="bg-muted/50 min-w-0 rounded-lg px-3 py-2"
                    >
                      <dt className="text-muted-foreground truncate text-xs">
                        {label}
                      </dt>
                      <dd>
                        <SkeletonText size="base" width="2.5rem" />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <table className="hidden w-full table-fixed text-sm md:table">
            <thead className="border-b">
              <tr>
                {COMPANY_DASHBOARD_COLUMNS.map((column) => (
                  <th
                    key={column.header}
                    scope="col"
                    className={cn(COMPANY_DASHBOARD_HEAD, column.className)}
                  >
                    {column.header}
                  </th>
                ))}
                <th
                  scope="col"
                  className={cn(COMPANY_DASHBOARD_HEAD, "text-right")}
                >
                  Due
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/70 divide-y">
              {[0, 1, 2, 3, 4].map((row) => (
                <tr key={row}>
                  <td className="px-3 py-3">
                    <SkeletonText width={NAME_WIDTHS[row % 3]} />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-3">
                    <ProgressBarSkeleton />
                  </td>
                  {[0, 1, 2, 3].map((cell) => (
                    <td key={cell} className={COMPANY_DASHBOARD_NUMBER}>
                      <SkeletonText width="2.5rem" className="ml-auto" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SkeletonGroup>
  );
}
