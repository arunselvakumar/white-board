"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { PageHeader } from "@/components/app-shell/page-header";
import { addMonths, dateKeyInZone, formatDate } from "@/lib/calendar-dates";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  enquiryQueries,
  type EnquirySummaryResponse,
} from "@/src/queries/enquiries";

const INSTITUTE_TIMEZONE = "Asia/Kolkata";

/** This calendar month in the institute's timezone, as YYYY-MM. */
export function currentEnquiryMonth(now: Date = new Date()): string {
  return dateKeyInZone(now, INSTITUTE_TIMEZONE).slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  return addMonths(`${month}-01`, by).slice(0, 7);
}

function monthLabel(month: string): string {
  return formatDate(`${month}-01`, { month: "long", year: "numeric" });
}

export function EnquirySummaryScreen() {
  const latest = currentEnquiryMonth();
  const [month, setMonth] = useState(latest);
  const [isPending, startTransition] = useTransition();
  const go = (by: number) => {
    startTransition(() => {
      setMonth((current) => shiftMonth(current, by));
    });
  };

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          back={{ label: "Enquiries", href: "/enquiries" }}
          title="Enquiry summary"
          meta="How Enquiries turned into admissions, month by month."
        />
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <h2
            className="text-xl tracking-tight tabular-nums"
            aria-live="polite"
          >
            {monthLabel(month)}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => {
                go(-1);
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={month >= latest}
              onClick={() => {
                go(1);
              }}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div
          aria-busy={isPending}
          className={
            isPending ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <Suspense fallback={<SummaryFallback />}>
            <MonthSummary month={month} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function SummaryFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function MonthSummary({ month }: { month: string }) {
  const { data } = useSuspenseQuery(enquiryQueries.summary(month));
  return <EnquirySummaryView summary={data} />;
}

export function EnquirySummaryView({
  summary,
}: {
  summary: EnquirySummaryResponse;
}) {
  const tiles = [
    { label: "Enquiries received", value: String(summary.enquiriesReceived) },
    { label: "Demos attended", value: String(summary.demosAttended) },
    { label: "Admissions", value: String(summary.admissions) },
    {
      label: "Paid demo fees",
      value: formatPaiseAsRupees(summary.paidDemoFeesPaise),
    },
  ];
  return (
    <div className="space-y-8">
      <section
        aria-label="Month totals"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {tiles.map((tile) => (
          <article
            key={tile.label}
            className="bg-card flex flex-col gap-1 rounded-xl border p-4"
          >
            <h3 className="text-muted-foreground text-sm font-normal">
              {tile.label}
            </h3>
            <p className="text-2xl tracking-tight tabular-nums">{tile.value}</p>
          </article>
        ))}
      </section>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SourcesTable sources={summary.sources} />
        <NotInterestedReasons reasons={summary.notInterestedReasons} />
      </div>
    </div>
  );
}

function conversion(enquiries: number, admissions: number): string {
  if (enquiries === 0) return "—";
  return `${Math.round((admissions / enquiries) * 100)}%`;
}

function SourcesTable({
  sources,
}: {
  sources: EnquirySummaryResponse["sources"];
}) {
  // The API orders by admissions, then Enquiries; the first is the top Source.
  const top = sources[0];
  const topKey =
    top != null && (top.admissions > 0 || top.enquiries > 0)
      ? (top.sourceId ?? "none")
      : null;
  return (
    <section
      aria-labelledby="summary-sources-heading"
      className="min-w-0 space-y-3"
    >
      <h2 id="summary-sources-heading" className="text-lg tracking-tight">
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Enquiries this month.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table className="text-[13px] sm:text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3 sm:pl-4">Source</TableHead>
                <TableHead className="text-right">Enquiries</TableHead>
                <TableHead className="text-right">Admissions</TableHead>
                <TableHead className="pr-3 text-right sm:pr-4">
                  Conversion
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => {
                const key = source.sourceId ?? "none";
                const isTop = key === topKey;
                return (
                  <TableRow
                    key={key}
                    className={isTop ? "bg-muted/50 font-medium" : undefined}
                  >
                    <TableCell className="pl-3 sm:pl-4">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            source.sourceId == null
                              ? "text-muted-foreground"
                              : undefined
                          }
                        >
                          {source.name}
                        </span>
                        {isTop ? (
                          <Badge variant="secondary" className="text-xs">
                            Top Source
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {source.enquiries}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {source.admissions}
                    </TableCell>
                    <TableCell className="pr-3 text-right tabular-nums sm:pr-4">
                      {conversion(source.enquiries, source.admissions)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function NotInterestedReasons({
  reasons,
}: {
  reasons: EnquirySummaryResponse["notInterestedReasons"];
}) {
  return (
    <section aria-labelledby="summary-reasons-heading" className="space-y-3">
      <h2 id="summary-reasons-heading" className="text-lg tracking-tight">
        Top reasons for Not interested
      </h2>
      {reasons.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Enquiries were closed as Not interested this month.
        </p>
      ) : (
        <ol className="divide-y rounded-xl border">
          {reasons.map((item, index) => (
            <li
              key={item.reason}
              className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm"
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="text-muted-foreground w-4 shrink-0 tabular-nums">
                  {index + 1}
                </span>
                <span className="break-words">{item.reason}</span>
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {item.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
