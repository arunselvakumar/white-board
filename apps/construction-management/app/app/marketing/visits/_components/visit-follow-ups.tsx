"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  ItemListSkeleton,
  SkeletonGroup,
} from "@repo/ui/components/skeleton-kit";

import { followUpsQuery } from "@/src/queries/marketing-follow-ups";
import type { Visit } from "@/src/queries/marketing-visits";

import { FollowUpDialog } from "../../follow-ups/_components/follow-up-dialog";
import {
  FollowUpItems,
  useFollowUpActions,
  type OnFollowUpAction,
} from "../../follow-ups/_components/follow-up-items";

/** What a Visit's Follow-ups card may do, from the page's access check. */
export type VisitFollowUpAccess = {
  /** Follow-ups create: Add Follow-up. */
  create: boolean;
  /** Visits create: Log the visit after a Visit-type one is Done. */
  logVisit: boolean;
};

/**
 * The Follow-ups that came from this Visit, with their status or due, and
 * Add Follow-up with the Visit and its company filled in.
 */
export function VisitFollowUps({
  visit,
  access,
}: {
  visit: Visit;
  access: VisitFollowUpAccess;
}) {
  const [adding, setAdding] = useState(false);
  const { onAction, dialogs } = useFollowUpActions({
    canLogVisit: access.logVisit,
  });
  return (
    <section
      aria-labelledby="visit-follow-ups-heading"
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="visit-follow-ups-heading" className="font-semibold">
          Follow-ups
        </h2>
        {access.create && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add Follow-up
          </Button>
        )}
      </div>
      <Suspense
        fallback={
          <SkeletonGroup label="Loading Follow-ups">
            <ItemListSkeleton rows={2} lines={2} trailing="badge" />
          </SkeletonGroup>
        }
      >
        <Rows visitId={visit.id} onAction={onAction} />
      </Suspense>
      {dialogs}
      {adding && (
        <FollowUpDialog
          open
          prefill={{
            company: visit.prospectCompany,
            visit: { id: visit.id, number: visit.number },
          }}
          onOpenChange={(open) => {
            if (!open) setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function Rows({
  visitId,
  onAction,
}: {
  visitId: string;
  onAction: OnFollowUpAction;
}) {
  const query = useSuspenseInfiniteQuery(followUpsQuery({ visitId }));
  const items = query.data.pages.flatMap((page) => page.items);
  const today = query.data.pages[0]?.today ?? "";
  if (items.length === 0)
    return <p className="text-muted-foreground text-sm">No Follow-ups yet.</p>;
  return (
    <FollowUpItems
      items={items}
      today={today}
      label="Follow-ups of this Visit"
      onAction={onAction}
      showStatus
      showCompany={false}
      showVisit={false}
    />
  );
}
