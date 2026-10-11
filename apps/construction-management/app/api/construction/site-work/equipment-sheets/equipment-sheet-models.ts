import { z } from "zod";

import type {
  EquipmentSheetActions,
  EquipmentSheetDetail,
  EquipmentSheetFormOptions,
  EquipmentSheetReadModel,
} from "@/src/site-work/application/equipment-sheet-handlers";
import {
  EQUIPMENT_LIMITS,
  EQUIPMENT_OWNERSHIPS,
  FUEL_UNITS,
  HIRE_BASES,
  UTILISATION_BASES,
  WORKING_TIME_METHODS,
} from "@/src/site-work/domain/equipment";
import {
  decimalText,
  EQUIPMENT_SHEET_LIMITS,
  FUEL_BORNE_BY,
  meterGap,
  shiftCentiHours,
} from "@/src/site-work/domain/equipment-usage";
import {
  SHEET_APPROVAL_STATUSES,
  WORK_SHIFTS,
} from "@/src/site-work/domain/shift";
import { WORKSHEET_LIMITS } from "@/src/site-work/domain/worksheet";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

import {
  ConstructionSiteWorkWorksheetLocationModel,
  ConstructionSiteWorkWorksheetLocationResponseModel,
} from "../worksheets/worksheet-models";

export const EQUIPMENT_SHEETS_PATH =
  "/api/construction/site-work/equipment-sheets";

const approvalStatus = z.enum(SHEET_APPROVAL_STATUSES);
const shift = z.enum(WORK_SHIFTS);
const text = z.string().max(APPROVAL_LIMITS.maxTextLength);
/** A decimal as a string; the rules check its scale. */
const decimal = z.string().trim().max(20);
const userId = z.string().min(1).max(100);

const EquipmentSheetBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies. */
  sheetDate: z.iso.date(),
  /** One sheet per equipment, date and shift. */
  shift,
  /** Free text, ≤ 120 (operators often do not log in). */
  operatorName: z
    .string()
    .max(EQUIPMENT_SHEET_LIMITS.operator)
    .nullable()
    .optional(),
  /** A Team Member on the Project, or the Owner. */
  supervisorUserId: userId.nullable().optional(),
  /** Optional; on the Project when given. */
  contractorId: z.uuid().nullable().optional(),
  /** Optional; one of the Contractor's Departments (needs the Contractor). */
  departmentId: z.uuid().nullable().optional(),
  /** Free text, ≤ 200. */
  workItem: z
    .string()
    .max(EQUIPMENT_SHEET_LIMITS.workItem)
    .nullable()
    .optional(),
  siteLocation:
    ConstructionSiteWorkWorksheetLocationModel.nullable().optional(),
  /** Time Shifts and Both: `HH:MM`; an end before the start crosses midnight; no overlaps. */
  timeShifts: z
    .array(
      z.object({ startTime: z.string().max(5), endTime: z.string().max(5) }),
    )
    .max(EQUIPMENT_SHEET_LIMITS.maxTimeShifts)
    .default([]),
  /** Meter Reading and Both (with meter readings shown): closing ≥ opening, two decimals. */
  openingReading: decimal.nullable().optional(),
  closingReading: decimal.nullable().optional(),
  /** Hourly with the Meter Reading method while meter readings are hidden. */
  usageHours: decimal.nullable().optional(),
  /** Km without a meter reading. */
  distanceKm: decimal.nullable().optional(),
  /** Trip basis. */
  trips: z
    .int()
    .min(0)
    .max(EQUIPMENT_SHEET_LIMITS.maxTrips)
    .nullable()
    .optional(),
  /** Hours, two decimals; usage (Hourly) + idle + breakdown ≤ 24. */
  idleHours: decimal.nullable().optional(),
  breakdownHours: decimal.nullable().optional(),
  approxWorkQty: decimal.nullable().optional(),
  approxWorkUnitId: z.uuid().nullable().optional(),
  /** In the equipment's fuel unit, three decimals; recorded only. */
  fuelQty: decimal.nullable().optional(),
  /** Needed with fuel on rented equipment; owned is always the Company. */
  fuelBorneBy: z.enum(FUEL_BORNE_BY).nullable().optional(),
  /** Rented, Financial only (403 otherwise): paise; null = the hire rate. */
  unitRate: z
    .int()
    .min(0)
    .max(EQUIPMENT_LIMITS.maxHireRate)
    .nullable()
    .optional(),
  /** Rented, Financial only: the billable quantity override; null = the default. */
  billableQty: decimal.nullable().optional(),
  remark: text.nullable().optional(),
  /** Material consumption: each posts Consumed stock at the Project. */
  materials: z
    .array(
      z.object({
        materialId: z.uuid(),
        quantity: decimal,
        remark: text.nullable().optional(),
      }),
    )
    .max(WORKSHEET_LIMITS.maxMaterials)
    .default([]),
  /** Save & Approve: needs Approve; only with the Project's approval on. */
  approve: z.boolean().default(false),
});

