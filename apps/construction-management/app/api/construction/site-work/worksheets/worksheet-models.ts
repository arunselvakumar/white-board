import { z } from "zod";

import type {
  WorksheetActions,
  WorksheetFormOptions,
  WorksheetReadModel,
} from "@/src/site-work/application/worksheet-handlers";
import {
  SHEET_APPROVAL_STATUSES,
  WORK_SHIFTS,
} from "@/src/site-work/domain/shift";
import {
  WORKSHEET_LIMITS,
  WORKSHEET_SECTIONS,
  type LabourPrefill,
} from "@/src/site-work/domain/worksheet";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";
import { LOCATION_TYPES } from "@/src/shared-kernel/location-ref";

export const WORKSHEETS_PATH = "/api/construction/site-work/worksheets";

const approvalStatus = z.enum(SHEET_APPROVAL_STATUSES);
const shift = z.enum(WORK_SHIFTS);
const locationType = z.enum(
  LOCATION_TYPES.map((item) => item.key) as [
    "wing",
    "amenity",
    "common_development",
    "location",
  ],
);
const text = z.string().max(APPROVAL_LIMITS.maxTextLength);
/** A quantity as a decimal string, at most three decimals. */
const quantity = z.string().trim().max(20);
const count = z.int().min(0).max(WORKSHEET_LIMITS.maxCount);

/**
 * Where on the Project the work was done (CM-403 `LocationRef`): a Wing
 * with any Floors and Units, an Amenity, a Common Development, or a
 * Location. Checked against the Project on save.
 */
export const ConstructionSiteWorkWorksheetLocationModel = z.object({
  type: locationType,
  wingId: z.uuid().nullable().optional(),
  floorIds: z.array(z.uuid()).max(200).optional(),
  unitIds: z.array(z.uuid()).max(5000).optional(),
  developmentId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
});

/** The stored LocationRef. */
export const ConstructionSiteWorkWorksheetLocationResponseModel = z.union([
  z.object({
    type: z.literal("wing"),
    wingId: z.uuid(),
    floorIds: z.array(z.uuid()),
    unitIds: z.array(z.uuid()),
  }),
  z.object({
    type: z.enum(["amenity", "common_development"]),
    developmentId: z.uuid(),
  }),
  z.object({ type: z.literal("location"), locationId: z.uuid() }),
]);

const WorksheetBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies. */
  sheetDate: z.iso.date(),
  shift,
  contractorId: z.uuid(),
  departmentId: z.uuid(),
  /** Of the Department; ignored when Work Type is hidden. */
  workTypeId: z.uuid().nullable().optional(),
  /** With Labour shown: whole numbers ≥ 0, at least one above zero. */
  skilledCount: count.nullable().optional(),
  unskilledCount: count.nullable().optional(),
  /** Approx Work Done: > 0, at most three decimals; needs a unit. */
  approxWorkQty: quantity.nullable().optional(),
  approxWorkUnitId: z.uuid().nullable().optional(),
  /** Required when the Location section is shown. */
  siteLocation:
    ConstructionSiteWorkWorksheetLocationModel.nullable().optional(),
  remark: text.nullable().optional(),
  /** Material consumption: each posts Consumed stock at the Project. */
  materials: z
    .array(
      z.object({
        /** A live, enabled Material; name and unit are copied. */
        materialId: z.uuid(),
        /** > 0, at most three decimals, in the material's unit. */
        quantity,
        remark: text.nullable().optional(),
      }),
    )
    .max(WORKSHEET_LIMITS.maxMaterials)
    .default([]),
  /** Save & Approve: needs Approve; only with the Project's approval on. */
  approve: z.boolean().default(false),
});

export const CreateConstructionSiteWorkWorksheetRequestModel =
  WorksheetBody.extend({
    projectId: z.uuid(),
    /** Duplicate: the sheet this one was copied from. */
    duplicatedFromId: z.uuid().nullable().optional(),
  });

export const UpdateConstructionSiteWorkWorksheetRequestModel =
  WorksheetBody.extend({
    /** The sheet's `updatedAt` as last seen; 409 `WORKSHEET_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionSiteWorkWorksheetRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const DecideConstructionSiteWorkWorksheetRequestModel = z.object({
  /** Optional stale check. */
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const RejectConstructionSiteWorkWorksheetRequestModel =
  DecideConstructionSiteWorkWorksheetRequestModel.extend({ reason: text });

export const BulkApproveConstructionSiteWorkWorksheetsRequestModel = z.object({
  projectId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
});

export const BulkRejectConstructionSiteWorkWorksheetsRequestModel =
  BulkApproveConstructionSiteWorkWorksheetsRequestModel.extend({
    reason: text,
  });

export const ConstructionSiteWorkWorksheetParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionSiteWorkWorksheetsRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Sheet Date range, `YYYY-MM-DD`. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** A User id (Filled By). */
    createdBy: z.string().min(1).max(100).optional(),
    contractorId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    approvalStatus: approvalStatus.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionSiteWorkWorksheetFormOptionsRequestModel = z.object(
  {
    projectId: z.uuid(),
  },
);

export const GetConstructionSiteWorkWorksheetAttendanceRequestModel = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
  /** When editing: leave this sheet's own headcounts out. */
  excludeWorksheetId: z.uuid().optional(),
});

