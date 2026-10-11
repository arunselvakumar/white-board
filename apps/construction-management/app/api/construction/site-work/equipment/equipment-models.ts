import { z } from "zod";

import {
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type {
  EquipmentActions,
  EquipmentDetail,
  EquipmentReadModel,
  MaintenanceReadModel,
  MovementReadModel,
  SheetOptions,
} from "@/src/site-work/application/equipment-handlers";
import { EQUIPMENT_PHOTO_MAX_BYTES } from "@/src/site-work/application/equipment-photos";
import {
  EQUIPMENT_LIMITS,
  EQUIPMENT_OWNERSHIPS,
  EQUIPMENT_STATES,
  FUEL_TYPES,
  FUEL_UNITS,
  HIRE_BASES,
  TARGET_UNITS,
  UTILISATION_BASES,
  WORKING_TIME_METHODS,
} from "@/src/site-work/domain/equipment";
import {
  EQUIPMENT_MOVEMENT_KINDS,
  MAINTENANCE_KINDS,
} from "@/src/site-work/domain/equipment-lifecycle";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

export const EQUIPMENT_PATH = "/api/construction/site-work/equipment";

const text = z.string().max(APPROVAL_LIMITS.maxTextLength);
const line = z.string().max(EQUIPMENT_LIMITS.text);
/** Paise, a whole number ≥ 0. */
const paise = z.int().min(0).max(EQUIPMENT_LIMITS.maxHireRate);
const decimal = z.string().trim().max(20);
const expectedUpdatedAt = z.iso
  .datetime()
  .describe(
    "The equipment's `updatedAt` as last seen; 409 `EQUIPMENT_CHANGED` when stale.",
  );

const EquipmentBody = z.object({
  /** Company owned or Rented; decides which fields apply. */
  ownership: z.enum(EQUIPMENT_OWNERSHIPS),
  name: z.string().max(EQUIPMENT_LIMITS.name),
  /** Unique among the Company's live equipment, ignoring case. */
  equipmentNumber: z.string().max(EQUIPMENT_LIMITS.number),
  /** Owned only: 1950 to this year. */
  purchaseYear: z.int().nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).nullable().optional(),
  fuelUnit: z.enum(FUEL_UNITS).nullable().optional(),
  utilisationBasis: z.enum(UTILISATION_BASES),
  /** `both` only with `hourly`. */
  workingTimeMethod: z.enum(WORKING_TIME_METHODS),
  /** > 0, at most 2 decimals; needs a `targetUnit` that fits the basis. */
  targetValue: decimal.nullable().optional(),
  /** `hours_per_day` / `days_per_month` (Hourly), `km_per_day` (Km), `trips_per_day` (Trip). */
  targetUnit: z.enum(TARGET_UNITS).nullable().optional(),
  /** 0–100, at most 2 decimals. */
  minUtilisationPct: decimal.nullable().optional(),
  /** Fuel units per hour, km or trip; > 0, at most 3 decimals. */
  expectedFuelEfficiency: decimal.nullable().optional(),
  contactPersonName: line.nullable().optional(),
  contactPersonNumber: z.string().max(40).nullable().optional(),
  companyName: line.nullable().optional(),
  /** Rented only: a live, enabled Contractor of the Company. */
  hirePartyId: z.uuid().nullable().optional(),
  hireBasis: z.enum(HIRE_BASES).nullable().optional(),
  /** Rented only: paise per hire-basis unit. Sending it needs Financial. */
  hireRate: paise.nullable().optional(),
  /** Rented only: idle hours count towards an hourly hire. */
  idleChargeable: z.boolean().default(false),
});

export const CreateConstructionSiteWorkEquipmentRequestModel =
  EquipmentBody.extend({
    /** Where it starts: a Project, or null for the warehouse / off system. */
    projectId: z.uuid().nullable(),
    /** Where on the Project, or which warehouse; defaults to the place's name. */
    locationName: line.nullable().optional(),
    /** The `added` movement's date, `YYYY-MM-DD`, not after today; defaults to today. */
    placedOn: z.iso.date().nullable().optional(),
  }).meta({
    description:
      "Adds equipment to the register. Needs Equipments Create, or Equipment Usage Create on the Project it is added to.",
  });

