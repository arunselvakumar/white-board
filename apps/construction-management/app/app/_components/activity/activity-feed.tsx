"use client";

import {
  QueryErrorResetBoundary,
  type InfiniteData,
  type UseSuspenseInfiniteQueryResult,
} from "@tanstack/react-query";
import { ChevronDown, History, type LucideIcon } from "lucide-react";
import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";

import { ActivityFeedSkeleton } from "./activity-skeletons";

/** One line of a feed, already worded by the feed that owns it. */
export type ActivityFeedItem = {
  id: string;
  /** The day it applies to, `YYYY-MM-DD`. */
  date: string;
  /** When it was recorded, an ISO instant. */
  recordedAt: string;
  by: string | null;
  icon: LucideIcon;
  tone?: "default" | "added" | "removed";
  title: ReactNode;
  detail?: ReactNode;
  /** Shown when the entry is opened, e.g. the names in a batch. */
  more?: { label: string; content: ReactNode };
  /** At the entry's end, e.g. a check-in entry's photo. */
  preview?: ReactNode;
  /** A voided entry stays, struck through, with why (ADR CM-0044 §2). */
  voided?: { reason: string };
};

const TONES: Record<NonNullable<ActivityFeedItem["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  added: "bg-primary/10 text-primary",
  removed: "bg-destructive/10 text-destructive",
};

function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function previousDay(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`) - 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Tue, 10 Nov 2026". */
export function activityDayLabel(
  date: string,
  timeZone: string,
  now = new Date(),
): string {
  const today = todayIn(timeZone, now);
  if (date === today) return "Today";
  if (date === previousDay(today)) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** When it was recorded, in the Company's time zone: "10 Nov 2026, 4:05 pm". */
export function activityRecordedLabel(
  recordedAt: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(recordedAt));
}

function groupByDay(
  items: readonly ActivityFeedItem[],
): { date: string; items: ActivityFeedItem[] }[] {
  const days: { date: string; items: ActivityFeedItem[] }[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last?.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

function Entry({
  item,
  timeZone,
}: {
  item: ActivityFeedItem;
  timeZone: string;
}) {
  const Icon = item.icon;
  const struck = item.voided != null;
  return (
    <li className="flex min-w-0 gap-3 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
          TONES[item.tone ?? "default"],
        )}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={cn(
            "text-sm break-words",
            struck && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </p>
        {item.detail == null ? null : (
          <p
            className={cn(
              "text-muted-foreground text-sm break-words",
              struck && "line-through opacity-70",
            )}
          >
            {item.detail}
          </p>
        )}
        {item.voided == null ? null : (
          <p className="text-destructive text-sm break-words">
            Voided: {item.voided.reason}
          </p>
        )}
        {item.more == null ? null : (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="group h-auto px-0"
                />
              }
            >
              {item.more.label}
              <ChevronDown
                aria-hidden="true"
                className="transition-transform group-data-[panel-open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1 text-sm">
              {item.more.content}
            </CollapsibleContent>
          </Collapsible>
        )}
        <p className="text-muted-foreground text-xs">
          {item.by == null ? "" : `by ${item.by} · `}
          <time dateTime={item.recordedAt}>
            {activityRecordedLabel(item.recordedAt, timeZone)}
          </time>
        </p>
      </div>
      {item.preview == null ? null : (
        <div className="shrink-0">{item.preview}</div>
      )}
    </li>
  );
}

/**
 * An Activity feed (ADR CM-0038): entries grouped by the day they apply
 * to, newest first, each with who recorded it and when, and Load more.
 * The Labour and Project feeds word their own entries.
 */
export function ActivityFeed({
  items,
  timeZone,
  emptyMessage,
  hasNextPage,
  isFetchingNextPage,
  loadMoreFailed,
  onLoadMore,
  now,
}: {
  items: readonly ActivityFeedItem[];
  timeZone: string;
  emptyMessage: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMoreFailed: boolean;
  onLoadMore: () => void;
  /** For stories: what "Today" is. */
  now?: Date;
}) {
  if (items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No activity</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-4">
      {groupByDay(items).map((day) => (
        <section
          key={day.date}
          aria-label={activityDayLabel(day.date, timeZone, now)}
        >
          <h2 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            {activityDayLabel(day.date, timeZone, now)}
          </h2>
          <ol className="divide-y">
            {day.items.map((item) => (
              <Entry key={item.id} item={item} timeZone={timeZone} />
            ))}
          </ol>
        </section>
      ))}
      {loadMoreFailed ? (
        <FormAlert message="Couldn't load more. Please try again." />
      ) : null}
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

/** The infinite query's state as `ActivityFeed` props. */
export function feedPaging<Page>(
  query: UseSuspenseInfiniteQueryResult<InfiniteData<Page>>,
) {
  return {
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    onLoadMore: () => {
      void query.fetchNextPage();
    },
  };
}

type BoundaryProps = { children: ReactNode; onReset: () => void };

class FeedErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load the activity</EmptyTitle>
          <EmptyDescription>Please try again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            onClick={() => {
              this.props.onReset();
              this.setState({ failed: false });
            }}
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
}

/** Loading and error states for a feed that reads with `useSuspenseInfiniteQuery`. */
export function ActivityFeedBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <FeedErrorBoundary onReset={reset}>
          <Suspense fallback={<ActivityFeedSkeleton />}>{children}</Suspense>
        </FeedErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
