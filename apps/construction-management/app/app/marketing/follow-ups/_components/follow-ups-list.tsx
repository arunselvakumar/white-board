"use client";

import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import {
  ItemListSkeleton,
  SkeletonGroup,
} from "@repo/ui/components/skeleton-kit";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FilterSelect } from "@/app/app/projects/[id]/_components/procurement/purchase-requests/filter-select";
import { marketingSection } from "@/lib/marketing-nav";
import {
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUSES,
  type FollowUpDue,
  type FollowUpStatus,
} from "@/src/marketing/domain/marketing-terms";
import {
  followUpFormOptionsQuery,
  followUpsArrivalFilters,
  followUpsQuery,
  type FollowUp,
  type FollowUpFilters,
} from "@/src/queries/marketing-follow-ups";

import { FollowUpDialog } from "./follow-up-dialog";
import {
  FollowUpItems,
  useFollowUpActions,
  type OnFollowUpAction,
} from "./follow-up-items";

type View = "mine" | "everyone";

/** What the page opens on, and what its server prefetch reads. */

const STATUS_TABS = FOLLOW_UP_STATUSES.map((status) => ({
  value: status,
  label: FOLLOW_UP_STATUS_LABELS[status],
}));

const GROUPS: { due: FollowUpDue; title: string; empty: string }[] = [
  { due: "overdue", title: "Overdue", empty: "Nothing overdue." },
  { due: "today", title: "Today", empty: "Nothing due today." },
  { due: "upcoming", title: "Upcoming", empty: "Nothing coming up." },
];

/**
 * Follow-ups by due date (PRD §3.5). Opens on the viewer's own Open ones
 * in Overdue, Today and Upcoming; Done and Cancelled are a tab away. With
 * View all, a switch shows everyone's and a filter picks one owner.
 */
export function FollowUpsList({
  canCreate,
  canLogVisit,
  owner: arrivalOwner,
}: {
  /** Follow-ups create: Add Follow-up. */
  canCreate: boolean;
  /** Visits create: Log the visit after a Visit-type one is Done. */
  canLogVisit: boolean;
  /** `?owner=`: opens on Everyone, that owner's, with View all. */
  owner?: string;
}) {
  const section = marketingSection("followUps");
  const { data: options } = useSuspenseQuery(followUpFormOptionsQuery);
  const arrival = followUpsArrivalFilters(arrivalOwner, options.canSeeAll);
  const [view, setView] = useState<View>(
    arrival.mine === true ? "mine" : "everyone",
  );
  const [owner, setOwner] = useState(arrival.ownerMemberId ?? "");
  const [status, setStatus] = useState<FollowUpStatus>("open");
  const [adding, setAdding] = useState(false);
  const [updating, startTransition] = useTransition();
  const { onAction, dialogs } = useFollowUpActions({ canLogVisit });
  // Without View all, "everyone" is what the member can see: theirs and
  // those they gave a colleague (ADR CM-0040 §5).
  const everyone = view === "everyone";
  const filters: FollowUpFilters = {
    mine: !everyone,
    ownerMemberId: everyone && options.canSeeAll ? owner : undefined,
    statuses: [status],
  };

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-5xl min-w-0 flex-col gap-6">
        <PageHeader
          title={section.title}
          meta={section.description}
          actions={
            canCreate ? (
              <Button
                type="button"
                onClick={() => {
                  setAdding(true);
                }}
              >
                <Plus aria-hidden="true" />
                Add Follow-up
              </Button>
            ) : undefined
          }
        />
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <ToggleGroup
            aria-label="Whose Follow-ups"
            variant="outline"
            spacing={0}
            value={[view]}
            onValueChange={(next: string[]) => {
              const picked = next[0];
              if (picked !== "mine" && picked !== "everyone") return;
              startTransition(() => {
                setView(picked);
              });
            }}
          >
            <ToggleGroupItem value="mine" className="px-4">
              Mine
            </ToggleGroupItem>
            <ToggleGroupItem value="everyone" className="px-4">
              {options.canSeeAll ? "Everyone" : "Mine and given"}
            </ToggleGroupItem>
          </ToggleGroup>
          {everyone && options.canSeeAll && (
            <FilterSelect
              id="follow-ups-owner"
              label="Owner"
              allLabel="Anyone"
              value={owner}
              // People no longer active stay here: their Follow-ups remain.
              options={options.allPeople.map((person) => ({
                value: person.id,
                label: person.active
                  ? person.name
                  : `${person.name} (inactive)`,
              }))}
              onChange={(next) => {
                startTransition(() => {
                  setOwner(next);
                });
              }}
            />
          )}
        </div>
        <FilterTabs
          aria-label="Status"
          items={STATUS_TABS}
          value={status}
          onValueChange={(next) => {
            startTransition(() => {
              setStatus(next);
            });
          }}
        />
        <div
          className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
        >
          <Suspense fallback={<FollowUpRowsSkeleton />}>
            <FollowUpRows
              filters={filters}
              status={status}
              mine={!everyone}
              canCreate={canCreate}
              onAction={onAction}
              onAdd={() => {
                setAdding(true);
              }}
            />
          </Suspense>
        </div>
      </div>
      {dialogs}
      {canCreate && adding && (
        <FollowUpDialog
          open
          onOpenChange={(open) => {
            if (!open) setAdding(false);
          }}
        />
      )}
    </div>
  );
}

