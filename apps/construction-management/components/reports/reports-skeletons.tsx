import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@repo/ui/components/card";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

/*
 * Reports while the catalogue and recent jobs load (ADR-0047). The cards
 * are worded by the catalogue, so their titles are bars; the period
 * fields and the Generate button keep their shape.
 */

const WIDTHS = ["62%", "48%", "71%", "55%", "40%", "66%"];

/** One report card: title, description, a From / To period, Generate. */
function ReportCardSkeleton({ index }: { index: number }) {
  return (
    <Card className="flex flex-col">
      <div className="flex flex-1 flex-col gap-4">
        <CardHeader>
          <SkeletonText size="base" width={WIDTHS[index % WIDTHS.length]} />
          <SkeletonText width="90%" />
          <SkeletonText size="xs" width="50%" />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {["From", "To"].map((label) => (
              <div key={label} className="space-y-1.5">
                <p className="text-sm leading-none font-medium">{label}</p>
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-8 w-full rounded-lg sm:w-24" />
        </CardFooter>
      </div>
    </Card>
  );
}

/** A grid of report cards; pass the loaded grid's className. */
export function ReportCardGridSkeleton({
  count = 4,
  className = "grid gap-4 md:grid-cols-2",
  label = "Loading reports",
}: {
  count?: number;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: count }, (_, index) => (
        <ReportCardSkeleton key={index} index={index} />
      ))}
    </SkeletonGroup>
  );
}

/** The viewer's recent reports: title and status, when, the downloads. */
export function RecentReportsSkeleton({
  rows = 3,
  className,
  label = "Loading recent reports",
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className={cn("block", className)}>
      <ul className="divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, row) => (
          <li
            key={row}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonText
                  size="base"
                  width={WIDTHS[row % WIDTHS.length]}
                  className="max-w-64"
                />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <SkeletonText width="40%" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-7 w-14 rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** A report group while the catalogue loads: heading, description, cards. */
function ReportGroupSkeleton({ cards }: { cards: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <SkeletonText size="lg" width="10rem" />
        <SkeletonText width="min(28rem, 80%)" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <ReportCardSkeleton key={index} index={index} />
        ))}
      </div>
    </div>
  );
}

/** The Reports tab or Central Reports while the catalogue loads. */
export function ReportGroupsSkeleton({
  label = "Loading reports",
}: {
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="block space-y-8">
      <ReportGroupSkeleton cards={3} />
      <ReportGroupSkeleton cards={2} />
    </SkeletonGroup>
  );
}
