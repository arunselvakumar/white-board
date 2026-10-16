"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Suspense } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";

import { equipmentListQuery } from "@/src/queries/equipment";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";
import { pettyCashAccountsQuery } from "@/src/queries/finance-petty-cash";
import { reportCatalogueQuery } from "@/src/queries/report-catalogue";
import { worksheetFormOptionsQuery } from "@/src/queries/worksheets";

import { RecentReports } from "./recent-reports";
import {
  cardFilter,
  deviceToday,
  REPORT_GROUP_COPY,
  type CardFilter,
  type ReportDefinition,
} from "./report-catalogue";
import { ReportCard, type ReportFilterOption } from "./report-card";

export type FilterOptions = Partial<Record<CardFilter, ReportFilterOption[]>>;

const shows = (
  definitions: readonly ReportDefinition[],
  ...kinds: ReportDefinition["kind"][]
) => definitions.some((definition) => kinds.includes(definition.kind));

/**
 * Filter choices for the site-work cards: the Contractors on the Project
 * (Daily Worksheet read) and the equipment at it now (Equipments or
 * Equipment Usage read). Without the read, the card simply has no filter.
 */
function useSiteWorkFilters(
  projectId: string,
  definitions: readonly ReportDefinition[],
): FilterOptions {
  const { data: worksheetOptions } = useQuery({
    ...worksheetFormOptionsQuery(projectId),
    enabled: shows(definitions, "daily_work"),
    retry: false,
  });
  const { data: equipment } = useQuery({
    ...equipmentListQuery({ place: projectId }),
    enabled: shows(
      definitions,
      "owned_equipment_usage",
      "rented_equipment_usage",
    ),
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
 * Filter choices for the finance cards: the Contractors and Suppliers on
 * the Project and the petty-cash accounts the viewer sees, read only for
 * the cards the catalogue offers.
 */
function useFinanceFilters(
  projectId: string,
  definitions: readonly ReportDefinition[],
): FilterOptions {
  const { data: contractors } = useQuery({
    ...counterpartyOptionsQuery("contractor", projectId),
    enabled: shows(definitions, "contractor_payments"),
    retry: false,
  });
  const { data: suppliers } = useQuery({
    ...counterpartyOptionsQuery("supplier", projectId),
    enabled: shows(definitions, "supplier_payments"),
    retry: false,
  });
  const { data: pettyCash } = useQuery({
    ...pettyCashAccountsQuery(),
    enabled: shows(definitions, "petty_cash"),
    retry: false,
  });
  const named = (items: { id: string; name: string }[] | undefined) =>
    (items ?? []).map((item) => ({ value: item.id, label: item.name }));
  return {
    contractor: named(contractors?.items),
    supplier: named(suppliers?.items),
    account: (pettyCash?.items ?? []).map((account) => ({
      value: account.id,
      label: `${account.name} (${account.holderName})`,
    })),
  };
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
        {definitions.map((definition) => {
          const filter = cardFilter(definition);
          return (
            <ReportCard
              key={`${definition.kind}:${initialFilters?.[definition.kind] ?? ""}`}
              definition={definition}
              initialFilter={initialFilters?.[definition.kind]}
              projectId={projectId}
              today={today}
              filterOptions={
                filter == null || filters == null
                  ? []
                  : (filters[filter.key] ?? [])
              }
            />
          );
        })}
      </div>
    </section>
  );
}

/** The groups the Reports page shows, in order; Progress Reports have their own module. */
const PAGE_GROUPS = [
  "labour",
  "site_work",
  "tracking",
  "finance",
  "procurement",
] as const satisfies readonly ReportDefinition["group"][];

/**
 * The Project's Reports tab (CM-217 … CM-805, CM-901): a card per report
 * the viewer may request, from the server's catalogue trimmed to their
 * Permission Matrix, grouped into labour, site work, tasks / issues /
 * inspections, payments and materials, then the recent reports with Excel
 * / PDF downloads.
 */
export function ReportsPage({
  projectId,
  today = deviceToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the default periods end today. */
  today?: string;
}) {
  const { data: catalogue } = useSuspenseQuery(reportCatalogueQuery(projectId));
  const offered = catalogue.items.filter((item) => !item.progressReport);
  const inGroup = (group: ReportDefinition["group"]) =>
    offered.filter((item) => item.group === group);
  const siteWork = useSiteWorkFilters(projectId, inGroup("site_work"));
  const finance = useFinanceFilters(projectId, inGroup("finance"));
  const filters: Partial<Record<ReportDefinition["group"], FilterOptions>> = {
    site_work: siteWork,
    finance,
  };
  return (
    <div className="space-y-8">
      {offered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSpreadsheet />
            </EmptyMedia>
            <EmptyTitle>No reports you can generate here</EmptyTitle>
            <EmptyDescription>
              Reports need the Report flag on their menu for this Project. Ask
              the Owner to change your Permission Matrix.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {PAGE_GROUPS.map((group) => {
        const definitions = inGroup(group);
        if (definitions.length === 0) return null;
        const copy = REPORT_GROUP_COPY[group];
        return (
          <ReportGroup
            key={group}
            id={`${group.replace("_", "-")}-reports-heading`}
            title={copy.title}
            description={copy.description}
            definitions={definitions}
            projectId={projectId}
            today={today}
            filters={filters[group]}
          />
        );
      })}
      {offered.length === 0 ? null : (
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
      )}
    </div>
  );
}
