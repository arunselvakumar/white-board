"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { equipmentListQuery } from "@/src/queries/equipment";
import { financeAccessQuery } from "@/src/queries/finance-access";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";
import { pettyCashAccountsQuery } from "@/src/queries/finance-petty-cash";
import { trackingAccessQuery } from "@/src/queries/tracking-access";
import { worksheetFormOptionsQuery } from "@/src/queries/worksheets";

import { RecentReports } from "./recent-reports";
import {
  deviceToday,
  FINANCE_REPORT_CATALOGUE,
  REPORT_CATALOGUE,
  SITE_WORK_REPORT_CATALOGUE,
  TRACKING_REPORT_CATALOGUE,
  type ReportDefinition,
} from "./report-catalogue";
import { ReportCard, type ReportFilterOption } from "./report-card";

export type FilterOptions = Partial<
  Record<NonNullable<ReportDefinition["filter"]>, ReportFilterOption[]>
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

/**
 * The finance cards the viewer may run on this Project (CM-709), by the
 * Report flag on each card's menu, and their filter choices: the
 * Contractors and Suppliers on the Project and the petty-cash accounts the
 * viewer sees.
 */
function useFinanceReports(projectId: string): {
  definitions: ReportDefinition[];
  filters: FilterOptions;
} {
  const { data: access } = useQuery({
    ...financeAccessQuery(projectId),
    retry: false,
  });
  const definitions = FINANCE_REPORT_CATALOGUE.filter((definition) =>
    (definition.menus ?? []).some(
      (menu) => access?.menus[menu].includes("report") === true,
    ),
  );
  const shows = (kind: ReportDefinition["kind"]) =>
    definitions.some((definition) => definition.kind === kind);
  const { data: contractors } = useQuery({
    ...counterpartyOptionsQuery("contractor", projectId),
    enabled: shows("contractor_payments"),
    retry: false,
  });
  const { data: suppliers } = useQuery({
    ...counterpartyOptionsQuery("supplier", projectId),
    enabled: shows("supplier_payments"),
    retry: false,
  });
  const { data: pettyCash } = useQuery({
    ...pettyCashAccountsQuery(),
    enabled: shows("petty_cash"),
    retry: false,
  });
  const named = (items: { id: string; name: string }[] | undefined) =>
    (items ?? []).map((item) => ({ value: item.id, label: item.name }));
  return {
    definitions,
    filters: {
      contractor: named(contractors?.items),
      supplier: named(suppliers?.items),
      account: (pettyCash?.items ?? []).map((account) => ({
        value: account.id,
        label: `${account.name} (${account.holderName})`,
      })),
    },
  };
}

/**
 * The tracking cards the viewer may run on this Project (CM-805), by the
 * Report flag on each card's menu.
 */
function useTrackingReports(projectId: string): ReportDefinition[] {
  const { data: access } = useQuery({
    ...trackingAccessQuery(projectId),
    retry: false,
  });
  return TRACKING_REPORT_CATALOGUE.filter(
    (definition) =>
      definition.trackingMenu != null &&
      access?.menus[definition.trackingMenu].includes("report") === true,
  );
}

export function ReportGroup({
  id,
  title,
  description,
  definitions,
  projectId,
  today,
  filters,
  initialFilters,
}: {
  id: string;
  title: string;
  description: string;
  definitions: readonly ReportDefinition[];
  /** Null for the central reports (Central Payment). */
  projectId: string | null;
  today: string;
  filters?: FilterOptions;
  /**
   * A card's starting filter choice by kind; the card starts again when it
   * changes.
   */
  initialFilters?: Partial<Record<ReportDefinition["kind"], string>>;
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
            key={`${definition.kind}:${initialFilters?.[definition.kind] ?? ""}`}
            definition={definition}
            initialFilter={initialFilters?.[definition.kind]}
            projectId={projectId}
            today={today}
            filterOptions={
              definition.filter == null || filters == null
                ? []
                : (filters[definition.filter] ?? [])
            }
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The Project's Reports tab (CM-217, CM-218, CM-605, CM-608, CM-709,
 * CM-805): a card per report with its period and Generate, grouped into
 * labour, site work, tasks / issues / inspections (shown by the viewer's
 * tracking Report flags) and payments (by the finance Report flags), and
 * the recent reports with Excel / PDF downloads.
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
  const finance = useFinanceReports(projectId);
  const tracking = useTrackingReports(projectId);
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
      {tracking.length === 0 ? null : (
        <ReportGroup
          id="tracking-reports-heading"
          title="Tasks, issues and inspections"
          description="Tasks, Issues & Snags and Inspection Requests on this Project, as an Excel workbook and a PDF."
          definitions={tracking}
          projectId={projectId}
          today={today}
        />
      )}
      {finance.definitions.length === 0 ? null : (
        <ReportGroup
          id="finance-reports-heading"
          title="Payments and accounts"
          description="Transactions, petty cash, party payments, Other Expenses and due payments on this Project, as an Excel workbook and a PDF."
          definitions={finance.definitions}
          projectId={projectId}
          today={today}
          filters={finance.filters}
        />
      )}
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