/** Cards while a filter loads (ADR-0047). */
export function FollowUpRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Follow-ups">
      <ItemListSkeleton rows={4} lines={3} trailing="badge" />
    </SkeletonGroup>
  );
}

function Group({
  title,
  empty,
  items,
  due,
  today,
  onAction,
}: {
  title: string;
  empty: string;
  items: readonly FollowUp[];
  due: FollowUpDue;
  today: string;
  onAction: OnFollowUpAction;
}) {
  const id = `follow-ups-${due}-heading`;
  const urgent = due === "overdue" && items.length > 0;
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h2
        id={id}
        className={cn(
          "flex items-center gap-2 font-semibold",
          urgent && "text-red-700 dark:text-red-300",
        )}
      >
        {title}{" "}
        <span
          className={cn(
            "bg-muted text-muted-foreground rounded-full px-2 text-xs font-medium tabular-nums",
            urgent &&
              "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
          )}
        >
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <FollowUpItems
          items={items}
          today={today}
          label={title}
          onAction={onAction}
        />
      )}
    </section>
  );
}

function FollowUpRows({
  filters,
  status,
  mine,
  canCreate,
  onAction,
  onAdd,
}: {
  filters: FollowUpFilters;
  status: FollowUpStatus;
  mine: boolean;
  canCreate: boolean;
  onAction: OnFollowUpAction;
  onAdd: () => void;
}) {
  const query = useSuspenseInfiniteQuery(followUpsQuery(filters));
  const items = query.data.pages.flatMap((page) => page.items);
  const total = query.data.pages[0]?.total ?? 0;
  const today = query.data.pages[0]?.today ?? "";

  if (items.length === 0) {
    const word = FOLLOW_UP_STATUS_LABELS[status].toLowerCase();
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarClock />
          </EmptyMedia>
          <EmptyTitle>
            {status === "open"
              ? mine
                ? "Nothing owed by you"
                : "No open Follow-ups"
              : `No ${word} Follow-ups`}
          </EmptyTitle>
          <EmptyDescription>
            {status === "open"
              ? "Calls, return Visits, emails and quotations owed after a Visit show here by due date, overdue first."
              : `Follow-ups marked ${word} show here.`}
          </EmptyDescription>
        </EmptyHeader>
        {status === "open" && canCreate && (
          <EmptyContent>
            <Button type="button" onClick={onAdd}>
              <Plus aria-hidden="true" />
              Add Follow-up
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      {items.length < total && (
        <p className="text-muted-foreground text-sm">
          {`Showing ${String(items.length)} of ${String(total)} Follow-ups`}
        </p>
      )}
      {status === "open" ? (
        GROUPS.map((group) => (
          <Group
            key={group.due}
            title={group.title}
            empty={group.empty}
            due={group.due}
            items={items.filter((item) => item.due === group.due)}
            today={today}
            onAction={onAction}
          />
        ))
      ) : (
        <FollowUpItems
          items={items}
          today={today}
          label={`${FOLLOW_UP_STATUS_LABELS[status]} Follow-ups`}
          onAction={onAction}
          showStatus
        />
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
