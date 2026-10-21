import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/* The Gallery while it loads (ADR-0047): real heading and type chips. */

const TYPES = ["All", "Images", "PDFs"];

/** A grid of square file tiles, each with a name and two meta lines. */
export function GalleryTilesSkeleton() {
  return (
    <SkeletonGroup label="Loading files">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <li key={index} className="min-w-0">
            <div className="flex w-full min-w-0 flex-col gap-1.5 p-1.5">
              <Skeleton className="aspect-square w-full rounded-md" />
              <SkeletonText width={index % 2 === 0 ? "80%" : "60%"} />
              <SkeletonText size="xs" width="50%" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The whole Gallery page: heading, search, type chips, then the tiles. */
export function GallerySkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">Gallery</h2>
      </div>
      <div className="space-y-3">
        <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full rounded-md sm:w-64" />
          <div className="flex">
            {TYPES.map((label, index) => (
              <span
                key={label}
                className={`border-input text-muted-foreground inline-flex h-7 items-center border px-2.5 text-sm ${index === 0 ? "rounded-l-md" : "-ml-px"} ${index === TYPES.length - 1 ? "rounded-r-md" : ""}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <GalleryTilesSkeleton />
    </div>
  );
}
