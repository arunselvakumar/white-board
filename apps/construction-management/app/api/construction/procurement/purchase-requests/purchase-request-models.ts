import { z } from "zod";

import type {
  PurchaseRequestActions,
  PurchaseRequestDetail,
  PurchaseRequestReadModel,
  QuantityInfo,
} from "@/src/procurement/application/purchase-request-handlers";
import {
  ORDER_STATUSES,
  PURCHASE_REQUEST_LIMITS,
  PURCHASE_REQUEST_SOURCES,
  pendingQuantity,
} from "@/src/procurement/domain/purchase-request";
import {
  APPROVAL_LIMITS,
  APPROVAL_STATUSES,
} from "@/src/shared-kernel/approval";
import { LOCATION_TYPES } from "@/src/shared-kernel/location-ref";

export const PURCHASE_REQUESTS_PATH =
  "/api/construction/procurement/purchase-requests";

const approvalStatus = z.enum(APPROVAL_STATUSES);
const orderStatus = z.enum(ORDER_STATUSES);
const locationType = z.enum(
  LOCATION_TYPES.map((item) => item.key) as [
    "wing",
    "amenity",
    "common_development",
    "location",
  ],
);
/** A quantity as a decimal string, at most three decimals. */
const quantity = z.string().trim().min(1).max(20);
const text = z.string().max(APPROVAL_LIMITS.maxTextLength);

/**
 * A place on the Project (CM-403 `LocationRef`): a Wing with any Floors
 * and Units, an Amenity, a Common Development, or a Location. Checked
 * against the Project on save.
 */
export const ConstructionProcurementSiteLocationModel = z.object({
  type: locationType,
  wingId: z.uuid().nullable().optional(),
  floorIds: z.array(z.uuid()).max(200).optional(),
  unitIds: z.array(z.uuid()).max(5000).optional(),
  developmentId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
});

/** The stored LocationRef. */
export const ConstructionProcurementSiteLocationResponseModel = z.union([
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

const PurchaseRequestBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies. */
  requestDate: z.iso.date(),
  /** On or after the request date. */
  requiredDate: z.iso.date().nullable().optional(),
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  remark: text.nullable().optional(),
  /** "Separate remark for each item": per-line remarks, else `commonRemark`. */
  separateRemarks: z.boolean().default(false),
  commonRemark: text.nullable().optional(),
  items: z
    .array(
      z.object({
        /** A live, enabled Material; name, unit and category are copied. */
        materialId: z.uuid(),
        /** > 0, at most three decimals. */
        quantity,
        remark: text.nullable().optional(),
      }),
    )
    .min(1)
    .max(PURCHASE_REQUEST_LIMITS.maxItems),
  /** Save & Approve: needs Approve on the Project. */
  approve: z.boolean().default(false),
});

export const CreateConstructionProcurementPurchaseRequestRequestModel =
  PurchaseRequestBody.extend({
    projectId: z.uuid(),
    /** `inventory` when raised from Current Inventory (mode B). */
    source: z.enum(PURCHASE_REQUEST_SOURCES).default("manual"),
  });

export const UpdateConstructionProcurementPurchaseRequestRequestModel =
  PurchaseRequestBody.extend({
    /** The request's `updatedAt` as last seen; 409 `PURCHASE_REQUEST_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionProcurementPurchaseRequestRequestModel =
  z.object({
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DecideConstructionProcurementPurchaseRequestRequestModel =
  z.object({
    /** Optional stale check. */
    expectedUpdatedAt: z.iso.datetime().optional(),
  });

export const RejectConstructionProcurementPurchaseRequestRequestModel =
  DecideConstructionProcurementPurchaseRequestRequestModel.extend({
    reason: text,
  });

export const BulkApproveConstructionProcurementPurchaseRequestsRequestModel =
  z.object({
    projectId: z.uuid(),
    ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
  });

export const BulkRejectConstructionProcurementPurchaseRequestsRequestModel =
  BulkApproveConstructionProcurementPurchaseRequestsRequestModel.extend({
    reason: text,
  });

export const ConstructionProcurementPurchaseRequestParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionProcurementPurchaseRequestsRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Request Date range, `YYYY-MM-DD` (the screen's presets resolve to these). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    approvalStatus: approvalStatus.optional(),
    orderStatus: orderStatus.optional(),
    categoryId: z.uuid().optional(),
    materialId: z.uuid().optional(),
    /** A User id (Created By). */
    createdBy: z.string().min(1).max(100).optional(),
    locationType: locationType.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionProcurementPurchaseRequestPdfRequestModel =
  z.object({
    /** `1` opens the PDF inline (print) instead of downloading it. */
    inline: z.enum(["0", "1"]).optional(),
  });

export const GetConstructionProcurementPurchaseRequestQuantityInfoRequestModel =
  z.object({
    projectId: z.uuid(),
    /** Comma-separated Material ids (at most 200). */
    materialIds: z
      .string()
      .min(1)
      .max(8000)
      .transform((value) => value.split(",").map((id) => id.trim()))
      .pipe(z.array(z.uuid()).min(1).max(200)),
    /** When editing: leave this request's own quantities out. */
    excludePurchaseRequestId: z.uuid().optional(),
  });

// Responses

export const ConstructionProcurementPurchaseRequestItemResponseModel = z.object(
  {
    id: z.uuid(),
    materialId: z.uuid(),
    materialName: z.string(),
    categoryId: z.uuid().nullable(),
    categoryName: z.string().nullable(),
    uomId: z.uuid(),
    uomName: z.string(),
    /** Decimal strings, three decimals. */
    quantity: z.string(),
    orderedQty: z.string(),
    /** Requested − ordered, not below zero. */
    pendingQty: z.string(),
    remark: z.string().nullable(),
  },
);

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionProcurementPurchaseRequestActionsResponseModel =
  z.object({
    edit: z.boolean(),
    delete: z.boolean(),
    approve: z.boolean(),
    reject: z.boolean(),
    markOrdered: z.boolean(),
    generateOrder: z.boolean(),
    print: z.boolean(),
  });

export const ConstructionProcurementPurchaseRequestResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.string(),
  requestDate: z.iso.date(),
  requiredDate: z.iso.date().nullable(),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  remark: z.string().nullable(),
  separateRemarks: z.boolean(),
  commonRemark: z.string().nullable(),
  source: z.enum(PURCHASE_REQUEST_SOURCES),
  approvalStatus: approvalStatus,
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: person.nullable(),
  rejectionReason: z.string().nullable(),
  orderStatus: orderStatus,
  markedOrderedAt: z.iso.datetime().nullable(),
  markedOrderedBy: person.nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
  items: z.array(ConstructionProcurementPurchaseRequestItemResponseModel),
  /** What the caller may do with it now. */
  actions: ConstructionProcurementPurchaseRequestActionsResponseModel,
});

