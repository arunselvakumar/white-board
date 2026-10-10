import { z } from "zod";

import type {
  GoodsReceiptFormOptions,
  GoodsReceiptListRow,
  GoodsReceiptView,
  OrderFacts,
} from "@/src/procurement/application/goods-receipt-handlers";
import {
  addQuantities,
  excessQuantity,
  GRN_OPTIONAL_FIELDS,
  netUnitRate,
  type GrnOptionalField,
} from "@/src/procurement/domain/goods-receipt";

export const GOODS_RECEIPTS_PATH =
  "/api/construction/procurement/goods-receipts";

const locationKind = z.enum(["project", "store"]);
const supplyType = z.enum(["intra_state", "inter_state"]);
const receiptStatus = z.enum([
  "not_received",
  "partially_received",
  "received",
]);
const grnField = z.enum(GRN_OPTIONAL_FIELDS);
/** Decimal string, at most three decimals. */
const quantity = z
  .string()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "A quantity has at most three decimals.");
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "A percent has at most two decimals.");
/** Paise; checked to stay a safe integer. */
const paise = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const ref = z.object({ id: z.uuid(), number: z.string() });

function money(value: bigint, financial: boolean): number | null {
  return financial ? Number(value) : null;
}

// Requests

const lineFields = z.object({
  /** The stored line this one keeps (edit); omit on a new line. */
  id: z.uuid().nullable().optional(),
  /** A line of the linked PO (required when a PO is linked). */
  purchaseOrderItemId: z.uuid().nullable().optional(),
  /** A Material (required without a PO). */
  materialId: z.uuid().nullable().optional(),
  /** Received now, > 0. */
  quantity,
  /** Paise per unit; ignored without Financial (the PO's net rate, else the Material's, else 0). */
  unitRate: paise.nullable().optional(),
  /** GST percent; ignored without Financial. */
  gstRate: percent.nullable().optional(),
  /** 4–8 digits; defaults from the PO line or the Material. */
  hsnCode: z.string().max(20).nullable().optional(),
});

const textField = z.string().max(200).nullable().optional();

const receiptFields = {
  /** GR Date, `YYYY-MM-DD`, not after today. */
  receiptDate: z.iso.date(),
  /** The stock date, not before the GR Date and not after today. */
  inventoryDate: z.iso.date(),
  /** An active Supplier on the Project or Store. */
  supplierId: z.uuid(),
  /** Approved, ordered or partially received; same supplier and location. */
  purchaseOrderId: z.uuid().nullable().optional(),
  /** Defaults from the PO, else supplier state vs location state. */
  supplyType: supplyType.nullable().optional(),
  invoiceNo: textField,
  invoiceDate: z.iso.date().nullable().optional(),
  /** Paise; ignored without Financial. */
  invoiceAmount: paise.nullable().optional(),
  deliveryChallanNo: textField,
  grnDcNo: textField,
  vehicleNo: textField,
  driverName: textField,
  /** A 10-digit Indian mobile; stored as E.164. */
  driverMobile: z.string().max(40).nullable().optional(),
  /** 12 digits. */
  ewayBillNo: z.string().max(40).nullable().optional(),
  remark: z.string().max(2000).nullable().optional(),
  lines: z.array(lineFields).max(200),
};

export const PostConstructionProcurementGoodsReceiptRequestModel = z.object({
  locationKind,
  /** A Project, or a Store (CM-508). */
  locationId: z.uuid(),
  ...receiptFields,
});
export type PostConstructionProcurementGoodsReceiptRequestModel = z.infer<
  typeof PostConstructionProcurementGoodsReceiptRequestModel
>;

export const UpdateConstructionProcurementGoodsReceiptRequestModel = z.object({
  ...receiptFields,
  /** The GRN's `updatedAt` as loaded; 409 `GOODS_RECEIPT_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});
export type UpdateConstructionProcurementGoodsReceiptRequestModel = z.infer<
  typeof UpdateConstructionProcurementGoodsReceiptRequestModel
>;

export const DeleteConstructionProcurementGoodsReceiptRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionProcurementGoodsReceiptParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionProcurementGoodsReceiptsRequestModel = z
  .object({
    locationKind,
    locationId: z.uuid(),
    /** GR Date from, inclusive. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    supplierId: z.uuid().optional(),
    purchaseOrderId: z.uuid().optional(),
    /** `with`: against a PO; `without`: no PO. */
    purchaseOrder: z.enum(["with", "without"]).optional(),
    /** GRN number, invoice no, delivery challan no or GRN/DC no. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionProcurementGoodsReceiptFormOptionsRequestModel =
  z.object({
    locationKind,
    locationId: z.uuid(),
    /** The GRN being edited: its PO and supplier stay offered. */
    goodsReceiptId: z.uuid().optional(),
  });

// Responses (money is paise; null without Financial)

