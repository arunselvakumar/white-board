import { z } from "zod";

import type {
  PurchaseOrderActions,
  PurchaseOrderDetail,
  PurchaseOrderReadModel,
} from "@/src/procurement/application/purchase-order-handlers";
import {
  PURCHASE_ORDER_LIMITS,
  purchaseOrderStage,
  RECEIPT_STATUSES,
} from "@/src/procurement/domain/purchase-order";
import type { PurchaseOrderFormOptions } from "@/src/procurement/infrastructure/purchase-order-form-options";
import {
  stockLocation,
  type StockLocation,
} from "@/src/procurement/domain/stock-location";
import {
  APPROVAL_LIMITS,
  APPROVAL_STATUSES,
} from "@/src/shared-kernel/approval";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
} from "../purchase-requests/purchase-request-models";

export const PURCHASE_ORDERS_PATH =
  "/api/construction/procurement/purchase-orders";

const approvalStatus = z.enum(APPROVAL_STATUSES);
const receiptStatus = z.enum(RECEIPT_STATUSES);
const supplyType = z.enum(["intra_state", "inter_state"]);
const text = z.string().max(APPROVAL_LIMITS.maxTextLength);
/** Paise, a whole number ≥ 0. */
const paise = z.int().min(0);
const percent = z.string().trim().min(1).max(8);

/** Exactly one of `projectId` or `storeId`: where the PO is for. */
const placeFields = {
  /** A Project the caller is on. */
  projectId: z.uuid().optional(),
  /** A Central Store (CM-508). */
  storeId: z.uuid().optional(),
};

export function placeOf(input: {
  projectId?: string | undefined;
  storeId?: string | undefined;
}): StockLocation {
  if ((input.projectId == null) === (input.storeId == null))
    throw new DomainError(
      "LOCATION_REQUIRED",
      "Give a projectId or a storeId.",
      {
        details: { field: "projectId" },
      },
    );
  return input.projectId != null
    ? stockLocation("project", input.projectId)
    : stockLocation("store", input.storeId ?? "");
}

const poc = z
  .object({
    name: z
      .string()
      .max(PURCHASE_ORDER_LIMITS.maxNameLength)
      .nullable()
      .optional(),
    /** An Indian mobile. */
    mobile: z.string().max(20).nullable().optional(),
  })
  .nullable()
  .optional();

const PurchaseOrderBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies. */
  orderDate: z.iso.date(),
  /** On or after the PO date; defaults to the PR's Required Date. */
  expectedDeliveryDate: z.iso.date().nullable().optional(),
  /** An approved or partially ordered PR of the Project. */
  purchaseRequestId: z.uuid().nullable().optional(),
  /** An active Supplier assigned to the Project (or Store). */
  supplierId: z.uuid(),
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  /** Overrides the default from the supplier's and place of supply's states. */
  supplyType: supplyType.nullable().optional(),
  /** Defaults to the Company's default billing address. */
  billingAddressId: z.uuid().nullable().optional(),
  supplierPoc: poc,
  sitePoc: poc,
  paymentTermsDays: z
    .int()
    .min(0)
    .max(PURCHASE_ORDER_LIMITS.maxPaymentTermsDays)
    .nullable()
    .optional(),
  /** Terms & Conditions to copy onto the PO. */
  termsIds: z.array(z.uuid()).max(PURCHASE_ORDER_LIMITS.maxTerms).default([]),
  /** "Delivery address is other than the Project address". */
  deliveryAddressDiffers: z.boolean().default(false),
  deliveryAddress: z
    .string()
    .max(PURCHASE_ORDER_LIMITS.maxAddressLength)
    .nullable()
    .optional(),
  /** GST state code of the delivery address (place of supply). */
  deliveryStateCode: z.string().length(2).nullable().optional(),
  remark: text.nullable().optional(),
  additionalCharges: paise.default(0),
  deductionAmount: paise.default(0),
  items: z
    .array(
      z.object({
        materialId: z.uuid(),
        /** The PR item this line orders. */
        purchaseRequestItemId: z.uuid().nullable().optional(),
        /** > 0, at most three decimals. */
        quantity: z.string().trim().min(1).max(20),
        /** Paise per unit. */
        unitRate: paise,
        discount: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal("amount"), paise }),
            z.object({ type: z.literal("percent"), percent }),
          ])
          .nullable()
          .optional(),
        /** Percent, 0–100. */
        gstRate: percent.nullable().optional(),
        /** 4, 6 or 8 digits. */
        hsnCode: z.string().max(8).nullable().optional(),
        remark: text.nullable().optional(),
      }),
    )
    .min(1)
    .max(PURCHASE_ORDER_LIMITS.maxItems),
  /** Save & Approve: needs Approve. */
  approve: z.boolean().default(false),
});

