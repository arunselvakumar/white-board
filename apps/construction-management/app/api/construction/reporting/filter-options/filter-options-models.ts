import { z } from "zod";

import type { ReportFilterChoices } from "@/src/composition/report-filter-options";

export const REPORT_FILTER_OPTIONS_PATH =
  "/api/construction/reporting/filter-options";

// Requests

/**
 * `scope=project&projectId=…` for a Project's Reports page;
 * `scope=central` for Central Reports.
 */
export const ListConstructionReportingFilterOptionsRequestModel = z
  .object({
    scope: z.enum(["project", "central"]),
    projectId: z.uuid().optional(),
  })
  .refine((value) => value.scope === "central" || value.projectId != null, {
    message: "A Project's filter options need projectId.",
    path: ["projectId"],
  })
  .refine((value) => value.scope === "project" || value.projectId == null, {
    message: "The central filter options take no projectId.",
    path: ["projectId"],
  });

// Responses

const Choice = z.object({ id: z.string(), name: z.string() });

/**
 * The choices of each picker on the report cards the viewer may request
 * (CM-903). A picker no card of theirs takes is empty.
 */
export const ListConstructionReportingFilterOptionsResponseModel = z.object({
  /** Central only: the Projects you may see. */
  projects: z.array(Choice),
  /** Central only, with Central store Read: the Central Stores. */
  stores: z.array(Choice),
  /** The vendors on the Project (every one centrally). */
  vendors: z.array(Choice),
  labourCategories: z.array(Choice),
  suppliers: z.array(Choice),
  materialCategories: z.array(Choice),
  materials: z.array(Choice),
  /** Who raised the Purchase Requests in scope; `id` is a User id. */
  creators: z.array(Choice),
  /** A Project's live Wings (the Booking Report, CM-1008). */
  wings: z.array(Choice),
  /** The Inquiry Report's choices on a Project (CM-1008); stages in funnel order. */
  leadSources: z.array(Choice),
  funnelStages: z.array(Choice),
  lostReasons: z.array(Choice),
  /** Active Team Members on the Project; `id` is a Team Member id. */
  assignees: z.array(Choice),
});

export type ListConstructionReportingFilterOptionsResponseModel = z.infer<
  typeof ListConstructionReportingFilterOptionsResponseModel
>;

export function toFilterOptionsResponse(
  choices: ReportFilterChoices,
): ListConstructionReportingFilterOptionsResponseModel {
  return choices;
}
