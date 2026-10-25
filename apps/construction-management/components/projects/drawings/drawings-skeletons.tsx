import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

/* Drawings while they load (ADR-0047). */

const WIDTHS = ["58%", "44%", "66%", "50%", "62%", "48%"];

/** The albums: the real heading, then album cards. */
export function DrawingsSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Drawings</h2>
        </div>
      </div>
      <SkeletonGroup label="Loading albums">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WIDTHS.map((width, index) => (
            <li
              key={index}
              className="bg-card flex min-w-0 items-center gap-3 rounded-xl border p-3"
            >
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <SkeletonText width={width} />
                <SkeletonText size="xs" width="35%" />
              </span>
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    </div>
  );
}

/** One album: the real Drawings link, the name a bar, then drawing rows. */
export function DrawingAlbumSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="space-y-2">
        <Link
          href={`/app/projects/${encodeURIComponent(projectId)}/drawings`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ArrowLeft aria-hidden="true" />
          Drawings
        </Link>
        <h2 className="font-semibold">
          <span className="sr-only">Loading the album</span>
          <SkeletonText size="base" width="12rem" />
        </h2>
      </div>
      <SkeletonGroup label="Loading drawings">
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {WIDTHS.slice(0, 4).map((width, row) => (
            <li
              key={row}
              className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
            >
              <Skeleton className="size-12 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonText width={width} />
                <SkeletonText size="xs" width="35%" />
              </div>
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    </div>
  );
}

/** A drawing's History: revision cards with a badge, file name, meta and actions. */
export function DrawingRevisionsSkeleton() {
  return (
    <SkeletonGroup label="Loading revisions">
      <ol className="space-y-2">
        {["64%", "52%"].map((width, index) => (
          <li
            key={index}
            className="bg-card space-y-2 rounded-lg border px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <SkeletonText width={width} className="flex-1" />
            </div>
            <SkeletonText size="xs" width="70%" />
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-10 w-16 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** Move to album's Album select while the albums load. */
export function AlbumSelectSkeleton() {
  return (
    <SkeletonGroup label="Loading albums" className="space-y-1.5">
      <span className="text-sm leading-none font-medium">Album</span>
      <Skeleton className="h-10 w-full rounded-md" />
    </SkeletonGroup>
  );
}