export const GetConstructionSiteWorkWorksheetAvailableStockRequestModel =
  z.object({
    projectId: z.uuid(),
    date: z.iso.date(),
    /** Comma-separated Material ids (at most 100). */
    materialIds: z
      .string()
      .min(1)
      .max(4000)
      .transform((value) => value.split(",").map((id) => id.trim()))
      .pipe(z.array(z.uuid()).min(1).max(WORKSHEET_LIMITS.maxMaterials)),
    /** When editing: add this sheet's own consumption back. */
    excludeWorksheetId: z.uuid().optional(),
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionSiteWorkWorksheetActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
  duplicate: z.boolean(),
});

export const ConstructionSiteWorkWorksheetMaterialResponseModel = z.object({
  id: z.uuid(),
  materialId: z.uuid(),
  materialName: z.string(),
  unitName: z.string(),
  /** Decimal string, three decimals. */
  quantity: z.string(),
  remark: z.string().nullable(),
});

export const ConstructionSiteWorkWorksheetResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.string(),
  sheetDate: z.iso.date(),
  shift,
  contractor: named,
  department: named,
  workType: named.nullable(),
  skilledCount: z.int().nullable(),
  unskilledCount: z.int().nullable(),
  approxWorkQty: z.string().nullable(),
  approxWorkUnit: named.nullable(),
  siteLocation: ConstructionSiteWorkWorksheetLocationResponseModel.nullable(),
  remark: z.string().nullable(),
  approvalStatus,
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: person.nullable(),
  rejectionReason: z.string().nullable(),
  duplicatedFromId: z.uuid().nullable(),
  /** Filled By. */
  createdBy: person,
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
  materials: z.array(ConstructionSiteWorkWorksheetMaterialResponseModel),
  /** What the caller may do with it now. */
  actions: ConstructionSiteWorkWorksheetActionsResponseModel,
});

export type ConstructionSiteWorkWorksheetResponseModel = z.infer<
  typeof ConstructionSiteWorkWorksheetResponseModel
>;

export const ListConstructionSiteWorkWorksheetsResponseModel = z.object({
  items: z.array(ConstructionSiteWorkWorksheetResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  /** Options for the filters, from the Project's live sheets. */
  facets: z.object({
    filledBy: z.array(z.object({ userId: z.string(), name: z.string() })),
    contractors: z.array(z.object({ id: z.uuid(), name: z.string() })),
    departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
  }),
});

export type ListConstructionSiteWorkWorksheetsResponseModel = z.infer<
  typeof ListConstructionSiteWorkWorksheetsResponseModel
>;

export const BulkDecideConstructionSiteWorkWorksheetsResponseModel = z.object({
  decided: z.int().nonnegative(),
});

/** A Project's worksheet settings (CM-0016 §2). */
export const ConstructionSiteWorkWorksheetSettingsResponseModel = z.object({
  projectId: z.uuid(),
  showLocation: z.boolean(),
  showWorkType: z.boolean(),
  showApproxWorkDone: z.boolean(),
  showLabour: z.boolean(),
  showMaterials: z.boolean(),
  showRemark: z.boolean(),
  showPhotos: z.boolean(),
  sectionOrder: z.array(z.enum(WORKSHEET_SECTIONS)),
  approvalEnabled: z.boolean(),
  /** Null while the Project uses the defaults; send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime().nullable(),
});

export type ConstructionSiteWorkWorksheetSettingsResponseModel = z.infer<
  typeof ConstructionSiteWorkWorksheetSettingsResponseModel
>;

export const GetConstructionSiteWorkWorksheetFormOptionsResponseModel =
  z.object({
    settings: ConstructionSiteWorkWorksheetSettingsResponseModel,
    /** Active Contractors on the Project, with their enabled Departments. */
    contractors: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        departmentIds: z.array(z.uuid()),
      }),
    ),
    departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** Enabled Work Types of those Departments, with assigned Materials. */
    workTypes: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        departmentId: z.uuid(),
        materialIds: z.array(z.uuid()),
      }),
    ),
    /** Enabled Measurement Units, for Approx Work Done. */
    units: z.array(z.object({ id: z.uuid(), name: z.string() })),
  });