export const ConstructionProcurementGoodsReceiptLineResponseModel = z.object({
  id: z.uuid(),
  purchaseOrderItemId: z.uuid().nullable(),
  position: z.int(),
  materialId: z.uuid(),
  materialName: z.string(),
  uomName: z.string(),
  hsnCode: z.string().nullable(),
  /** Received on this GRN. */
  receivedQty: z.string(),
  /** The PO line's quantity; null without a PO line. */
  orderedQty: z.string().nullable(),
  /** Received on other GRNs against the PO line. */
  receivedElsewhereQty: z.string().nullable(),
  /** Received in all against the PO line, this GRN included. */
  totalReceivedQty: z.string().nullable(),
  /** "Excess received": beyond the ordered quantity. */
  excessQty: z.string().nullable(),
  unitRate: z.int().nullable(),
  gstRate: z.string(),
  taxable: z.int().nullable(),
  cgst: z.int().nullable(),
  sgst: z.int().nullable(),
  igst: z.int().nullable(),
  total: z.int().nullable(),
});

export const ConstructionProcurementGoodsReceiptResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  locationKind,
  locationId: z.uuid(),
  locationName: z.string().nullable(),
  receiptDate: z.iso.date(),
  inventoryDate: z.iso.date(),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  purchaseOrder: ref.nullable(),
  supplyType,
  /** Hidden fields are null and listed in `hiddenFields`. */
  invoiceNo: z.string().nullable(),
  invoiceDate: z.iso.date().nullable(),
  invoiceAmount: z.int().nullable(),
  deliveryChallanNo: z.string().nullable(),
  grnDcNo: z.string().nullable(),
  vehicleNo: z.string().nullable(),
  driverName: z.string().nullable(),
  driverMobile: z.string().nullable(),
  ewayBillNo: z.string().nullable(),
  remark: z.string().nullable(),
  taxableTotal: z.int().nullable(),
  cgstTotal: z.int().nullable(),
  sgstTotal: z.int().nullable(),
  igstTotal: z.int().nullable(),
  /** Σ line totals including GST: the GRN value. */
  totalValue: z.int().nullable(),
  lines: z.array(ConstructionProcurementGoodsReceiptLineResponseModel),
  /** The Company's hidden GRN fields (Settings → GRN fields). */
  hiddenFields: z.array(grnField),
  /** Amounts are visible (Financial on Material Received). */
  financial: z.boolean(),
  /** A supplier payment points at it: no edit or delete (M7). */
  paid: z.boolean(),
  createdBy: z.object({ id: z.string(), name: z.string().nullable() }),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
});
export type ConstructionProcurementGoodsReceiptResponseModel = z.infer<
  typeof ConstructionProcurementGoodsReceiptResponseModel
>;

export const ConstructionProcurementGoodsReceiptListItemResponseModel =
  z.object({
    id: z.uuid(),
    number: z.string(),
    receiptDate: z.iso.date(),
    inventoryDate: z.iso.date(),
    supplier: z.object({ id: z.uuid(), name: z.string() }),
    purchaseOrder: ref.nullable(),
    invoiceNo: z.string().nullable(),
    deliveryChallanNo: z.string().nullable(),
    /** Paise including GST; null without Financial. */
    totalValue: z.int().nullable(),
    lineCount: z.int(),
    createdAt: z.iso.datetime(),
  });

export const ListConstructionProcurementGoodsReceiptsResponseModel = z.object({
  items: z.array(ConstructionProcurementGoodsReceiptListItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  /** Suppliers of the GRNs the caller may see here, for the supplier filter. */
  suppliers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  financial: z.boolean(),
});
export type ListConstructionProcurementGoodsReceiptsResponseModel = z.infer<
  typeof ListConstructionProcurementGoodsReceiptsResponseModel
>;

export const ConstructionProcurementReceivableOrderResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  orderDate: z.iso.date(),
  supplierId: z.uuid(),
  supplierName: z.string(),
  supplyType,
  receiptStatus,
  lines: z.array(
    z.object({
      id: z.uuid(),
      materialId: z.uuid(),
      materialName: z.string(),
      uomName: z.string(),
      hsnCode: z.string().nullable(),
      orderedQty: z.string(),
      /** Received on other GRNs (the one being edited left out). */
      receivedQty: z.string(),
      /** The PO line's taxable value per unit, the GRN's default rate; null without Financial. */
      unitRate: z.int().nullable(),
      gstRate: z.string(),
    }),
  ),
});

export const GetConstructionProcurementGoodsReceiptFormOptionsResponseModel =
  z.object({
    location: z.object({
      kind: locationKind,
      id: z.uuid(),
      name: z.string(),
      stateCode: z.string().nullable(),
    }),
    suppliers: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        gstin: z.string().nullable(),
        stateCode: z.string().nullable(),
      }),
    ),
    purchaseOrders: z.array(
      ConstructionProcurementReceivableOrderResponseModel,
    ),
    hiddenFields: z.array(grnField),
    financial: z.boolean(),
  });
export type GetConstructionProcurementGoodsReceiptFormOptionsResponseModel =
  z.infer<
    typeof GetConstructionProcurementGoodsReceiptFormOptionsResponseModel
  >;

