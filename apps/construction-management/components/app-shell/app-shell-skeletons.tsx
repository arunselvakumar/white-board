import { Skeleton } from "@repo/ui/components/skeleton";

/** Fixed widths: the sidebar's own skeleton picks random ones, which breaks hydration. */
export const SKELETON_WIDTHS = ["70%", "55%", "80%", "60%", "75%", "50%"];

/** A sidebar menu row while it loads: icon and label, as `SidebarMenuButton` lays them out. */
export function MenuSkeleton({ width }: { width: string }) {
  return (
    <div className="flex h-8 items-center gap-2 px-2">
      <Skeleton className="size-4 rounded-md" />
      <Skeleton className="h-4" style={{ width }} />
    </div>
  );
}
