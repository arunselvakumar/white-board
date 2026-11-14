import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/* Resources while they load (ADR-0047). */

const WIDTHS = ["58%", "44%", "66%", "50%"];

/** The resource picker: the search box over the ticked list. */
export function ResourcePickerSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={`Loading ${label}`} className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <ul className="bg-card -mx-1 divide-y rounded-lg border">
        {WIDTHS.map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <span className="min-w-0 flex-1">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width={`calc(${width} * 0.6)`} />
            </span>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