export const CreateConstructionSiteWorkEquipmentSheetRequestModel =
  EquipmentSheetBody.extend({
    projectId: z.uuid(),
    /** Equipment that may take a sheet at the Project on that date. */
    equipmentId: z.uuid(),
    /** Duplicate: the sheet this one was copied from. */
    duplicatedFromId: z.uuid().nullable().optional(),
  });

export const UpdateConstructionSiteWorkEquipmentSheetRequestModel =
  EquipmentSheetBody.extend({
    /** The sheet's `updatedAt` as last seen; 409 `EQUIPMENT_SHEET_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionSiteWorkEquipmentSheetRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const DecideConstructionSiteWorkEquipmentSheetRequestModel = z.object({
  /** Optional stale check. */
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const RejectConstructionSiteWorkEquipmentSheetRequestModel =
  DecideConstructionSiteWorkEquipmentSheetRequestModel.extend({
    reason: text,
  });

export const BulkApproveConstructionSiteWorkEquipmentSheetsRequestModel =
  z.object({
    projectId: z.uuid(),
    ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
  });

export const BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel =
  BulkApproveConstructionSiteWorkEquipmentSheetsRequestModel.extend({
    reason: text,
  });

export const ConstructionSiteWorkEquipmentSheetParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionSiteWorkEquipmentSheetsRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Sheet Date range, `YYYY-MM-DD`. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    equipmentId: z.uuid().optional(),
    ownership: z.enum(EQUIPMENT_OWNERSHIPS).optional(),
    /** A User id (Filled By). */
    createdBy: userId.optional(),
    approvalStatus: approvalStatus.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionSiteWorkEquipmentSheetFormOptionsRequestModel =
  z.object({ projectId: z.uuid() });

export const GetConstructionSiteWorkEquipmentSheetAvailableStockRequestModel =
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
    excludeSheetId: z.uuid().optional(),
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionSiteWorkEquipmentSheetActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
  duplicate: z.boolean(),
});

export const ConstructionSiteWorkEquipmentSheetResponseModel = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    number: z.string(),
    sheetDate: z.iso.date(),
    shift,
    equipment: z.object({
      id: z.uuid(),
      name: z.string(),
      equipmentNumber: z.string(),
      fuelUnit: z.enum(FUEL_UNITS).nullable(),
      /** Fuel units per hour, km or trip. */
      expectedFuelEfficiency: z.string().nullable(),
      hireParty: named.nullable(),
      hireBasis: z.enum(HIRE_BASES).nullable(),
      /** Paise; null without Financial. */
      hireRate: z.int().nullable(),
      idleChargeable: z.boolean(),
    }),
    /** Copied from the equipment when the sheet was saved. */
    ownership: z.enum(EQUIPMENT_OWNERSHIPS),
    utilisationBasis: z.enum(UTILISATION_BASES),
    workingTimeMethod: z.enum(WORKING_TIME_METHODS),
    operatorName: z.string().nullable(),
    supervisor: person.nullable(),
    contractor: named.nullable(),
    department: named.nullable(),
    workItem: z.string().nullable(),
    siteLocation: ConstructionSiteWorkWorksheetLocationResponseModel.nullable(),
    timeShifts: z.array(
      z.object({
        startTime: z.string(),
        endTime: z.string(),
        minutes: z.int(),
      }),
    ),
    /** Σ time shift hours (two decimals); null without the time shift method. */
    shiftHours: z.string().nullable(),
    openingReading: z.string().nullable(),
    closingReading: z.string().nullable(),
    /** closing − opening. */
    meterDelta: z.string().nullable(),
    /** Hourly only. */
    usageHours: z.string().nullable(),
    /** Km only. */
    distanceKm: z.string().nullable(),
    /** Trip only. */
    trips: z.int().nullable(),
    idleHours: z.string(),
    breakdownHours: z.string(),
    approxWorkQty: z.string().nullable(),
    approxWorkUnit: named.nullable(),
    fuelQty: z.string().nullable(),
    fuelBorneBy: z.enum(FUEL_BORNE_BY).nullable(),
    fuelOverrun: z.boolean(),
    /** Rented, with Financial: paise per billable unit. */
    unitRate: z.int().nullable(),
    /** Rented, with Financial: three decimals. */
    billableQty: z.string().nullable(),
    /** Rented, with Financial: paise. */
    hireCost: z.int().nullable(),
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
    materials: z.array(
      z.object({
        id: z.uuid(),
        materialId: z.uuid(),
        materialName: z.string(),
        unitName: z.string(),
        quantity: z.string(),
        remark: z.string().nullable(),
      }),
    ),
    actions: ConstructionSiteWorkEquipmentSheetActionsResponseModel,
  })
  .meta({
    description:
      "An Equipment Usage sheet (CM-604). Unit rate, billable quantity, hire cost and the hire rate are null without Financial on Equipment Usage.",
  });

