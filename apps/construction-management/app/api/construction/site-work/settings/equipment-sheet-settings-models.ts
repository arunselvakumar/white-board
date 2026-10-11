import { z } from "zod";

export const EQUIPMENT_SHEET_SETTINGS_PATH =
  "/api/construction/site-work/settings/equipment-sheets";

export const GetConstructionSiteWorkEquipmentSheetSettingsRequestModel =
  z.object({ projectId: z.uuid() });

/**
 * A Project's equipment-sheet settings (CM-0016 §2): which fields the
 * usage-sheet form shows and whether sheets need approval. They apply to
 * sheets saved from then on; a hidden field is neither validated nor
 * stored.
 */
export const SaveConstructionSiteWorkEquipmentSheetSettingsRequestModel =
  z.object({
    projectId: z.uuid(),
    showOperator: z.boolean(),
    showSupervisor: z.boolean(),
    showLocation: z.boolean(),
    showApproxWorkDone: z.boolean(),
    /** The billable quantity override on rented sheets. */
    showBillableQty: z.boolean(),
    showFuel: z.boolean(),
    showRemarks: z.boolean(),
    showFiles: z.boolean(),
    showMaterials: z.boolean(),
    showMeterReadings: z.boolean(),
    showBreakdownHours: z.boolean(),
    approvalEnabled: z.boolean(),
    /**
     * The `updatedAt` last read (null while on the defaults); 409
     * `EQUIPMENT_SHEET_SETTINGS_CHANGED` when stale. Leave out to skip the
     * check.
     */
    expectedUpdatedAt: z.iso.datetime().nullable().optional(),
  });
