import { z } from "zod";

import type { ProjectLabourSummary } from "@/src/labour/application/project-labour-summary";

export const LABOUR_SUMMARY_PATH = "/api/construction/labour/summary";

export const GetConstructionLabourProjectSummaryRequestModel = z.object({
  projectId: z.uuid(),
  /** `YYYY-MM-DD`; today in the Company time zone when left out. */
  date: z.iso
    .date()
    .optional()
    .describe(
      "The day the counts are for and the series ends on; today in the Company time zone when left out.",
    ),
  from: z.iso
    .date()
    .optional()
    .describe(
      "The series' first day (the Project Dashboard's duration); the last 14 days when left out. 400 SUMMARY_RANGE_INVALID after `date` or more than 366 days before it.",
    ),
});

const balance = z
  .object({
    /** Paise owed to labourers or vendors. */
    toPay: z.int(),
    /** Paise advanced ahead of wages. */
    advanced: z.int(),
  })
  .nullable()
  .describe("Null without Financial");

export const GetConstructionLabourProjectSummaryResponseModel = z.object({
  date: z.iso.date(),
  labourers: z.object({
    onProject: z.int(),
    present: z.int(),
    halfDay: z.int(),
    absent: z.int(),
    off: z.int(),
    unmarked: z.int(),
  }),
  vendors: z.object({
    assigned: z.int(),
    recordedToday: z.int(),
    headcountToday: z.int(),
  }),
  presentSeries: z.array(
    z.object({
      date: z.iso.date(),
      present: z.int(),
      vendorHeadcount: z.int(),
    }),
  ),
  labourBalance: balance,
  vendorBalance: balance,
});

export type GetConstructionLabourProjectSummaryResponseModel = z.infer<
  typeof GetConstructionLabourProjectSummaryResponseModel
>;

export function toProjectSummaryResponse(
  summary: ProjectLabourSummary,
  financial: { labour: boolean; vendor: boolean },
): GetConstructionLabourProjectSummaryResponseModel {
  return {
    ...summary,
    labourBalance: financial.labour ? summary.labourBalance : null,
    vendorBalance: financial.vendor ? summary.vendorBalance : null,
  };
}
