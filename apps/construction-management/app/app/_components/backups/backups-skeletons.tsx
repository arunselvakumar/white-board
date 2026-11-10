import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/** Backups while their options or progress load (ADR-0047). */

/** `BackupModulePicker`: Select all, then a card of modules per group. */
export function BackupModulesSkeleton({
  groups = [3, 2],
}: {
  /** Modules per group card. */
  groups?: number[];
}) {
  return (
    <SkeletonGroup label="Loading modules" className="block min-w-0 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-4 shrink-0 rounded-[4px]" />
        <span className="text-sm font-medium">Select all modules</span>
      </div>
      {groups.map((count, group) => (
        <div key={group} className="bg-card min-w-0 rounded-xl border">
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <SkeletonText width="6rem" />
          </div>
          <ul className="divide-y">
            {Array.from({ length: count }, (_, row) => (
              <li key={row} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="size-4 shrink-0 rounded-[4px]" />
                <SkeletonText width={["48%", "36%", "56%"][row % 3]} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A backup's status line and bar, before its first read arrives. */
export function BackupProgressSkeleton() {
  return (
    <SkeletonGroup label="Loading backup" className="block min-w-0 space-y-2">
      <SkeletonText width="14rem" />
      <Skeleton className="h-2 w-full rounded-full" />
      <SkeletonText width="80%" />
    </SkeletonGroup>
  );
}