export const UpdateConstructionSiteWorkEquipmentRequestModel =
  EquipmentBody.extend({
    expectedUpdatedAt,
  }).meta({
    description:
      "Edits the register's fields (Equipments Update). Leave `hireRate` out to keep the stored rate; sending it needs Financial.",
  });

export const DeleteConstructionSiteWorkEquipmentRequestModel = z.object({
  expectedUpdatedAt,
});

export const TransferConstructionSiteWorkEquipmentRequestModel = z
  .object({
    expectedUpdatedAt,
    kind: z.enum(["to_project", "to_warehouse"]),
    /** Required for `to_project`; another live Project. */
    toProjectId: z.uuid().nullable().optional(),
    /** `YYYY-MM-DD`: not after today, not before its last movement or the last usage sheet at the source Project. */
    movementDate: z.iso.date(),
    locationName: line,
    remark: text.nullable().optional(),
  })
  .meta({
    description:
      "Transfer to Project / Transfer to Warehouse (Equipments Transfer); not while in maintenance.",
  });

export const SetConstructionSiteWorkEquipmentAvailabilityRequestModel =
  z.object({
    expectedUpdatedAt,
    /** False: "Mark unavailable for worksheet entry" (since today). */
    available: z.boolean(),
  });

export const OpenConstructionSiteWorkEquipmentMaintenanceRequestModel =
  z.object({
    expectedUpdatedAt,
    kind: z.enum(MAINTENANCE_KINDS),
    /** `YYYY-MM-DD`, not after today. */
    startDate: z.iso.date(),
    description: text.nullable().optional(),
    workshop: line.nullable().optional(),
    /** Paise; sending it needs Financial on Equipments. */
    cost: paise.nullable().optional(),
  });

export const CloseConstructionSiteWorkEquipmentMaintenanceRequestModel =
  z.object({
    expectedUpdatedAt,
    /** `YYYY-MM-DD`: on or after the start, not after today. */
    endDate: z.iso.date(),
    /** The final cost in paise; leave it out to keep the logged one. Needs Financial. */
    cost: paise.nullable().optional(),
    remark: text.nullable().optional(),
  });

export const UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel =
  z.object({
    expectedUpdatedAt,
    kind: z.enum(MAINTENANCE_KINDS),
    startDate: z.iso.date(),
    /** A closed entry keeps one; an open entry has none (use close). */
    endDate: z.iso.date().nullable().optional(),
    description: text.nullable().optional(),
    workshop: line.nullable().optional(),
    /** Paise; leave it out to keep it. Needs Financial. */
    cost: paise.nullable().optional(),
    remark: text.nullable().optional(),
  });

export const DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel =
  z.object({ expectedUpdatedAt });

export const ConstructionSiteWorkEquipmentParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionSiteWorkEquipmentMaintenanceParamsModel = z.object({
  id: z.uuid(),
  maintenanceId: z.uuid(),
});

export const ListConstructionSiteWorkEquipmentRequestModel = z
  .object({
    ownership: z.enum(EQUIPMENT_OWNERSHIPS).optional(),
    /**
     * At this Project now. Allowed with Equipments Read, or Equipment Usage
     * Read on the Project.
     */
    projectId: z.uuid().optional(),
    /** `true`: at the warehouse / off system now. */
    warehouse: z.enum(["true"]).optional(),
    state: z.enum(EQUIPMENT_STATES).optional(),
    /** Name or Equipment Number contains, ignoring case. */
    search: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
  })
  .refine((value) => value.projectId == null || value.warehouse == null, {
    message: "projectId and warehouse are mutually exclusive.",
    path: ["warehouse"],
  });

export const GetConstructionSiteWorkEquipmentSheetOptionsRequestModel =
  z.object({
    projectId: z.uuid(),
    /** The sheet date, `YYYY-MM-DD`. */
    date: z.iso.date(),
  });