export const CreateConstructionProcurementPurchaseOrderRequestModel =
  PurchaseOrderBody.extend(placeFields);

export const UpdateConstructionProcurementPurchaseOrderRequestModel =
  PurchaseOrderBody.extend({
    /** The PO's `updatedAt` as last seen; 409 `PURCHASE_ORDER_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionProcurementPurchaseOrderRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const DecideConstructionProcurementPurchaseOrderRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const RejectConstructionProcurementPurchaseOrderRequestModel =
  DecideConstructionProcurementPurchaseOrderRequestModel.extend({
    reason: text,
  });

export const CloseConstructionProcurementPurchaseOrderRequestModel =
  DecideConstructionProcurementPurchaseOrderRequestModel.extend({
    reason: text,
  });

export const BulkApproveConstructionProcurementPurchaseOrdersRequestModel =
  z.object({
    ...placeFields,
    ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
  });

export const BulkRejectConstructionProcurementPurchaseOrdersRequestModel =
  BulkApproveConstructionProcurementPurchaseOrdersRequestModel.extend({
    reason: text,
  });

export const ConstructionProcurementPurchaseOrderParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionProcurementPurchaseOrdersRequestModel = z
  .object({
    ...placeFields,
    /** PO Date range. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    approvalStatus: approvalStatus.optional(),
    receiptStatus: receiptStatus.optional(),
    supplierId: z.uuid().optional(),
    purchaseRequestId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionProcurementPurchaseOrderFormOptionsRequestModel =
  z.object(placeFields);

export const GetConstructionProcurementPurchaseOrderPdfRequestModel = z.object({
  inline: z.enum(["0", "1"]).optional(),
});

// Responses (money in paise; Purchase Orders have no Financial flag, so
// amounts are always shown to anyone who may read them)

const totals = z.object({
  subTotal: z.int(),
  discountTotal: z.int(),
  taxableTotal: z.int(),
  cgstTotal: z.int(),
  sgstTotal: z.int(),
  igstTotal: z.int(),
  itemsTotal: z.int(),
  additionalCharges: z.int(),
  deductionAmount: z.int(),
  grandTotal: z.int(),
});

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionProcurementPurchaseOrderItemResponseModel = z.object({
  id: z.uuid(),
  materialId: z.uuid(),
  materialName: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  purchaseRequestItemId: z.uuid().nullable(),
  hsnCode: z.string().nullable(),
  quantity: z.string(),
  unitRate: z.int(),
  discountType: z.enum(["amount", "percent"]).nullable(),
  discountPercent: z.string().nullable(),
  gstRate: z.string(),
  subTotal: z.int(),
  discountAmount: z.int(),
  taxable: z.int(),
  cgst: z.int(),
  sgst: z.int(),
  igst: z.int(),
  total: z.int(),
  remark: z.string().nullable(),
  /** Σ received on Goods Receipts (CM-505). */
  receivedQty: z.string(),
});

export const ConstructionProcurementPurchaseOrderActionsResponseModel =
  z.object({
    edit: z.boolean(),
    delete: z.boolean(),
    approve: z.boolean(),
    reject: z.boolean(),
    markOrdered: z.boolean(),
    close: z.boolean(),
    print: z.boolean(),
  });

