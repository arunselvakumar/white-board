import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import { RESOURCE_SECTIONS } from "./resource-sections";

/* Resources while they load (ADR-0047). */

const WIDTHS = ["58%", "44%", "66%", "50%"];

/** The resource picker: the search box over the ticked list. */
export function ResourcePickerSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={`Loading ${label}`} className="space-y-4">
      <Skeleton className="h-9 w-full rounded-md" />
      <ul className="bg-card -mx-1 divide-y rounded-lg border">
        {WIDTHS.map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <span className="min-w-0 flex-1">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width={`calc(${width} * 0.6)`} />
            </span>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** A Project's Resources: a card per section with its real title and text. */
export function ProjectResourcesSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      <div className="grid w-full gap-6 lg:grid-cols-2">
        {RESOURCE_SECTIONS.map((section) => (
          <section
            key={section.key}
            className="bg-card w-full space-y-4 rounded-xl border p-4 sm:p-6"
          >
            <div className="min-w-0 space-y-1">
              <h2 className="font-semibold">{section.title}</h2>
              <p className="text-muted-foreground text-sm">
                {section.description}
              </p>
            </div>
            <SkeletonGroup label={`Loading ${section.title}`}>
              <ul className="bg-card divide-y rounded-lg border">
                {WIDTHS.slice(0, 2).map((width, row) => (
                  <li key={row} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <SkeletonText width={width} />
                      <SkeletonText size="xs" width="40%" />
                    </span>
                  </li>
                ))}
              </ul>
            </SkeletonGroup>
          </section>
        ))}
      </div>
    </div>
  );
}
