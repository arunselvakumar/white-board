"use client";

import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { RecentReports } from "./recent-reports";
import { deviceToday, REPORT_CATALOGUE } from "./report-catalogue";
import { ReportCard } from "./report-card";

/**
 * The Project's Reports tab (CM-217, CM-218): a card per report with its
 * period and Generate, and the recent reports with Excel / PDF downloads.
 */
export function ReportsPage({
  projectId,
  today = deviceToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the default periods end today. */
  today?: string;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="reports-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="reports-heading" className="text-lg font-semibold">
            Labour and vendor reports
          </h2>
          <p className="text-muted-foreground text-sm">
            Each report is an Excel workbook and a PDF with the Company header,
            the period and totals.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_CATALOGUE.map((definition) => (
            <ReportCard
              key={definition.kind}
              definition={definition}
              projectId={projectId}
              today={today}
            />
          ))}
        </div>
      </section>
      <section aria-labelledby="recent-reports-heading" className="space-y-3">
        <h2 id="recent-reports-heading" className="text-lg font-semibold">
          Recent reports
        </h2>
        <Suspense
          fallback={
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          }
        >
          <RecentReports projectId={projectId} />
        </Suspense>
      </section>
    </div>
  );
}
