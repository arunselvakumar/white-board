import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionReportingCatalogueEntryResponseModel,
  ListConstructionReportingCatalogueResponseModel,
} from "@/app/api/construction/reporting/catalogue/catalogue-models";

import { apiJson } from "./http";
import { REPORTS_KEY } from "./reports";

export type ReportCatalogueEntry =
  ConstructionReportingCatalogueEntryResponseModel;
export type ReportCatalogue = ListConstructionReportingCatalogueResponseModel;

export const REPORT_CATALOGUE_API = "/api/construction/reporting/catalogue";

/**
 * The reports the viewer may request on a Project, or with `null`
 * centrally (ADR CM-0021 §2): the server trims the catalogue to their
 * Permission Matrix, so a card shows exactly when its request would pass.
 */
export function reportCatalogueQuery(projectId: string | null) {
  const query =
    projectId == null
      ? new URLSearchParams({ scope: "central" })
      : new URLSearchParams({ scope: "project", projectId });
  return queryOptions({
    queryKey: [...REPORTS_KEY, "catalogue", projectId ?? "central"] as const,
    queryFn: () =>
      apiJson<ReportCatalogue>(`${REPORT_CATALOGUE_API}?${query.toString()}`),
  });
}
