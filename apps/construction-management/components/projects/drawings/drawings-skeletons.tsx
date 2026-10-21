import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/*
 * Drawings while they load (ADR-0047). `SkeletonGroup` wraps its bars in a
 * `display: contents` box, so spacing between them uses flex `gap`.
 */

/** A drawing's History: revision cards with a badge, file name, meta and actions. */
export function DrawingRevisionsSkeleton() {
  return (
    <SkeletonGroup label="Loading revisions">
      <ol className="space-y-2">
        {["64%", "52%"].map((width, index) => (
          <li key={index} className="space-y-2 rounded-lg border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <SkeletonText width={width} className="flex-1" />
            </div>
            <SkeletonText size="xs" width="70%" />
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** Move to album's Album select while the albums load. */
export function AlbumSelectSkeleton() {
  return (
    <SkeletonGroup label="Loading albums" className="flex flex-col gap-1.5">
      <span className="text-sm leading-none font-medium">Album</span>
      <Skeleton className="h-10 w-full rounded-md" />
    </SkeletonGroup>
  );
}