export const GetConstructionSiteWorkEquipmentFormOptionsRequestModel = z.object(
  {
    /** The Project a member adds equipment to from its Equipment module. */
    projectId: z.uuid().optional(),
  },
);

export const StartConstructionSiteWorkEquipmentPhotoUploadRequestModel =
  z.object({
    fileName: z.string().min(1).max(255),
    /** At most 5 MB. */
    bytes: z.int().min(1).max(EQUIPMENT_PHOTO_MAX_BYTES),
  });

export const StartConstructionSiteWorkEquipmentPhotoUploadResponseModel =
  startUploadResponseModel();

export const PresignConstructionSiteWorkEquipmentPhotoUploadRequestModel =
  presignUploadRequestModel();

export const PresignConstructionSiteWorkEquipmentPhotoUploadResponseModel =
  presignUploadResponseModel();

export const CompleteConstructionSiteWorkEquipmentPhotoRequestModel = z.object({
  /** The `key` from starting the upload. */
  key: z.string().min(1).max(512),
  fileName: z.string().min(1).max(255),
});

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionSiteWorkEquipmentResponseModel = z
  .object({
    id: z.uuid(),
    ownership: z.enum(EQUIPMENT_OWNERSHIPS),
    name: z.string(),
    equipmentNumber: z.string(),
    purchaseYear: z.int().nullable(),
    fuelType: z.enum(FUEL_TYPES).nullable(),
    fuelUnit: z.enum(FUEL_UNITS).nullable(),
    utilisationBasis: z.enum(UTILISATION_BASES),
    workingTimeMethod: z.enum(WORKING_TIME_METHODS),
    /** Decimal strings. */
    targetValue: z.string().nullable(),
    targetUnit: z.enum(TARGET_UNITS).nullable(),
    minUtilisationPct: z.string().nullable(),
    expectedFuelEfficiency: z.string().nullable(),
    contactPersonName: z.string().nullable(),
    contactPersonNumber: z.string().nullable(),
    companyName: z.string().nullable(),
    /** Rented: the Contractor it is hired from. */
    hireParty: named.nullable(),
    hireBasis: z.enum(HIRE_BASES).nullable(),
    /** Paise; null without Financial (Equipments, or Equipment Usage at its Project). */
    hireRate: z.int().nullable(),
    idleChargeable: z.boolean(),
    /** Image routes; null without a photo. */
    photo: z.object({ url: z.string(), thumbnailUrl: z.string() }).nullable(),
    /** Null at the warehouse / off system. */
    currentProject: named.nullable(),
    currentLocationName: z.string().nullable(),
    state: z.enum(EQUIPMENT_STATES),
    availableForEntry: z.boolean(),
    /** Set while marked unavailable for worksheet entry. */
    unavailableSince: z.iso.date().nullable(),
    openMaintenance: z
      .object({
        id: z.uuid(),
        kind: z.enum(MAINTENANCE_KINDS),
        startDate: z.iso.date(),
      })
      .nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ description: "One machine in the Equipment register." });

export const ConstructionSiteWorkEquipmentMovementResponseModel = z
  .object({
    id: z.uuid(),
    kind: z.enum(EQUIPMENT_MOVEMENT_KINDS),
    movementDate: z.iso.date(),
    /** "Location Before": the place it left; null for the first placement. */
    before: z
      .object({
        project: named.nullable(),
        locationName: z.string().nullable(),
      })
      .nullable(),
    /** "Transfer To Project"; null for the warehouse. */
    toProject: named.nullable(),
    /** "Latest Location". */
    locationName: z.string(),
    remark: z.string().nullable(),
    createdAt: z.iso.datetime(),
    /** "Entry By". */
    createdBy: person,
  })
  .meta({ description: "One row of the Transfer Report." });

