import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/** Photo & documents on Edit Employee and Edit Vendor while they load (ADR-0047). */

/** The documents list while it loads. */
export function StaffDocumentsSkeleton() {
  return (
    <SkeletonGroup label="Loading documents" className="block">
      <ul className="bg-card divide-border divide-y rounded-lg border">
        {["54%", "38%"].map((width) => (
          <li key={width} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <SkeletonText width={width} className="flex-1" />
            <SkeletonText size="xs" width="3rem" />
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Photo & documents card while the record loads. */
export function StaffPhotoSkeleton() {
  return (
    <SkeletonGroup label="Loading photo" className="flex items-center gap-4">
      <Skeleton className="size-20 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <SkeletonText size="xs" width="60%" />
      </div>
    </SkeletonGroup>
  );
}
