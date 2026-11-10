import { FileText, ImageIcon, LayoutGrid } from "lucide-react";
import type { FilterTab } from "@repo/ui/components/filter-tabs";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import type { GalleryFilter } from "@/src/queries/project-gallery";

/* The Gallery while it loads (ADR-0047): real heading and type tabs. */

/** The Gallery's Type tabs. */
export const GALLERY_TYPE_TABS: FilterTab<GalleryFilter["type"]>[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "pdf", label: "PDFs", icon: FileText },
];

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

/**
 * The whole Gallery page: heading, search, type tabs (inert), then the
 * tiles. The tab icons render here, not in `FilterTabs`, so a server page
 * can show this.
 */
export function GallerySkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">Gallery</h2>
      </div>
      <div className="space-y-3">
        <div inert className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full rounded-md sm:w-64" />
          <Tabs defaultValue="all" className="min-w-0">
            <TabsList aria-label="Type">
              {GALLERY_TYPE_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}>
                  {Icon == null ? null : <Icon aria-hidden />}
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <GalleryTilesSkeleton />
    </div>
  );
}
