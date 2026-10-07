"use client";

import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

import { addDays, dateKeyInZone } from "@/lib/calendar-dates";
import { enquiryQueries, type DemoResponse } from "@/src/queries/enquiries";

const INSTITUTE_TIMEZONE = "Asia/Kolkata";
const DAYS_AHEAD = 7;

/** "Today", "Tomorrow", else "Thu 9 Oct". */
export function demoDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(`${date}T00:00:00.000Z`))
    .replace(",", "");
}

/**
 * A Teacher's demos for today and the next six days. Loads inside its own
 * boundary so a slow or failed read never holds up My Batches.
 */
export function UpcomingDemosCard({ today }: { today?: string }) {
  const from = today ?? dateKeyInZone(new Date(), INSTITUTE_TIMEZONE);
  return (
    <section
      aria-labelledby="upcoming-demos-heading"
      className="rounded-xl border p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="upcoming-demos-heading" className="font-semibold">
          Upcoming demos
        </h2>
        <span className="text-muted-foreground text-xs">Next 7 days</span>
      </div>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <DemosErrorBoundary onReset={reset}>
            <Suspense fallback={<DemosFallback />}>
              <UpcomingDemosList from={from} />
            </Suspense>
          </DemosErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </section>
  );
}

function DemosFallback() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function UpcomingDemosList({ from }: { from: string }) {
  const { data } = useSuspenseQuery(
    enquiryQueries.demos(from, addDays(from, DAYS_AHEAD - 1)),
  );
  const demos = data.items.filter((demo) => demo.cancelledAt == null);
  if (demos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No demos in the next 7 days.
      </p>
    );
  }
  const days = new Map<string, DemoResponse[]>();
  for (const demo of demos) {
    days.set(demo.date, [...(days.get(demo.date) ?? []), demo]);
  }
  return (
    <div className="space-y-4">
      {[...days.entries()].map(([date, items]) => {
        const label = demoDayLabel(date, from);
        return (
          <div key={date} className="space-y-1">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {label}
            </h3>
            <ul aria-label={label} className="-mx-2">
              {items.map((demo) => (
                <li key={demo.id}>
                  <DemoRow demo={demo} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DemoRow({ demo }: { demo: DemoResponse }) {
  const where =
    demo.kind === "batch"
      ? [demo.batchName, demo.courseName].filter(Boolean).join(" · ")
      : ["One-to-one", demo.enquiryInterest].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/enquiries/${demo.enquiryId}`}
      className="hover:bg-muted focus-visible:outline-ring flex items-baseline gap-3 rounded-lg px-2 py-2 text-sm focus-visible:outline-2"
    >
      <time
        dateTime={`${demo.date}T${demo.startTime}`}
        className="w-11 shrink-0 tabular-nums"
      >
        {demo.startTime}
      </time>
      <span className="min-w-0">
        <span className="block truncate">
          <span className="font-medium">{demo.prospectName}</span>{" "}
          <span className="text-muted-foreground">demo</span>
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {where}
        </span>
      </span>
    </Link>
  );
}

type DemosErrorBoundaryProps = { children: ReactNode; onReset: () => void };
type DemosErrorBoundaryState = { failed: boolean };

class DemosErrorBoundary extends Component<
  DemosErrorBoundaryProps,
  DemosErrorBoundaryState
> {
  override state: DemosErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DemosErrorBoundaryState {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Couldn’t load upcoming demos.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            this.props.onReset();
            this.setState({ failed: false });
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
}