export type GetConstructionSiteWorkWorksheetFormOptionsResponseModel = z.infer<
  typeof GetConstructionSiteWorkWorksheetFormOptionsResponseModel
>;

const headcount = z.object({
  skilled: z.int().nonnegative(),
  unskilled: z.int().nonnegative(),
});

export const GetConstructionSiteWorkWorksheetAttendanceResponseModel = z
  .object({
    date: z.iso.date(),
    /** Labour present or half day, plus vendor full- and half-day heads, by skill. */
    attendance: headcount,
    /** Heads on the Project's other live worksheets that date. */
    onWorksheets: headcount,
    /** attendance − onWorksheets, not below zero: what Use remaining fills. */
    remaining: headcount,
  })
  .meta({
    description:
      "The Project's attendance on a date against the headcounts already on its worksheets (CM-0016 §6). Shown, not enforced.",
  });

export type GetConstructionSiteWorkWorksheetAttendanceResponseModel = z.infer<
  typeof GetConstructionSiteWorkWorksheetAttendanceResponseModel
>;

export const GetConstructionSiteWorkWorksheetAvailableStockResponseModel =
  z.object({
    /** Material id → stock at the Project on that date (decimal string). */
    stock: z.record(z.string(), z.string()),
  });

export type GetConstructionSiteWorkWorksheetAvailableStockResponseModel =
  z.infer<typeof GetConstructionSiteWorkWorksheetAvailableStockResponseModel>;

// Mapping

export function toWorksheetResponse(
  sheet: WorksheetReadModel,
  actions: WorksheetActions,
): ConstructionSiteWorkWorksheetResponseModel {
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    number: sheet.number,
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    contractor: { id: sheet.contractorId, name: sheet.contractorName },
    department: { id: sheet.departmentId, name: sheet.departmentName },
    workType:
      sheet.workTypeId == null
        ? null
        : { id: sheet.workTypeId, name: sheet.workTypeName },
    skilledCount: sheet.skilledCount,
    unskilledCount: sheet.unskilledCount,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnit:
      sheet.approxWorkUnitId == null
        ? null
        : { id: sheet.approxWorkUnitId, name: sheet.approxWorkUnitName },
    siteLocation:
      sheet.siteLocation == null
        ? null
        : (sheet.siteLocation as z.infer<
            typeof ConstructionSiteWorkWorksheetLocationResponseModel
          >),
    remark: sheet.remark,
    approvalStatus: sheet.approval.status,
    decidedAt: sheet.approval.decidedAt?.toISOString() ?? null,
    decidedBy:
      sheet.approval.decidedBy == null
        ? null
        : { userId: sheet.approval.decidedBy, name: sheet.decidedByName },
    rejectionReason: sheet.approval.rejectionReason,
    duplicatedFromId: sheet.duplicatedFromId,
    createdBy: { userId: sheet.createdBy, name: sheet.createdByName },
    createdAt: sheet.createdAt.toISOString(),
    updatedAt: sheet.updatedAt.toISOString(),
    materials: sheet.lines.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      materialName: line.materialName,
      unitName: line.unitName,
      quantity: line.quantity,
      remark: line.remark,
    })),
    actions,
  };
}

export function toWorksheetSettingsResponse(
  projectId: string,
  settings: WorksheetFormOptions["settings"],
): ConstructionSiteWorkWorksheetSettingsResponseModel {
  return {
    projectId,
    showLocation: settings.showLocation,
    showWorkType: settings.showWorkType,
    showApproxWorkDone: settings.showApproxWorkDone,
    showLabour: settings.showLabour,
    showMaterials: settings.showMaterials,
    showRemark: settings.showRemark,
    showPhotos: settings.showPhotos,
    sectionOrder: [...settings.sectionOrder],
    approvalEnabled: settings.approvalEnabled,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

export function toFormOptionsResponse(
  projectId: string,
  options: WorksheetFormOptions,
): GetConstructionSiteWorkWorksheetFormOptionsResponseModel {
  return {
    settings: toWorksheetSettingsResponse(projectId, options.settings),
    contractors: options.contractors,
    departments: options.departments,
    workTypes: options.workTypes,
    units: options.units,
  };
}

export function toAttendanceResponse(
  date: string,
  prefill: LabourPrefill,
): GetConstructionSiteWorkWorksheetAttendanceResponseModel {
  return { date, ...prefill };
}