export const ConstructionProcurementPurchaseOrderResponseModel = z.object({
  id: z.uuid(),
  locationKind: z.enum(["project", "store"]),
  locationId: z.uuid(),
  number: z.string(),
  orderDate: z.iso.date(),
  expectedDeliveryDate: z.iso.date(),
  purchaseRequest: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable(),
  supplier: z.object({
    id: z.uuid(),
    name: z.string(),
    gstin: z.string().nullable(),
    stateCode: z.string().nullable(),
  }),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  supplyType,
  placeOfSupplyStateCode: z.string().nullable(),
  billing: z.object({
    id: z.uuid(),
    name: z.string(),
    address: z.string(),
    stateCode: z.string().nullable(),
    gstin: z.string().nullable(),
  }),
  supplierPoc: z.object({
    name: z.string().nullable(),
    mobile: z.string().nullable(),
  }),
  sitePoc: z.object({
    name: z.string().nullable(),
    mobile: z.string().nullable(),
  }),
  paymentTermsDays: z.int().nullable(),
  deliveryAddressDiffers: z.boolean(),
  deliveryAddress: z.string().nullable(),
  deliveryStateCode: z.string().nullable(),
  remark: z.string().nullable(),
  totals,
  terms: z.array(
    z.object({
      termsId: z.uuid().nullable(),
      title: z.string(),
      body: z.string(),
    }),
  ),
  approvalStatus,
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: person.nullable(),
  rejectionReason: z.string().nullable(),
  /** pending / approved / rejected, then ordered, then closed. */
  stage: z.enum(["pending", "approved", "rejected", "ordered", "closed"]),
  orderedAt: z.iso.datetime().nullable(),
  orderedBy: person.nullable(),
  receiptStatus,
  closedAt: z.iso.datetime().nullable(),
  closedBy: person.nullable(),
  closeReason: z.string().nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  items: z.array(ConstructionProcurementPurchaseOrderItemResponseModel),
  actions: ConstructionProcurementPurchaseOrderActionsResponseModel,
});

export type ConstructionProcurementPurchaseOrderResponseModel = z.infer<
  typeof ConstructionProcurementPurchaseOrderResponseModel
>;

export const GetConstructionProcurementPurchaseOrderResponseModel =
  ConstructionProcurementPurchaseOrderResponseModel.extend({
    goodsReceipts: z.array(
      z.object({ id: z.uuid(), number: z.string(), receiptDate: z.iso.date() }),
    ),
  });

export type GetConstructionProcurementPurchaseOrderResponseModel = z.infer<
  typeof GetConstructionProcurementPurchaseOrderResponseModel
>;

export const ListConstructionProcurementPurchaseOrdersResponseModel = z.object({
  items: z.array(ConstructionProcurementPurchaseOrderResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  facets: z.object({
    suppliers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  }),
});

export type ListConstructionProcurementPurchaseOrdersResponseModel = z.infer<
  typeof ListConstructionProcurementPurchaseOrdersResponseModel
>;

export const BulkDecideConstructionProcurementPurchaseOrdersResponseModel =
  z.object({
    decided: z.int().nonnegative(),
  });

export const GetConstructionProcurementPurchaseOrderFormOptionsResponseModel =
  z.object({
    location: z.object({
      kind: z.enum(["project", "store"]),
      id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      stateCode: z.string().nullable(),
    }),
    /** Active Suppliers assigned to the Project (or Store). */
    suppliers: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        gstin: z.string().nullable(),
        stateCode: z.string().nullable(),
        mobile: z.string().nullable(),
        contactPerson: z.string().nullable(),
      }),
    ),
    billingAddresses: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        address: z.string(),
        stateCode: z.string(),
        gstin: z.string().nullable(),
        isDefault: z.boolean(),
      }),
    ),
    terms: z.array(
      z.object({ id: z.uuid(), title: z.string(), body: z.string() }),
    ),
    /** Approved or partially ordered PRs of the Project (newest 100), with pending items. */
    purchaseRequests: z.array(
      z.object({
        id: z.uuid(),
        number: z.string(),
        requestDate: z.iso.date(),
        requiredDate: z.iso.date().nullable(),
        items: z.array(
          z.object({
            id: z.uuid(),
            materialId: z.uuid(),
            materialName: z.string(),
            uomName: z.string(),
            quantity: z.string(),
            orderedQty: z.string(),
            pendingQty: z.string(),
          }),
        ),
      }),
    ),
  });

export type GetConstructionProcurementPurchaseOrderFormOptionsResponseModel =
  z.infer<
    typeof GetConstructionProcurementPurchaseOrderFormOptionsResponseModel
  >;

// Mapping

const int = (value: bigint) => Number(value);

