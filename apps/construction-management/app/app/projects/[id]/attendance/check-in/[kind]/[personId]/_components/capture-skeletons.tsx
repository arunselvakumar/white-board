import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/** The capture screen while the person loads: camera, person, clock, action. */
export function CaptureSkeleton() {
  return (
    <SkeletonGroup
      label="Loading"
      className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)]"
    >
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonText size="2xl" width="70%" />
            <SkeletonText width="50%" />
          </div>
        </div>
        <SkeletonText size="3xl" width="12rem" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </SkeletonGroup>
  );
}
