import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/* Testing reports while they load (ADR-0047): real headings, shaped rows. */

const WIDTHS = ["58%", "44%", "66%", "50%", "62%"];

/** The Project's testing materials: the real heading, then material rows. */
export function TestingReportsSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Testing reports</h2>
        </div>
      </div>
      <SkeletonGroup label="Loading testing materials">
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {WIDTHS.map((width, row) => (
            <li key={row} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <SkeletonText width={width} />
                <SkeletonText size="xs" width="20%" />
              </span>
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    </div>
  );
}

/**
 * One material's reports: the real back link, the name a bar, the search
 * box and report rows with their thumbnails.
 */
export function TestingItemSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <Link
        href={`/app/projects/${encodeURIComponent(projectId)}/testing-reports`}
        className={buttonVariants({
          variant: "link",
          className:
            "text-muted-foreground hover:text-foreground h-auto gap-1.5 p-0 text-sm font-normal",
        })}
      >
        <ArrowLeft aria-hidden="true" />
        Back to Testing reports
      </Link>
      <SkeletonGroup label="Loading reports" className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <SkeletonText size="base" width="12rem" />
          <SkeletonText width="5rem" />
        </div>
        <Skeleton className="h-10 w-full rounded-md sm:max-w-xs" />
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {WIDTHS.slice(0, 4).map((width, row) => (
            <li key={row} className="flex items-start gap-3 px-3 py-3 sm:px-4">
              <Skeleton className="size-12 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonText width={width} />
                <SkeletonText size="xs" width="35%" />
              </div>
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    </div>
  );
}
