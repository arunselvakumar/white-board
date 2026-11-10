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

import { PageHeader } from "@/components/app-shell/page-header";
import { reportCatalogueQuery } from "@/src/queries/report-catalogue";

import { RecentReports } from "./recent-reports";
import { deviceToday, type ReportDefinition } from "./report-catalogue";
import { useReportPickerOptions } from "./report-pickers";
import { ReportGroup } from "./reports-page";
import {
  RecentReportsSkeleton,
  ReportGroupsSkeleton,
} from "./reports-skeletons";

/** Central Reports' groups, in order, worded for the whole Company. */
const CENTRAL_GROUPS: {
  group: ReportDefinition["group"];
  title: string;
  description: string;
}[] = [
  {
    group: "labour",
    title: "Labour and vendors",
    description:
      "Labour and vendor attendance across the Projects you may see, as an Excel workbook and a PDF.",
  },
  {
    group: "procurement",
    title: "Materials",
    description:
      "Purchase Requests, Purchase Orders, material received and transferred, and the Stock Register across your Projects and the Central Stores.",
  },
  {
    group: "site_work",
    title: "Equipment",
    description:
      "Maintenance and transfers of every machine, at any Project or the warehouse.",
  },
  {
    group: "finance",
    title: "Payments and accounts",
    description:
      "The Ledger, TDS 194C and Due Payments, as on Central Payment.",
  },
  {
    group: "tracking",
    title: "Tasks, issues and inspections",
    description: "Tasks, Issues & Snags and Inspection Requests.",
  },
];

/** The cards the viewer may request, by group. */
function CentralReportCards({ today }: { today: string }) {
  const { data: catalogue } = useSuspenseQuery(reportCatalogueQuery(null));
  const offered = catalogue.items.filter((item) => !item.progressReport);
  const pickers = useReportPickerOptions(null, offered);
  if (offered.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSpreadsheet />
          </EmptyMedia>
          <EmptyTitle>No central reports you can generate</EmptyTitle>
          <EmptyDescription>
            A central report needs the Report flag on its menu. Ask the Owner to
            change your Permission Matrix.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-8">
      {CENTRAL_GROUPS.map(({ group, title, description }) => {
        const definitions = offered.filter((item) => item.group === group);
        if (definitions.length === 0) return null;
        return (
          <ReportGroup
            key={group}
            id={`central-${group.replace("_", "-")}-heading`}
            title={title}
            description={description}
            definitions={definitions}
            projectId={null}
            today={today}
            pickers={pickers}
          />
        );
      })}
      <RecentCentralReports />
    </div>
  );
}

/** The member's own central reports, newest first, polling while one generates. */
function RecentCentralReports() {
  return (
    <section
      aria-labelledby="central-recent-reports-heading"
      className="space-y-3"
    >
      <h2 id="central-recent-reports-heading" className="text-lg font-semibold">
        Your recent central reports
      </h2>
      <Suspense fallback={<RecentReportsSkeleton rows={2} />}>
        <RecentReports projectId={null} />
      </Suspense>
    </section>
  );
}

/**
 * Workspace → Central Reports (CM-903, ADR CM-0021 §5): every central
 * report of the catalogue the member may request — Central Reports Read
 * and the report's own Report flag — grouped like the Project's Reports
 * page. Each card takes its period, its pickers and the Projects (all
 * the member may see, or a chosen few); stock reports take a Store. Then
 * the member's recent central reports (shown only with a card: the list
 * needs a report the member may request).
 */
export function CentralReportsPage({
  today = deviceToday(),
}: {
  /** `YYYY-MM-DD`; the default periods end today. */
  today?: string;
}) {
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-6xl min-w-0 space-y-8">
        <PageHeader
          title="Central Reports"
          meta="Reports across your Projects and the Central Stores. Only you and the Owner can open the central reports you generate."
        />
        <Suspense
          fallback={<ReportGroupsSkeleton label="Loading central reports" />}
        >
          <CentralReportCards today={today} />
        </Suspense>
      </div>
    </div>
  );
}
