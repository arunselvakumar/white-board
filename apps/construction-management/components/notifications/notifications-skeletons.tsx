import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";

/** Notifications while they load (ADR-0047). */

const WIDTHS = ["72%", "54%", "86%", "63%", "47%"];

/** Rows in the open bell popover: the dot, a title and a time. */
export function BellListSkeleton() {
  return (
    <SkeletonGroup label="Loading notifications" className="block space-y-1">
      {WIDTHS.slice(0, 3).map((width) => (
        <div key={width} className="flex gap-3 rounded-xl p-3">
          <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <SkeletonText width={width} />
            <SkeletonText size="xs" width="30%" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** The Notifications page while the first page loads. */
export function NotificationsScreenSkeleton() {
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-3xl space-y-6">
        <PageHeader title="Notifications" />
        <SkeletonGroup label="Loading notifications" className="block">
          <ul className="space-y-2">
            {WIDTHS.map((width) => (
              <li
                key={width}
                className="bg-card flex gap-3 rounded-xl border p-3"
              >
                <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-1">
                    <SkeletonText width={width} />
                    <SkeletonText size="xs" width="25%" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-7 w-20 rounded-lg" />
                    <Skeleton className="h-7 w-16 rounded-lg" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SkeletonGroup>
      </div>
    </div>
  );
}
