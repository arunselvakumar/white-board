import { Skeleton } from "@repo/ui/components/skeleton";

/** Fixed widths: the sidebar's own skeleton picks random ones, which breaks hydration. */
export const SKELETON_WIDTHS = ["70%", "55%", "80%", "60%", "75%", "50%"];

/** A sidebar menu row while it loads: icon and label, as the shell's 40px rows lay them out. */
export function MenuSkeleton({ width }: { width: string }) {
  return (
    <div className="flex h-10 items-center gap-3 px-3">
      <Skeleton className="size-[18px] rounded-md" />
      <Skeleton className="h-4" style={{ width }} />
    </div>
  );
}
