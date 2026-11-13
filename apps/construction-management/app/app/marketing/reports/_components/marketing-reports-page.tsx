"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Suspense } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { RecentReports } from "@/app/app/_components/reports/recent-reports";
import {
  deviceToday,
  REPORT_GROUP_COPY,
} from "@/app/app/_components/reports/report-catalogue";
import { useReportPickerOptions } from "@/app/app/_components/reports/report-pickers";
import { ReportGroup } from "@/app/app/_components/reports/reports-page";
import {
  RecentReportsSkeleton,
  ReportGroupsSkeleton,
} from "@/app/app/_components/reports/reports-skeletons";
import { marketingSection } from "@/lib/marketing-nav";
import { reportCatalogueQuery } from "@/src/queries/report-catalogue";
import type { ReportKind } from "@/src/queries/reports";

/** The Marketing reports, which Recent reports lists here. */
export const MARKETING_REPORT_KINDS: readonly ReportKind[] = [
  "marketing_visit_register",
  "marketing_person_summary",
  "marketing_company_pipeline",
];

/** The three cards the viewer may request, from the central catalogue. */
function MarketingReportCards({ today }: { today: string }) {
  const { data: catalogue } = useSuspenseQuery(reportCatalogueQuery(null));
  const offered = catalogue.items.filter((item) => item.group === "marketing");
  const pickers = useReportPickerOptions(null, offered);
  if (offered.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSpreadsheet />
          </EmptyMedia>
          <EmptyTitle>No Marketing Reports you can generate</EmptyTitle>
          <EmptyDescription>
            Marketing Reports need the Report flag on Visits. Ask the Owner to
            change your Permission Matrix.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const copy = REPORT_GROUP_COPY.marketing;
  return (
    <div className="space-y-8">
      <ReportGroup
        id="marketing-reports-heading"
        title="Reports"
        description={copy.description}
        definitions={offered}
        projectId={null}
        today={today}
        pickers={pickers}
      />
      <section
        aria-labelledby="marketing-recent-reports-heading"
        className="space-y-3"
      >
        <h2
          id="marketing-recent-reports-heading"
          className="text-lg font-semibold"
        >
          Your recent Marketing Reports
        </h2>
        <Suspense fallback={<RecentReportsSkeleton rows={2} />}>
          <RecentReports projectId={null} kinds={MARKETING_REPORT_KINDS} />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * Marketing → Reports (ADR CM-0040 §13): the Visit register, the Marketing
 * Person summary and the Company pipeline, each with its period and
 * filters and Excel / PDF, run as report jobs that land in Downloads. The
 * rows follow the viewer's View all on each record's menu; only they and
 * the Owner can open what they generate.
 */
export function MarketingReportsPage({
  today = deviceToday(),
}: {
  /** `YYYY-MM-DD`; the default periods end today. */
  today?: string;
}) {
  const section = marketingSection("reports");
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-6xl min-w-0 space-y-8">
        <PageHeader
          title={section.title}
          meta="Only you and the Owner can open the reports you generate."
        />
        <Suspense
          fallback={<ReportGroupsSkeleton label="Loading Marketing Reports" />}
        >
          <MarketingReportCards today={today} />
        </Suspense>
      </div>
    </div>
  );
}