export type ConstructionSiteWorkEquipmentSheetResponseModel = z.infer<
  typeof ConstructionSiteWorkEquipmentSheetResponseModel
>;

export const GetConstructionSiteWorkEquipmentSheetResponseModel =
  ConstructionSiteWorkEquipmentSheetResponseModel.extend({
    /** The equipment's previous closing reading (an earlier date or shift). */
    previousClosing: z
      .object({ reading: z.string(), sheetDate: z.iso.date() })
      .nullable(),
    /** opening − the previous closing; a warning when not 0. */
    meterGap: z.string().nullable(),
  });

export type GetConstructionSiteWorkEquipmentSheetResponseModel = z.infer<
  typeof GetConstructionSiteWorkEquipmentSheetResponseModel
>;

export const ListConstructionSiteWorkEquipmentSheetsResponseModel = z.object({
  items: z.array(ConstructionSiteWorkEquipmentSheetResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  /** Sums over every sheet the filters match. */
  totals: z.object({
    usageHours: z.string(),
    distanceKm: z.string(),
    trips: z.int(),
    idleHours: z.string(),
    breakdownHours: z.string(),
  }),
  /** Options for the filters, from the Project's live sheets. */
  facets: z.object({
    filledBy: z.array(z.object({ userId: z.string(), name: z.string() })),
    equipment: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        equipmentNumber: z.string(),
      }),
    ),
  }),
});

export type ListConstructionSiteWorkEquipmentSheetsResponseModel = z.infer<
  typeof ListConstructionSiteWorkEquipmentSheetsResponseModel
>;

export const BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel =
  z.object({ decided: z.int().nonnegative() });

/** A Project's equipment-sheet settings (CM-0016 §2). */
export const ConstructionSiteWorkEquipmentSheetSettingsResponseModel = z.object(
  {
    projectId: z.uuid(),
    showOperator: z.boolean(),
    showSupervisor: z.boolean(),
    showLocation: z.boolean(),
    showApproxWorkDone: z.boolean(),
    showBillableQty: z.boolean(),
    showFuel: z.boolean(),
    showRemarks: z.boolean(),
    showFiles: z.boolean(),
    showMaterials: z.boolean(),
    showMeterReadings: z.boolean(),
    showBreakdownHours: z.boolean(),
    approvalEnabled: z.boolean(),
    /** Null while the Project uses the defaults; send back as `expectedUpdatedAt`. */
    updatedAt: z.iso.datetime().nullable(),
  },
);

export type ConstructionSiteWorkEquipmentSheetSettingsResponseModel = z.infer<
  typeof ConstructionSiteWorkEquipmentSheetSettingsResponseModel
>;

export const GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel = z
  .object({
    settings: ConstructionSiteWorkEquipmentSheetSettingsResponseModel,
    /** Active Team Members on the Project, and the Owner. */
    supervisors: z.array(z.object({ userId: z.string(), name: z.string() })),
    /** Active Contractors on the Project, with their enabled Departments. */
    contractors: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        departmentIds: z.array(z.uuid()),
      }),
    ),
    departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
    units: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .meta({
    description:
      "What the usage-sheet form offers besides the equipment, which comes from GET /api/construction/site-work/equipment/sheet-options.",
  });

export type GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel =
  z.infer<typeof GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel>;

export const GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel =
  z.object({
    /** Material id → stock at the Project on that date (decimal string). */
    stock: z.record(z.string(), z.string()),
  });

// Mapping

const money = (value: bigint | null, financial: boolean) =>
  financial && value != null ? Number(value) : null;

function centi(value: string | null): number | null {
  return value == null ? null : Math.round(Number(value) * 100);
}

