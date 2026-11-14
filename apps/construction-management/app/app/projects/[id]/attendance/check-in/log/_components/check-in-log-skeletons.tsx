import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

const WIDTHS = ["48%", "62%", "40%", "55%"];

/** The log while it loads: the filters, the day's line, then the rows. */
export function CheckInLogSkeleton() {
  return (
    <SkeletonGroup label="Loading the Check-In log" className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <SkeletonText width="2.5rem" />
          <Skeleton className="h-12 w-44 rounded-lg" />
        </div>
        <Skeleton className="size-12 rounded-lg" />
        <Skeleton className="size-12 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:justify-between">
        <SkeletonText size="lg" width="min(22rem, 100%)" />
        <Skeleton className="h-12 w-full rounded-lg md:max-w-xs" />
      </div>
      <SkeletonText size="base" width="12rem" />
      <ul className="space-y-2">
        {WIDTHS.map((width) => (
          <li
            key={width}
            className="bg-card flex items-center gap-3 rounded-xl border p-3"
          >
            <Skeleton className="size-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonText size="base" width={width} />
              <SkeletonText width="70%" />
              <SkeletonText size="xs" width="35%" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