export const ConstructionSiteWorkEquipmentMaintenanceResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(MAINTENANCE_KINDS),
  startDate: z.iso.date(),
  /** Null while open (in maintenance). */
  endDate: z.iso.date().nullable(),
  description: z.string().nullable(),
  workshop: z.string().nullable(),
  /** Paise; null without Financial on Equipments. */
  cost: z.int().nullable(),
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: person,
});

export const ConstructionSiteWorkEquipmentActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  transfer: z.boolean(),
  logMaintenance: z.boolean(),
  returnToService: z.boolean(),
  editMaintenance: z.boolean(),
  changeAvailability: z.boolean(),
  changePhoto: z.boolean(),
  /** Hire rates are shown. */
  seeRates: z.boolean(),
  /** Maintenance costs are shown. */
  seeCosts: z.boolean(),
});

export const GetConstructionSiteWorkEquipmentResponseModel =
  ConstructionSiteWorkEquipmentResponseModel.extend({
    createdBy: person,
    /** The Transfer Report, oldest first. */
    movements: z.array(ConstructionSiteWorkEquipmentMovementResponseModel),
    /** The maintenance log, newest first. */
    maintenance: z.array(ConstructionSiteWorkEquipmentMaintenanceResponseModel),
    actions: ConstructionSiteWorkEquipmentActionsResponseModel,
  });

export const ListConstructionSiteWorkEquipmentResponseModel = z.object({
  items: z.array(ConstructionSiteWorkEquipmentResponseModel),
  nextCursor: z.string().nullable(),
  total: z.int(),
});

export const ConstructionSiteWorkEquipmentSheetOptionResponseModel =
  ConstructionSiteWorkEquipmentResponseModel.extend({
    /** The latest live sheet's closing reading on or before the date. */
    lastClosingReading: z
      .object({ reading: z.string(), sheetDate: z.iso.date() })
      .nullable(),
  });

export const GetConstructionSiteWorkEquipmentSheetOptionsResponseModel = z
  .object({
    projectId: z.uuid(),
    date: z.iso.date(),
    /** Equipment that may take a usage sheet at the Project on the date. */
    items: z.array(ConstructionSiteWorkEquipmentSheetOptionResponseModel),
    /** At the Project on the date (or now) but refused, with the reason. */
    blocked: z.array(
      z.object({
        equipment: ConstructionSiteWorkEquipmentResponseModel,
        reason: z.enum([
          "EQUIPMENT_NOT_ON_PROJECT",
          "EQUIPMENT_IN_MAINTENANCE",
          "EQUIPMENT_UNAVAILABLE",
        ]),
      }),
    ),
  })
  .meta({
    description:
      "Equipment Usage sheet options (CM-604): hire rates only with Financial on Equipment Usage at the Project or on Equipments.",
  });

export const GetConstructionSiteWorkEquipmentFormOptionsResponseModel =
  z.object({
    /** Live, enabled Contractors: the hire party picker. */
    hireParties: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** Live Projects: the place and transfer pickers. */
    projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
  });

// Mapping

export type EquipmentResponse = z.infer<
  typeof ConstructionSiteWorkEquipmentResponseModel
>;

/** The version segment of a photo key, so a replaced photo is a new URL. */
function photoVersion(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
}

export function equipmentPhotoPath(id: string): string {
  return `${EQUIPMENT_PATH}/${id}/photo`;
}

