import { z } from "zod";

import type { ViewerCatalogueEntry } from "@/src/reporting/application/report-access";
import { REPORT_GROUPS } from "@/src/reporting/domain/report-catalogue";
import { REPORT_KINDS } from "@/src/reporting/domain/report-job";

export const REPORT_CATALOGUE_PATH = "/api/construction/reporting/catalogue";

const SCOPES = ["project", "central"] as const;

const FILTER_KEYS = [
  "contractor",
  "supplier",
  "vendor",
  "labour_category",
  "equipment",
  "account",
  "category",
  "mode",
  "module",
  "counterparty_kind",
  "projects",
  "store",
  "material",
  "filled_by",
  "include_images",
  // The procurement reports' filters (CM-903).
  "status",
  "material_category",
  "created_by",
  "transfer_type",
] as const;

// Requests

/**
 * `scope=project&projectId=…` for a Project's Reports page;
 * `scope=central` for the reports requested without a Project.
 */
export const ListConstructionReportingCatalogueRequestModel = z
  .object({
    scope: z.enum(SCOPES),
    projectId: z.uuid().optional(),
  })
  .refine((value) => value.scope === "central" || value.projectId != null, {
    message: "A Project's catalogue needs projectId.",
    path: ["projectId"],
  })
  .refine((value) => value.scope === "project" || value.projectId == null, {
    message: "The central catalogue takes no projectId.",
    path: ["projectId"],
  });

export type ListConstructionReportingCatalogueRequestModel = z.infer<
  typeof ListConstructionReportingCatalogueRequestModel
>;

// Responses

/** One report the viewer may request, as the report screens show it. */
export const ConstructionReportingCatalogueEntryResponseModel = z.object({
  kind: z.enum(REPORT_KINDS),
  title: z.string(),
  description: z.string(),
  /** What the report needs, in words ("Needs Labour Report."). */
  needs: z.string(),
  /** The Reports page group the card sits in. */
  group: z.enum(REPORT_GROUPS),
  /** A range, a month, an as-on day, a financial year, or one day. */
  period: z.enum(["range", "month", "as_on", "fy", "date"]),
  formats: z.array(z.enum(["xlsx", "pdf"])),
  /** The filters the request takes beside its period, in card order. */
  filters: z.array(
    z.object({
      key: z.enum(FILTER_KEYS),
      /** The request is refused without it. */
      required: z.boolean(),
    }),
  ),
  /** `always`: about money; `with_financial`: amounts with Financial; `never`. */
  money: z.enum(["always", "with_financial", "never"]),
  /** The viewer's files of this report would carry amounts. */
  includesMoney: z.boolean(),
  /**
   * A Progress Report: requested from the Project's Progress Reports
   * module, not the Reports page.
   */
  progressReport: z.boolean(),
});

export type ConstructionReportingCatalogueEntryResponseModel = z.infer<
  typeof ConstructionReportingCatalogueEntryResponseModel
>;

export const ListConstructionReportingCatalogueResponseModel = z.object({
  scope: z.enum(SCOPES),
  /** The reports the viewer may request, in display order. */
  items: z.array(ConstructionReportingCatalogueEntryResponseModel),
});

export type ListConstructionReportingCatalogueResponseModel = z.infer<
  typeof ListConstructionReportingCatalogueResponseModel
>;

export function toCatalogueEntryResponse(
  entry: ViewerCatalogueEntry,
): ConstructionReportingCatalogueEntryResponseModel {
  return {
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    needs: entry.needs,
    group: entry.group,
    period: entry.period,
    formats: [...entry.formats],
    filters: entry.filters.map((filter) => ({
      key: filter.key,
      required: filter.required === true,
    })),
    money: entry.money,
    includesMoney: entry.includesMoney,
    progressReport: entry.progressReport,
  };
}