export function toEquipmentSheetResponse(
  sheet: EquipmentSheetReadModel,
  actions: EquipmentSheetActions,
  financial: boolean,
): ConstructionSiteWorkEquipmentSheetResponseModel {
  const opening = centi(sheet.openingReading);
  const closing = centi(sheet.closingReading);
  const usesShifts =
    sheet.workingTimeMethod === "time_shifts" ||
    sheet.workingTimeMethod === "both";
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    number: sheet.number,
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    equipment: {
      id: sheet.equipment.id,
      name: sheet.equipment.name,
      equipmentNumber: sheet.equipment.equipmentNumber,
      fuelUnit: sheet.equipment.fuelUnit,
      expectedFuelEfficiency: sheet.equipment.expectedFuelEfficiency,
      hireParty:
        sheet.equipment.hirePartyId == null
          ? null
          : {
              id: sheet.equipment.hirePartyId,
              name: sheet.equipment.hirePartyName,
            },
      hireBasis: sheet.equipment.hireBasis,
      hireRate: money(sheet.equipment.hireRate, financial),
      idleChargeable: sheet.equipment.idleChargeable,
    },
    ownership: sheet.ownership,
    utilisationBasis: sheet.utilisationBasis,
    workingTimeMethod: sheet.workingTimeMethod,
    operatorName: sheet.operatorName,
    supervisor:
      sheet.supervisorUserId == null
        ? null
        : { userId: sheet.supervisorUserId, name: sheet.supervisorName },
    contractor:
      sheet.contractorId == null
        ? null
        : { id: sheet.contractorId, name: sheet.contractorName },
    department:
      sheet.departmentId == null
        ? null
        : { id: sheet.departmentId, name: sheet.departmentName },
    workItem: sheet.workItem,
    siteLocation:
      sheet.siteLocation == null
        ? null
        : (sheet.siteLocation as z.infer<
            typeof ConstructionSiteWorkWorksheetLocationResponseModel
          >),
    timeShifts: sheet.timeShifts.map(({ startTime, endTime, minutes }) => ({
      startTime,
      endTime,
      minutes,
    })),
    shiftHours: usesShifts
      ? decimalText(shiftCentiHours(sheet.timeShifts), 2)
      : null,
    openingReading: sheet.openingReading,
    closingReading: sheet.closingReading,
    meterDelta:
      opening == null || closing == null
        ? null
        : decimalText(closing - opening, 2),
    usageHours: sheet.usageHours,
    distanceKm: sheet.distanceKm,
    trips: sheet.trips,
    idleHours: sheet.idleHours,
    breakdownHours: sheet.breakdownHours,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnit:
      sheet.approxWorkUnitId == null
        ? null
        : { id: sheet.approxWorkUnitId, name: sheet.approxWorkUnitName },
    fuelQty: sheet.fuelQty,
    fuelBorneBy: sheet.fuelBorneBy,
    fuelOverrun: sheet.fuelOverrun,
    unitRate: money(sheet.unitRate, financial),
    billableQty: financial ? sheet.billableQty : null,
    hireCost: money(sheet.hireCost, financial),
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

export function toEquipmentSheetDetailResponse(
  sheet: EquipmentSheetDetail,
  actions: EquipmentSheetActions,
  financial: boolean,
): GetConstructionSiteWorkEquipmentSheetResponseModel {
  const opening = centi(sheet.openingReading);
  const gap =
    opening == null
      ? null
      : meterGap(opening, centi(sheet.previousClosing?.reading ?? null));
  return {
    ...toEquipmentSheetResponse(sheet, actions, financial),
    previousClosing: sheet.previousClosing,
    meterGap: gap == null ? null : decimalText(gap, 2),
  };
}

export function toEquipmentSheetSettingsResponse(
  projectId: string,
  settings: EquipmentSheetFormOptions["settings"],
): ConstructionSiteWorkEquipmentSheetSettingsResponseModel {
  return {
    projectId,
    showOperator: settings.showOperator,
    showSupervisor: settings.showSupervisor,
    showLocation: settings.showLocation,
    showApproxWorkDone: settings.showApproxWorkDone,
    showBillableQty: settings.showBillableQty,
    showFuel: settings.showFuel,
    showRemarks: settings.showRemarks,
    showFiles: settings.showFiles,
    showMaterials: settings.showMaterials,
    showMeterReadings: settings.showMeterReadings,
    showBreakdownHours: settings.showBreakdownHours,
    approvalEnabled: settings.approvalEnabled,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

export function toEquipmentSheetFormOptionsResponse(
  projectId: string,
  options: EquipmentSheetFormOptions,
): GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel {
  return {
    settings: toEquipmentSheetSettingsResponse(projectId, options.settings),
    supervisors: options.supervisors,
    contractors: options.contractors,
    departments: options.departments,
    units: options.units,
  };
}
