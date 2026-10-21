import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/* A Project's Documents while they load (ADR-0047). */

const WIDTHS = ["58%", "44%", "66%", "50%"];

/** The real heading, the category chips, then a group of documents. */
export function ProjectDocumentsSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Documents</h2>
        </div>
      </div>
      <SkeletonGroup label="Loading documents" className="space-y-5">
        <Skeleton className="h-8 w-72 max-w-full rounded-md" />
        <section className="space-y-2">
          <SkeletonText width="10rem" />
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {WIDTHS.map((width, row) => (
              <li
                key={row}
                className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
              >
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <SkeletonText width={width} />
                  <SkeletonText size="xs" width="35%" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </SkeletonGroup>
    </div>
  );
}
