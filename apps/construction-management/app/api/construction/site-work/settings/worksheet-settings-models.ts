import { z } from "zod";

import { WORKSHEET_SECTIONS } from "@/src/site-work/domain/worksheet";

export const WORKSHEET_SETTINGS_PATH =
  "/api/construction/site-work/settings/worksheets";

export const GetConstructionSiteWorkWorksheetSettingsRequestModel = z.object({
  projectId: z.uuid(),
});

/**
 * A Project's worksheet settings (CM-0016 §2): which sections and fields
 * the form shows, the order of the four sections, and whether sheets need
 * approval. They apply to sheets saved from then on.
 */
export const SaveConstructionSiteWorkWorksheetSettingsRequestModel = z.object({
  projectId: z.uuid(),
  showLocation: z.boolean(),
  showWorkType: z.boolean(),
  showApproxWorkDone: z.boolean(),
  showLabour: z.boolean(),
  showMaterials: z.boolean(),
  showRemark: z.boolean(),
  showPhotos: z.boolean(),
  /** Each of the four sections once. */
  sectionOrder: z.array(z.enum(WORKSHEET_SECTIONS)).length(4),
  approvalEnabled: z.boolean(),
  /**
   * The `updatedAt` last read (null while on the defaults); 409
   * `WORKSHEET_SETTINGS_CHANGED` when stale. Leave out to skip the check.
   */
  expectedUpdatedAt: z.iso.datetime().nullable().optional(),
});