function hiddenList(hidden: ReadonlySet<string>): GrnOptionalField[] {
  return GRN_OPTIONAL_FIELDS.filter((field) => hidden.has(field));
}

export function toGoodsReceiptResponse(
  view: GoodsReceiptView,
  financial: boolean,
): ConstructionProcurementGoodsReceiptResponseModel {
  const hidden = view.hiddenFields;
  const show = <T>(field: GrnOptionalField, value: T): T | null =>
    hidden.has(field) ? null : value;
  const { details, totals } = view;
  return {
    id: view.id,
    number: view.number,
    locationKind: view.location.kind,
    locationId: view.location.id,
    locationName: view.locationName,
    receiptDate: view.receiptDate,
    inventoryDate: view.inventoryDate,
    supplier: { id: view.supplierId, name: view.supplierName },
    purchaseOrder: view.purchaseOrder,
    supplyType: view.supplyType,
    invoiceNo: show("invoiceNo", details.invoiceNo),
    invoiceDate: show("invoiceDate", details.invoiceDate),
    invoiceAmount: show(
      "invoiceAmount",
      details.invoiceAmount == null
        ? null
        : money(details.invoiceAmount, financial),
    ),
    deliveryChallanNo: show("deliveryChallanNo", details.deliveryChallanNo),
    grnDcNo: show("grnDcNo", details.grnDcNo),
    vehicleNo: show("vehicleNo", details.vehicleNo),
    driverName: show("driverName", details.driverName),
    driverMobile: show("driverMobile", details.driverMobile),
    ewayBillNo: show("ewayBillNo", details.ewayBillNo),
    remark: show("remark", details.remark),
    taxableTotal: money(totals.taxableTotal, financial),
    cgstTotal: money(totals.cgstTotal, financial),
    sgstTotal: money(totals.sgstTotal, financial),
    igstTotal: money(totals.igstTotal, financial),
    totalValue: money(totals.totalValue, financial),
    lines: view.lines.map((line) => {
      const totalReceivedQty =
        line.orderedQty == null
          ? null
          : addQuantities(line.receivedElsewhereQty ?? "0", line.receivedQty);
      return {
        id: line.id,
        purchaseOrderItemId: line.purchaseOrderItemId,
        position: line.position,
        materialId: line.materialId,
        materialName: line.materialName,
        uomName: line.uomName,
        hsnCode: line.hsnCode,
        receivedQty: line.receivedQty,
        orderedQty: line.orderedQty,
        receivedElsewhereQty: line.receivedElsewhereQty,
        totalReceivedQty,
        excessQty:
          line.orderedQty == null || totalReceivedQty == null
            ? null
            : excessQuantity(line.orderedQty, totalReceivedQty),
        unitRate: money(line.unitRate, financial),
        gstRate: line.gstRate,
        taxable: money(line.amounts.taxable, financial),
        cgst: money(line.amounts.cgst, financial),
        sgst: money(line.amounts.sgst, financial),
        igst: money(line.amounts.igst, financial),
        total: money(line.amounts.total, financial),
      };
    }),
    hiddenFields: hiddenList(hidden),
    financial,
    paid: view.paid,
    createdBy: { id: view.createdBy, name: view.createdByName },
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toGoodsReceiptListItem(
  row: GoodsReceiptListRow,
  financial: boolean,
): z.infer<typeof ConstructionProcurementGoodsReceiptListItemResponseModel> {
  return {
    id: row.id,
    number: row.number,
    receiptDate: row.receiptDate,
    inventoryDate: row.inventoryDate,
    supplier: { id: row.supplierId, name: row.supplierName },
    purchaseOrder: row.purchaseOrder,
    invoiceNo: row.invoiceNo,
    deliveryChallanNo: row.deliveryChallanNo,
    totalValue: money(row.totalValue, financial),
    lineCount: row.lineCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toReceivableOrder(
  order: OrderFacts,
  financial: boolean,
): z.infer<typeof ConstructionProcurementReceivableOrderResponseModel> {
  return {
    id: order.id,
    number: order.number,
    orderDate: order.orderDate,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    supplyType: order.supplyType,
    receiptStatus: order.receiptStatus,
    lines: order.lines.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      materialName: line.materialName,
      uomName: line.uomName,
      hsnCode: line.hsnCode,
      orderedQty: line.quantity,
      receivedQty: line.receivedQty,
      unitRate: money(netUnitRate(line), financial),
      gstRate: line.gstRate,
    })),
  };
}

export function toFormOptionsResponse(
  options: GoodsReceiptFormOptions,
  financial: boolean,
): GetConstructionProcurementGoodsReceiptFormOptionsResponseModel {
  return {
    location: {
      kind: options.location.location.kind,
      id: options.location.location.id,
      name: options.location.name,
      stateCode: options.location.stateCode,
    },
    suppliers: options.suppliers,
    purchaseOrders: options.purchaseOrders.map((order) =>
      toReceivableOrder(order, financial),
    ),
    hiddenFields: hiddenList(options.hiddenFields),
    financial,
  };
}
