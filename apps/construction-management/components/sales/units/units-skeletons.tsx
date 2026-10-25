import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import {
  UNIT_SALES_STATUS_LABELS,
  UNIT_SALES_STATUSES,
} from "@/src/sales/domain/sales-terms";

import { UNIT_STATUS_DOTS } from "./sales-status";

/*
 * Units while they load (ADR-0047).
 */

function CountsSkeleton() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {UNIT_SALES_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${UNIT_STATUS_DOTS[status]}`}
          />
          <span>{UNIT_SALES_STATUS_LABELS[status]}</span>
          <SkeletonText width="1.25rem" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Bookings → Units while the chart loads: the real heading and status
 * names, the Wing picker and a floors × units grid of bars.
 */
export function UnitsTabSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Units</h2>
      </div>
      <SkeletonGroup label="Loading units" className="space-y-4">
        <section className="bg-muted/40 space-y-1 rounded-lg border p-3">
          <SkeletonText width="9rem" />
          <CountsSkeleton />
        </section>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full min-w-0 space-y-1 sm:w-64">
            <span className="block text-xs leading-none font-medium">Wing</span>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <CountsSkeleton />
        </div>
        <div className="bg-card space-y-2 rounded-lg border p-3">
          {[0, 1, 2, 3].map((floor) => (
            <div key={floor} className="flex items-center gap-2">
              <SkeletonText width="3rem" className="shrink-0" />
              <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-6">
                {[0, 1, 2, 3, 4, 5].map((unit) => (
                  <Skeleton
                    key={unit}
                    className={`h-12 rounded-md ${unit > 3 ? "hidden sm:block" : ""}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}

/** A unit's panel in the sheet: status chips, actions, then its facts. */
export function UnitPanelSkeleton() {
  return (
    <SkeletonGroup label="Loading the unit" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <SkeletonText width="8rem" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
      <div className="bg-card grid grid-cols-2 gap-4 rounded-lg border p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="min-w-0">
            <SkeletonText size="xs" width="45%" />
            <SkeletonText width={index % 2 === 0 ? "70%" : "55%"} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
