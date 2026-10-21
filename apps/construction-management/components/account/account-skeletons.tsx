import { Skeleton } from "@repo/ui/components/skeleton";
import {
  ItemListSkeleton,
  SkeletonGroup,
} from "@repo/ui/components/skeleton-kit";

/** Account screens while they load (ADR-0047). */

/** Transfer ownership and Delete the Company, while the deletion state loads. */
export function OwnerActionsSkeleton() {
  return (
    <ItemListSkeleton
      rows={2}
      media="icon"
      trailing="action"
      className="gap-3"
      label="Loading Company actions"
    />
  );
}

/** The New Owner select while the candidates load. */
export function CandidateSelectSkeleton() {
  return (
    <SkeletonGroup label="Loading Team Members" className="block">
      <Skeleton className="h-10 w-full rounded-lg" />
    </SkeletonGroup>
  );
}
