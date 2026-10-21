import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

/*
 * `SkeletonGroup` wraps its bars in a `display: contents` box, so spacing
 * between them uses flex `gap`, which reaches through it; `space-y` doesn't.
 *
 * The Project Dashboard while its figures load (ADR-0047). Section cards
 * render their real title; inside, `SectionSkeleton` draws `Fact` tiles with
 * the real labels the section knows without fetching.
 */

export type SkeletonFact = { label?: string; icon?: LucideIcon };

/** A `Fact` tile: the real label and icon, a bar where the figure goes. */
function FactSkeleton({ label, icon: Icon }: SkeletonFact) {
  return (
    <div className="bg-muted/50 flex min-w-0 flex-col gap-2.5 rounded-[0.625rem] p-3.5 sm:p-4">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs sm:text-sm">
        {Icon == null ? null : (
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-4 shrink-0"
          />
        )}
        {label ?? <SkeletonText size="xs" width="5rem" />}
      </dt>
      <dd className="flex h-[1.25em] items-center text-lg leading-tight sm:text-xl">
        <Skeleton className="h-[0.75em] w-16 rounded-sm" />
      </dd>
    </div>
  );
}

/**
 * A section's figures while they load. `facts` are the tiles the section
 * shows first, with their real labels; `className` is the loaded `dl`'s
 * grid; `chart` adds the h-40 chart most sections draw under the figures.
 */
export function SectionSkeleton({
  facts = 4,
  className = "grid grid-cols-2 gap-2 lg:grid-cols-4",
  chart = false,
  label = "Loading",
}: {
  facts?: number | SkeletonFact[];
  className?: string;
  chart?: boolean;
  label?: string;
}) {
  const list: SkeletonFact[] =
    typeof facts === "number"
      ? Array.from({ length: facts }, () => ({}))
      : facts;
  const grid = (
    <dl className={className}>
      {list.map((fact, index) => (
        <FactSkeleton key={index} {...fact} />
      ))}
    </dl>
  );
  return (
    <SkeletonGroup label={label} className={cn(chart && "flex flex-col gap-5")}>
      {grid}
      {chart ? <Skeleton className="h-40 w-full rounded-md" /> : null}
    </SkeletonGroup>
  );
}

/** A `MetricCard` figure while it loads, sized in ems like the figure. */
export function MetricFigureSkeleton() {
  return (
    <span className="inline-flex h-[1em] items-center">
      <span className="sr-only">Loading</span>
      <Skeleton
        aria-hidden="true"
        className="h-[0.7em] w-[1.75em] rounded-sm"
      />
    </span>
  );
}

/** A `MetricCard` caption while it loads. */
export function MetricCaptionSkeleton() {
  return <SkeletonText width="75%" />;
}

/** The section cards under the KPI tiles while the member's layout loads. */
export function DashboardSectionsSkeleton() {
  return (
    <SkeletonGroup label="Loading dashboard" className="flex flex-col gap-6">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SkeletonText size="base" width={index === 1 ? "7rem" : "9rem"} />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((fact) => (
              <div
                key={fact}
                className="bg-muted/50 flex min-w-0 flex-col gap-2.5 rounded-[0.625rem] p-3.5 sm:p-4"
              >
                <SkeletonText size="xs" width="5rem" />
                <span className="flex h-[1.25em] items-center text-lg leading-tight sm:text-xl">
                  <Skeleton className="h-[0.75em] w-16 rounded-sm" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