export type ConstructionProcurementPurchaseRequestResponseModel = z.infer<
  typeof ConstructionProcurementPurchaseRequestResponseModel
>;

export const GetConstructionProcurementPurchaseRequestResponseModel =
  ConstructionProcurementPurchaseRequestResponseModel.extend({
    /** Live Purchase Orders raised against it. */
    purchaseOrders: z.array(
      z.object({
        id: z.uuid(),
        number: z.string(),
        orderDate: z.iso.date(),
        supplierName: z.string(),
        approvalStatus: approvalStatus,
        /** Paise. */
        grandTotal: z.int(),
      }),
    ),
  });

export type GetConstructionProcurementPurchaseRequestResponseModel = z.infer<
  typeof GetConstructionProcurementPurchaseRequestResponseModel
>;

export const ListConstructionProcurementPurchaseRequestsResponseModel =
  z.object({
    items: z.array(ConstructionProcurementPurchaseRequestResponseModel),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.int().nonnegative(),
    /** Options for the filters, from the Project's live requests. */
    facets: z.object({
      creators: z.array(z.object({ userId: z.string(), name: z.string() })),
      materials: z.array(z.object({ id: z.uuid(), name: z.string() })),
      categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
    }),
  });

export type ListConstructionProcurementPurchaseRequestsResponseModel = z.infer<
  typeof ListConstructionProcurementPurchaseRequestsResponseModel
>;

export const BulkDecideConstructionProcurementPurchaseRequestsResponseModel =
  z.object({ decided: z.int().nonnegative() });

export const GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel =
  z.object({
    items: z.array(
      z.object({
        materialId: z.uuid(),
        /** Stock at the Project now. */
        availableStock: z.string(),
        estimatedQty: z.string().nullable(),
        /** Requested or ordered and not yet received. */
        onTheWay: z.string(),
        /** estimated − (stock + on the way); null without an estimate. */
        balancedEstimatedQty: z.string().nullable(),
      }),
    ),
  });

export type GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel =
  z.infer<
    typeof GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel
  >;

// Mapping

export function toPurchaseRequestResponse(
  pr: PurchaseRequestReadModel,
  actions: PurchaseRequestActions,
): ConstructionProcurementPurchaseRequestResponseModel {
  return {
    id: pr.id,
    projectId: pr.projectId,
    number: pr.number,
    requestDate: pr.requestDate,
    requiredDate: pr.requiredDate,
    siteLocation:
      pr.siteLocation == null
        ? null
        : (pr.siteLocation as z.infer<
            typeof ConstructionProcurementSiteLocationResponseModel
          >),
    remark: pr.remark,
    separateRemarks: pr.separateRemarks,
    commonRemark: pr.commonRemark,
    source: pr.source,
    approvalStatus: pr.approval.status,
    decidedAt: pr.approval.decidedAt?.toISOString() ?? null,
    decidedBy:
      pr.approval.decidedBy == null
        ? null
        : { userId: pr.approval.decidedBy, name: pr.decidedByName },
    rejectionReason: pr.approval.rejectionReason,
    orderStatus: pr.orderStatus,
    markedOrderedAt: pr.markedOrderedAt?.toISOString() ?? null,
    markedOrderedBy:
      pr.markedOrderedBy == null
        ? null
        : { userId: pr.markedOrderedBy, name: pr.markedOrderedByName },
    createdBy: { userId: pr.createdBy, name: pr.createdByName },
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
    items: pr.items.map((item) => ({
      id: item.id,
      materialId: item.materialId,
      materialName: item.materialName,
      categoryId: item.categoryId,
      categoryName:
        item.categoryId == null
          ? null
          : (pr.categoryNames.get(item.categoryId) ?? null),
      uomId: item.uomId,
      uomName: item.uomName,
      quantity: item.quantity,
      orderedQty: item.orderedQty,
      pendingQty: pendingQuantity(item.quantity, item.orderedQty),
      remark: item.remark,
    })),
    actions,
  };
}

export function toPurchaseRequestDetailResponse(
  pr: PurchaseRequestDetail,
  actions: PurchaseRequestActions,
): GetConstructionProcurementPurchaseRequestResponseModel {
  return {
    ...toPurchaseRequestResponse(pr, actions),
    purchaseOrders: pr.purchaseOrders.map((po) => ({
      ...po,
      grandTotal: Number(po.grandTotal),
    })),
  };
}

export function toQuantityInfoResponse(
  items: QuantityInfo[],
): GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel {
  return { items };
}
