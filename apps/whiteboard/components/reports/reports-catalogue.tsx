"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  reportHref,
  reportQueries,
  type ReportCatalogueItem,
  type ReportCatalogueResponse,
} from "@/src/queries/reports";
import {
  REPORT_GROUP_LABELS,
  type ReportGroup,
} from "@/src/training-institute/domain/report-catalogue";

export function ReportsCatalogueScreen() {
  const { data } = useSuspenseQuery(reportQueries.catalogue());
  return <ReportsCatalogue catalogue={data} />;
}

function formats(item: ReportCatalogueItem): string | null {
  const list = [item.excel ? "Excel" : null, item.pdf ? "PDF" : null].filter(
    (value): value is string => value != null,
  );
  return list.length === 0 ? null : list.join(" · ");
}

/** The reports this role may open, grouped as in the Reports catalogue. */
export function ReportsCatalogue({
  catalogue,
}: {
  catalogue: ReportCatalogueResponse;
}) {
  const groups = (Object.keys(REPORT_GROUP_LABELS) as ReportGroup[])
    .map((group) => ({
      group,
      label: REPORT_GROUP_LABELS[group],
      items: catalogue.items.filter((item) => item.group === group),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Reports"
        meta="Open a report to filter, print, download or email it."
        actions={
          catalogue.role === "owner" ? (
            <Link
              href="/reports/settings"
              className={buttonVariants({ variant: "outline" })}
            >
              <Settings aria-hidden="true" />
              Report settings
            </Link>
          ) : null
        }
      />
      {groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No reports for you yet.</EmptyTitle>
            <EmptyDescription>
              Reports you can open will show here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((entry) => (
          <section
            key={entry.group}
            aria-labelledby={`reports-${entry.group}`}
            className="space-y-3"
          >
            <h2
              id={`reports-${entry.group}`}
              className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase"
            >
              {entry.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {entry.items.map((item) => {
                const files = formats(item);
                return (
                  <li key={item.key}>
                    <Link
                      href={reportHref(item.key)}
                      className="bg-card hover:bg-muted/50 focus-visible:ring-ring/50 group flex h-full items-start gap-3 rounded-2xl border p-4 shadow-sm transition-colors outline-none focus-visible:ring-3"
                    >
                      <Badge
                        variant="secondary"
                        className="mt-0.5 tabular-nums"
                      >
                        {item.code}
                      </Badge>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-medium">{item.title}</span>
                        <span className="text-muted-foreground block text-sm">
                          {item.purpose}
                        </span>
                        {files == null ? null : (
                          <span className="text-muted-foreground block text-xs">
                            {files}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
