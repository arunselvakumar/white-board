import { z } from "zod";

import type { MaterialRequestReadModel } from "@/src/procurement/application/material-request-handlers";
import { DELIVERY_NOTE_STATUSES } from "@/src/procurement/domain/delivery-note";
import { MATERIAL_REQUEST_STATUSES } from "@/src/procurement/domain/material-request";

import {
  ConstructionProcurementStoreOptionResponseModel,
  cursorQuery,
  cursorRefinement,
  exclusiveCursors,
  NamedModel,
  quantityString,
} from "../stores/store-models";

export const MATERIAL_REQUESTS_PATH =
  "/api/construction/procurement/material-requests";

/** A `LocationRef` as sent (CM-403); checked against the Project. */
export const ConstructionProcurementSiteLocationModel = z.object({
  type: z.enum(["wing", "amenity", "common_development", "location"]),
  wingId: z.uuid().nullable().optional(),
  floorIds: z.array(z.uuid()).max(200).nullable().optional(),
  unitIds: z.array(z.uuid()).max(5000).nullable().optional(),
  developmentId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
});

const LineModel = z.object({
  materialId: z.uuid(),
  /** > 0, at most 3 decimals, in the Material's unit. */
  askQty: quantityString,
  remark: z.string().max(1000).nullable().optional(),
});

const requestFields = {
  /** `YYYY-MM-DD`, not after today; back-dated limits of Central Store (MR). */
  requestDate: z.iso.date(),
  /** "Request To": a store serving the Project. */
  storeId: z.uuid(),
  /** Active and on the Project. */
  contractorId: z.uuid().nullable().optional(),
  /** Enabled. */
  departmentId: z.uuid().nullable().optional(),
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  receiverName: z.string().max(400).nullable().optional(),
  remark: z.string().max(1000).nullable().optional(),
  /** 1–200 lines, one per Material. */
  items: z.array(LineModel).max(200),
};

export const CreateConstructionProcurementMaterialRequestRequestModel =
  z.object({
    /** The requesting Project; the member must be on it. */
    projectId: z.uuid(),
    ...requestFields,
  });

export const UpdateConstructionProcurementMaterialRequestRequestModel =
  z.object({
    ...requestFields,
    /** 409 `MATERIAL_REQUEST_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionProcurementMaterialRequestRequestModel =
  z.object({ expectedUpdatedAt: z.iso.datetime() });

export const CloseConstructionProcurementMaterialRequestRequestModel = z.object(
  {
    /** Why the store will not send what is left (≤ 500). */
    reason: z.string().max(1000),
    expectedUpdatedAt: z.iso.datetime(),
  },
);

export const ListConstructionProcurementMaterialRequestsRequestModel = z
  .object({
    /** The Project side: its requests (member on the Project). */
    projectId: z.uuid().optional(),
    /** The store side: one store's requests (Central store read). */
    storeId: z.uuid().optional(),
    status: z.enum(MATERIAL_REQUEST_STATUSES).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Part of the Request ID. */
    search: z.string().max(100).optional(),
    ...cursorQuery,
  })
  .refine(exclusiveCursors, cursorRefinement);

export const ConstructionProcurementMaterialRequestParamsModel = z.object({
  id: z.uuid(),
});

export const GetConstructionProcurementMaterialRequestFormOptionsRequestModel =
  z.object({ projectId: z.uuid() });

// Responses

export const ConstructionProcurementMaterialRequestItemResponseModel = z.object(
  {
    id: z.uuid(),
    position: z.int(),
    materialId: z.uuid(),
    materialName: z.string(),
    uomId: z.uuid(),
    uomName: z.string(),
    askQty: quantityString,
    /** From Delivery Notes marked delivered. */
    deliveredQty: quantityString,
    /** Held by Delivery Notes pending or in transit. */
    inFlightQty: quantityString,
    /** What a new Delivery Note may still send (0 once closed). */
    pendingQty: quantityString,
    remark: z.string().nullable(),
  },
);

export const ConstructionProcurementMaterialRequestResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  projectId: z.uuid(),
  projectName: z.string().nullable(),
  storeId: z.uuid(),
  storeName: z.string().nullable(),
  requestDate: z.iso.date(),
  contractor: NamedModel.nullable(),
  department: NamedModel.nullable(),
  siteLocation: ConstructionProcurementSiteLocationModel.nullable(),
  receiverName: z.string().nullable(),
  remark: z.string().nullable(),
  status: z.enum(MATERIAL_REQUEST_STATUSES),
  closedAt: z.iso.datetime().nullable(),
  closeReason: z.string().nullable(),
  items: z.array(ConstructionProcurementMaterialRequestItemResponseModel),
  deliveryNotes: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      deliveryDate: z.iso.date(),
      status: z.enum(DELIVERY_NOTE_STATUSES),
    }),
  ),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
});
export type ConstructionProcurementMaterialRequestResponseModel = z.infer<
  typeof ConstructionProcurementMaterialRequestResponseModel
>;

export const ListConstructionProcurementMaterialRequestsResponseModel =
  z.object({
    items: z.array(ConstructionProcurementMaterialRequestResponseModel),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.int().nonnegative(),
  });
export type ListConstructionProcurementMaterialRequestsResponseModel = z.infer<
  typeof ListConstructionProcurementMaterialRequestsResponseModel
>;

export const GetConstructionProcurementMaterialRequestFormOptionsResponseModel =
  z.object({
    stores: z.array(ConstructionProcurementStoreOptionResponseModel),
    contractors: z.array(NamedModel),
    departments: z.array(NamedModel),
  });
export type GetConstructionProcurementMaterialRequestFormOptionsResponseModel =
  z.infer<
    typeof GetConstructionProcurementMaterialRequestFormOptionsResponseModel
  >;

export function toMaterialRequestResponse(
  request: MaterialRequestReadModel,
): ConstructionProcurementMaterialRequestResponseModel {
  return {
    id: request.id,
    number: request.number,
    projectId: request.projectId,
    projectName: request.projectName,
    storeId: request.storeId,
    storeName: request.storeName,
    requestDate: request.requestDate,
    contractor: request.contractor,
    department: request.department,
    siteLocation:
      request.siteLocation == null
        ? null
        : (request.siteLocation as z.infer<
            typeof ConstructionProcurementSiteLocationModel
          >),
    receiverName: request.receiverName,
    remark: request.remark,
    status: request.status,
    closedAt: request.closedAt?.toISOString() ?? null,
    closeReason: request.closeReason,
    items: request.items.map((item) => ({ ...item })),
    deliveryNotes: request.deliveryNotes,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}
