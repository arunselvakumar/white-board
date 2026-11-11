import {
  ItemListSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

/** Mirrors `ActivityFeed`: a day heading and its entries. */
export function ActivityFeedSkeleton() {
  return (
    <SkeletonGroup label="Loading activity" className="space-y-3">
      <SkeletonText size="xs" width="6rem" />
      <ItemListSkeleton rows={5} media="avatar" lines={2} variant="default" />
    </SkeletonGroup>
  );
}