export function toPurchaseOrderResponse(
  po: PurchaseOrderReadModel,
  actions: PurchaseOrderActions,
): ConstructionProcurementPurchaseOrderResponseModel {
  const person = (userId: string | null, name: string | null) =>
    userId == null ? null : { userId, name };
  return {
    id: po.id,
    locationKind: po.location.kind,
    locationId: po.location.id,
    number: po.number,
    orderDate: po.orderDate,
    expectedDeliveryDate: po.expectedDeliveryDate,
    purchaseRequest:
      po.purchaseRequestId == null
        ? null
        : { id: po.purchaseRequestId, number: po.purchaseRequestNumber },
    supplier: {
      id: po.supplierId,
      name: po.supplierName,
      gstin: po.supplierGstin,
      stateCode: po.supplierStateCode,
    },
    siteLocation:
      po.siteLocation == null
        ? null
        : (po.siteLocation as z.infer<
            typeof ConstructionProcurementSiteLocationResponseModel
          >),
    supplyType: po.supplyType,
    placeOfSupplyStateCode: po.placeOfSupplyStateCode,
    billing: {
      id: po.billingAddressId,
      name: po.billingName,
      address: po.billingAddress,
      stateCode: po.billingStateCode,
      gstin: po.billingGstin,
    },
    supplierPoc: { name: po.supplierPocName, mobile: po.supplierPocMobile },
    sitePoc: { name: po.sitePocName, mobile: po.sitePocMobile },
    paymentTermsDays: po.paymentTermsDays,
    deliveryAddressDiffers: po.deliveryAddressDiffers,
    deliveryAddress: po.deliveryAddress,
    deliveryStateCode: po.deliveryStateCode,
    remark: po.remark,
    totals: {
      subTotal: int(po.totals.subTotal),
      discountTotal: int(po.totals.discountTotal),
      taxableTotal: int(po.totals.taxableTotal),
      cgstTotal: int(po.totals.cgstTotal),
      sgstTotal: int(po.totals.sgstTotal),
      igstTotal: int(po.totals.igstTotal),
      itemsTotal: int(po.totals.itemsTotal),
      additionalCharges: int(po.totals.additionalCharges),
      deductionAmount: int(po.totals.deductionAmount),
      grandTotal: int(po.totals.grandTotal),
    },
    terms: po.terms,
    approvalStatus: po.approval.status,
    decidedAt: po.approval.decidedAt?.toISOString() ?? null,
    decidedBy: person(po.approval.decidedBy, po.decidedByName),
    rejectionReason: po.approval.rejectionReason,
    stage: purchaseOrderStage({
      approvalStatus: po.approval.status,
      orderedAt: po.orderedAt,
      closedAt: po.closedAt,
      receiptStatus: po.receiptStatus,
    }),
    orderedAt: po.orderedAt?.toISOString() ?? null,
    orderedBy: person(po.orderedBy, po.orderedByName),
    receiptStatus: po.receiptStatus,
    closedAt: po.closedAt?.toISOString() ?? null,
    closedBy: person(po.closedBy, po.closedByName),
    closeReason: po.closeReason,
    createdBy: { userId: po.createdBy, name: po.createdByName },
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    items: po.items.map((item) => ({
      id: item.id,
      materialId: item.materialId,
      materialName: item.materialName,
      uomId: item.uomId,
      uomName: item.uomName,
      purchaseRequestItemId: item.purchaseRequestItemId,
      hsnCode: item.hsnCode,
      quantity: item.quantity,
      unitRate: int(item.unitRate),
      discountType: item.discountType,
      discountPercent: item.discountPercent,
      gstRate: item.gstRate,
      subTotal: int(item.subTotal),
      discountAmount: int(item.discountAmount),
      taxable: int(item.taxable),
      cgst: int(item.cgst),
      sgst: int(item.sgst),
      igst: int(item.igst),
      total: int(item.total),
      remark: item.remark,
      receivedQty: item.receivedQty,
    })),
    actions,
  };
}

export function toPurchaseOrderDetailResponse(
  po: PurchaseOrderDetail,
  actions: PurchaseOrderActions,
): GetConstructionProcurementPurchaseOrderResponseModel {
  return {
    ...toPurchaseOrderResponse(po, actions),
    goodsReceipts: po.goodsReceipts,
  };
}

export function toFormOptionsResponse(
  location: GetConstructionProcurementPurchaseOrderFormOptionsResponseModel["location"],
  options: PurchaseOrderFormOptions,
): GetConstructionProcurementPurchaseOrderFormOptionsResponseModel {
  return { location, ...options };
}