export function toEquipmentResponse(
  equipment: EquipmentReadModel,
  seeRates: boolean,
): EquipmentResponse {
  const version =
    equipment.photoKey == null ? null : photoVersion(equipment.photoKey);
  return {
    id: equipment.id,
    ownership: equipment.ownership,
    name: equipment.name,
    equipmentNumber: equipment.equipmentNumber,
    purchaseYear: equipment.purchaseYear,
    fuelType: equipment.fuelType,
    fuelUnit: equipment.fuelUnit,
    utilisationBasis: equipment.utilisationBasis,
    workingTimeMethod: equipment.workingTimeMethod,
    targetValue: equipment.targetValue,
    targetUnit: equipment.targetUnit,
    minUtilisationPct: equipment.minUtilisationPct,
    expectedFuelEfficiency: equipment.expectedFuelEfficiency,
    contactPersonName: equipment.contactPersonName,
    contactPersonNumber: equipment.contactPersonNumber,
    companyName: equipment.companyName,
    hireParty:
      equipment.hirePartyId == null
        ? null
        : { id: equipment.hirePartyId, name: equipment.hirePartyName },
    hireBasis: equipment.hireBasis,
    hireRate:
      seeRates && equipment.hireRate != null
        ? Number(equipment.hireRate)
        : null,
    idleChargeable: equipment.idleChargeable,
    photo:
      version == null
        ? null
        : {
            url: `${equipmentPhotoPath(equipment.id)}?v=${version}`,
            thumbnailUrl: `${equipmentPhotoPath(equipment.id)}/thumbnail?v=${version}`,
          },
    currentProject:
      equipment.currentProjectId == null
        ? null
        : {
            id: equipment.currentProjectId,
            name: equipment.currentProjectName,
          },
    currentLocationName: equipment.currentLocationName,
    state: equipment.state,
    availableForEntry: equipment.availableForEntry,
    unavailableSince: equipment.unavailableSince,
    openMaintenance:
      equipment.openMaintenance == null
        ? null
        : {
            id: equipment.openMaintenance.id,
            kind: equipment.openMaintenance.kind,
            startDate: equipment.openMaintenance.startDate,
          },
    createdAt: equipment.createdAt.toISOString(),
    updatedAt: equipment.updatedAt.toISOString(),
  };
}

function toMovementResponse(
  movement: MovementReadModel,
): z.infer<typeof ConstructionSiteWorkEquipmentMovementResponseModel> {
  return {
    id: movement.id,
    kind: movement.kind,
    movementDate: movement.movementDate,
    before:
      movement.before == null
        ? null
        : {
            project:
              movement.before.projectId == null
                ? null
                : {
                    id: movement.before.projectId,
                    name: movement.before.projectName,
                  },
            locationName: movement.before.locationName,
          },
    toProject:
      movement.toProjectId == null
        ? null
        : { id: movement.toProjectId, name: movement.toProjectName },
    locationName: movement.locationName,
    remark: movement.remark,
    createdAt: movement.createdAt.toISOString(),
    createdBy: { userId: movement.createdBy, name: movement.createdByName },
  };
}

function toMaintenanceResponse(
  entry: MaintenanceReadModel,
  seeCosts: boolean,
): z.infer<typeof ConstructionSiteWorkEquipmentMaintenanceResponseModel> {
  return {
    id: entry.id,
    kind: entry.kind,
    startDate: entry.startDate,
    endDate: entry.endDate,
    description: entry.description,
    workshop: entry.workshop,
    cost: seeCosts && entry.cost != null ? Number(entry.cost) : null,
    remark: entry.remark,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    createdBy: { userId: entry.createdBy, name: entry.createdByName },
  };
}

export function toEquipmentDetailResponse(
  detail: EquipmentDetail,
  actions: EquipmentActions,
): z.infer<typeof GetConstructionSiteWorkEquipmentResponseModel> {
  return {
    ...toEquipmentResponse(detail, actions.seeRates),
    createdBy: { userId: detail.createdBy, name: detail.createdByName },
    movements: detail.movements.map(toMovementResponse),
    maintenance: detail.maintenance.map((entry) =>
      toMaintenanceResponse(entry, actions.seeCosts),
    ),
    actions,
  };
}

export function toSheetOptionsResponse(
  projectId: string,
  date: string,
  options: SheetOptions,
  seeRates: boolean,
): z.infer<typeof GetConstructionSiteWorkEquipmentSheetOptionsResponseModel> {
  return {
    projectId,
    date,
    items: options.items.map((item) => ({
      ...toEquipmentResponse(item, seeRates),
      lastClosingReading: item.lastClosingReading,
    })),
    blocked: options.blocked.map((item) => ({
      equipment: toEquipmentResponse(item.equipment, seeRates),
      reason: item.reason,
    })),
  };
}
