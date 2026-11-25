"use client";

import { MegaphoneIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import {
  AnnouncementCard,
  announcementDates,
} from "@/app/(app)/preschool/family/_components/announcement-card";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { preschoolFamilyAnnouncementsInfiniteOptions } from "@/src/queries/preschool/family";

/** Notices, events and holidays from the Centre, for every one of the Parent's Children. */
export function FamilyAnnouncementsScreen() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(preschoolFamilyAnnouncementsInfiniteOptions());
  const upcoming = data.pages[0]?.upcoming ?? [];
  const items = data.pages.flatMap((page) => page.items);

  return (
    <PreschoolPage title="Announcements" meta={null}>
      {upcoming.length === 0 ? null : (
        <section aria-labelledby="coming-up-heading" className="space-y-2">
          <h2 id="coming-up-heading" className="text-lg font-semibold">
            Coming up
          </h2>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {upcoming.map((item) => (
              <li
                key={item.id}
                className="bg-primary/5 border-primary/30 w-56 shrink-0 rounded-xl border p-3"
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-muted-foreground text-xs">
                  {announcementDates(item)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {items.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={MegaphoneIcon}
          tone="pink"
          title="No announcements yet"
          description="Notices, events and holidays from the Centre will show here."
        />
      ) : (
        <section aria-labelledby="all-heading" className="space-y-3">
          <h2 id="all-heading" className="text-lg font-semibold">
            All announcements
          </h2>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <AnnouncementCard item={item} />
              </li>
            ))}
          </ul>
          {hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={isFetchingNextPage}
              onClick={() => {
                void fetchNextPage();
              }}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </section>
      )}
    </PreschoolPage>
  );
}
