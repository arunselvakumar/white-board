"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { equipmentListQuery } from "@/src/queries/equipment";
import { worksheetFormOptionsQuery } from "@/src/queries/worksheets";

import { RecentReports } from "./recent-reports";
import {
  deviceToday,
  REPORT_CATALOGUE,
  SITE_WORK_REPORT_CATALOGUE,
  type ReportDefinition,
} from "./report-catalogue";
import { ReportCard, type ReportFilterOption } from "./report-card";

type FilterOptions = Record<
  NonNullable<ReportDefinition["filter"]>,
  ReportFilterOption[]
>;

/**
 * Filter choices for the site-work cards: the Contractors on the Project
 * (Daily Worksheet read) and the equipment at it now (Equipments or
 * Equipment Usage read). Without the read, the card simply has no filter.
 */
function useSiteWorkFilters(projectId: string): FilterOptions {
  const { data: worksheetOptions } = useQuery({
    ...worksheetFormOptionsQuery(projectId),
    retry: false,
  });
  const { data: equipment } = useQuery({
    ...equipmentListQuery({ place: projectId }),
    retry: false,
  });
  return {
    contractor: (worksheetOptions?.contractors ?? []).map((contractor) => ({
      value: contractor.id,
      label: contractor.name,
    })),
    equipment: (equipment?.items ?? []).map((item) => ({
      value: item.id,
      label: `${item.name} (${item.equipmentNumber})`,
    })),
  };
}

function ReportGroup({
  id,
  title,
  description,
  definitions,
  projectId,
  today,
  filters,
}: {
  id: string;
  title: string;
  description: string;
  definitions: readonly ReportDefinition[];
  projectId: string;
  today: string;
  filters?: FilterOptions;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {definitions.map((definition) => (
          <ReportCard
            key={definition.kind}
            definition={definition}
            projectId={projectId}
            today={today}
            filterOptions={
              definition.filter == null || filters == null
                ? []
                : filters[definition.filter]
            }
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The Project's Reports tab (CM-217, CM-218, CM-605, CM-608): a card per
 * report with its period and Generate, grouped into labour and site work,
 * and the recent reports with Excel / PDF downloads.
 */
export function ReportsPage({
  projectId,
  today = deviceToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the default periods end today. */
  today?: string;
}) {
  const filters = useSiteWorkFilters(projectId);
  return (
    <div className="space-y-8">
      <ReportGroup
        id="reports-heading"
        title="Labour and vendor reports"
        description="Each report is an Excel workbook and a PDF with the Company header, the period and totals."
        definitions={REPORT_CATALOGUE}
        projectId={projectId}
        today={today}
      />
      <ReportGroup
        id="site-work-reports-heading"
        title="Site work"
        description="Daily Worksheets, Equipment Usage sheets, maintenance and transfers, as an Excel workbook and a PDF."
        definitions={SITE_WORK_REPORT_CATALOGUE}
        projectId={projectId}
        today={today}
        filters={filters}
      />
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
