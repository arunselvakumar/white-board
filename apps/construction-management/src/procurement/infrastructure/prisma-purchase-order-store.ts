import { Prisma } from "@repo/construction-db";

import type { ApprovalState } from "@/src/shared-kernel/approval";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type {
  PurchaseOrderContent,
  PurchaseOrderListParams,
  PurchaseOrderStore,
  StoredPurchaseOrder,
} from "../application/purchase-order-handlers";
import type { StockLocation } from "../domain/stock-location";

type Db = Prisma.TransactionClient;

const withLines = {
  items: { orderBy: { position: "asc" } },
  terms: { orderBy: { position: "asc" } },
} satisfies Prisma.ConstructionProcurementPurchaseOrderInclude;

type Row = Prisma.ConstructionProcurementPurchaseOrderGetPayload<{
  include: typeof withLines;
}>;

function toStored(row: Row): StoredPurchaseOrder {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    location: { kind: row.locationKind, id: row.locationId },
    number: row.number,
    orderDate: calendarDateFromDb(row.orderDate),
    expectedDeliveryDate: calendarDateFromDb(row.expectedDeliveryDate),
    purchaseRequestId: row.purchaseRequestId,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierGstin: row.supplierGstin,
    supplierStateCode: row.supplierStateCode,
    siteLocation: (row.siteLocation as LocationRef | null) ?? null,
    supplyType: row.supplyType,
    placeOfSupplyStateCode: row.placeOfSupplyStateCode,
    billingAddressId: row.billingAddressId,
    billingName: row.billingName,
    billingAddress: row.billingAddress,
    billingStateCode: row.billingStateCode,
    billingGstin: row.billingGstin,
    supplierPocName: row.supplierPocName,
    supplierPocMobile: row.supplierPocMobile,
    sitePocName: row.sitePocName,
    sitePocMobile: row.sitePocMobile,
    paymentTermsDays: row.paymentTermsDays,
    deliveryAddressDiffers: row.deliveryAddressDiffers,
    deliveryAddress: row.deliveryAddress,
    deliveryStateCode: row.deliveryStateCode,
    remark: row.remark,
    totals: {
      subTotal: row.subTotal,
      discountTotal: row.discountTotal,
      taxableTotal: row.taxableTotal,
      cgstTotal: row.cgstTotal,
      sgstTotal: row.sgstTotal,
      igstTotal: row.igstTotal,
      itemsTotal: row.itemsTotal,
      additionalCharges: row.additionalCharges,
      deductionAmount: row.deductionAmount,
      grandTotal: row.grandTotal,
    },
    terms: row.terms.map((term) => ({
      termsId: term.termsId,
      title: term.title,
      body: term.body,
    })),
    approval: {
      status: row.approvalStatus,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      rejectionReason: row.rejectionReason,
    },
    orderedAt: row.orderedAt,
    orderedBy: row.orderedBy,
    receiptStatus: row.receiptStatus,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    items: row.items.map((item) => ({
      id: item.id,
      position: item.position,
      materialId: item.materialId,
      materialName: item.materialName,
      uomId: item.uomId,
      uomName: item.uomName,
      purchaseRequestItemId: item.purchaseRequestItemId,
      hsnCode: item.hsnCode,
      quantity: item.quantity.toFixed(3),
      unitRate: item.unitRate,
      discountType: item.discountType,
      discountPercent: item.discountPercent?.toFixed(2) ?? null,
      gstRate: item.gstRate.toFixed(2),
      remark: item.remark,
      subTotal: item.subTotal,
      discountAmount: item.discountAmount,
      taxable: item.taxable,
      cgst: item.cgst,
      sgst: item.sgst,
      igst: item.igst,
      total: item.total,
      receivedQty: item.receivedQty.toFixed(3),
    })),
  };
}

function approvalColumns(approval: ApprovalState) {
  return {
    approvalStatus: approval.status,
    decidedAt: approval.decidedAt,
    decidedBy: approval.decidedBy,
    rejectionReason: approval.rejectionReason,
  };
}

function contentColumns(content: PurchaseOrderContent) {
  return {
    orderDate: calendarDateToDb(content.orderDate),
    expectedDeliveryDate: calendarDateToDb(content.expectedDeliveryDate),
    purchaseRequestId: content.purchaseRequestId,
    supplierId: content.supplierId,
    supplierName: content.supplierName,
    supplierGstin: content.supplierGstin,
    supplierStateCode: content.supplierStateCode,
    siteLocationType: content.siteLocation?.type ?? null,
    siteLocation:
      content.siteLocation == null
        ? Prisma.DbNull
        : (JSON.parse(
            JSON.stringify(content.siteLocation),
          ) as Prisma.InputJsonValue),
    supplyType: content.supplyType,
    placeOfSupplyStateCode: content.placeOfSupplyStateCode,
    billingAddressId: content.billingAddressId,
    billingName: content.billingName,
    billingAddress: content.billingAddress,
    billingStateCode: content.billingStateCode,
    billingGstin: content.billingGstin,
    supplierPocName: content.supplierPocName,
    supplierPocMobile: content.supplierPocMobile,
    sitePocName: content.sitePocName,
    sitePocMobile: content.sitePocMobile,
    paymentTermsDays: content.paymentTermsDays,
    deliveryAddressDiffers: content.deliveryAddressDiffers,
    deliveryAddress: content.deliveryAddress,
    deliveryStateCode: content.deliveryStateCode,
    remark: content.remark,
    ...content.totals,
  };
}

function lineRows(content: PurchaseOrderContent) {
  return content.lines.map((line, position) => ({
    id: newId(),
    position,
    purchaseRequestItemId: line.purchaseRequestItemId,
    materialId: line.materialId,
    materialName: line.materialName,
    uomId: line.uomId,
    uomName: line.uomName,
    hsnCode: line.hsnCode,
    quantity: new Prisma.Decimal(line.quantity),
    unitRate: line.unitRate,
    discountType: line.discountType,
    discountPercent:
      line.discountPercent == null
        ? null
        : new Prisma.Decimal(line.discountPercent),
    discountAmount: line.discountAmount,
    gstRate: new Prisma.Decimal(line.gstRate),
    subTotal: line.subTotal,
    taxable: line.taxable,
    cgst: line.cgst,
    sgst: line.sgst,
    igst: line.igst,
    total: line.total,
    remark: line.remark,
  }));
}

function termRows(content: PurchaseOrderContent) {
  return content.terms.map((term, position) => ({
    id: newId(),
    position,
    termsId: term.termsId,
    title: term.title,
    body: term.body,
  }));
}

/**
 * Purchase Orders in `construction_procurement.purchase_orders`, their
 * lines and copied Terms & Conditions (CM-504). Writes join the caller's
 * transaction. `received_qty` and `receipt_status` belong to Goods
 * Receipts (CM-505) and are never written here.
 */
export class PrismaPurchaseOrderStore implements PurchaseOrderStore {
  async find(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionProcurementPurchaseOrder.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: withLines,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: Db, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_procurement.purchase_orders
      WHERE workspace_id = ${workspaceId}
        AND id = ANY(${[...ids]}::uuid[])
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionProcurementPurchaseOrder.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      include: withLines,
    });
    return rows.map(toStored);
  }

  async insert(db: Db, row: Parameters<PurchaseOrderStore["insert"]>[1]) {
    await db.constructionProcurementPurchaseOrder.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        locationKind: row.location.kind,
        locationId: row.location.id,
        number: row.number,
        ...contentColumns(row),
        ...approvalColumns(row.approval),
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
        items: { create: lineRows(row) },
        terms: { create: termRows(row) },
      },
    });
  }

  async replace(
    db: Db,
    id: string,
    content: PurchaseOrderContent & {
      approval: ApprovalState;
      by: string;
      at: Date;
    },
  ) {
    await db.constructionProcurementPurchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id },
    });
    await db.constructionProcurementPurchaseOrderTerm.deleteMany({
      where: { purchaseOrderId: id },
    });
    await db.constructionProcurementPurchaseOrder.update({
      where: { id },
      data: {
        ...contentColumns(content),
        ...approvalColumns(content.approval),
        updatedAt: content.at,
        updatedBy: content.by,
        items: { create: lineRows(content) },
        terms: { create: termRows(content) },
      },
    });
  }

  async setApproval(
    db: Db,
    id: string,
    approval: ApprovalState,
    by: string,
    at: Date,
  ) {
    await db.constructionProcurementPurchaseOrder.update({
      where: { id },
      data: { ...approvalColumns(approval), updatedAt: at, updatedBy: by },
    });
  }

  async markOrdered(db: Db, id: string, by: string, at: Date) {
    await db.constructionProcurementPurchaseOrder.update({
      where: { id },
      data: { orderedAt: at, orderedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async close(db: Db, id: string, reason: string, by: string, at: Date) {
    await db.constructionProcurementPurchaseOrder.update({
      where: { id },
      data: {
        closedAt: at,
        closedBy: by,
        closeReason: reason,
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async tombstone(db: Db, id: string, by: string, at: Date) {
    await db.constructionProcurementPurchaseOrder.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async goodsReceipts(db: Db, workspaceId: string, id: string) {
    const rows = await db.constructionProcurementGoodsReceipt.findMany({
      where: { workspaceId, purchaseOrderId: id, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, number: true, receiptDate: true },
    });
    return rows.map((row) => ({
      ...row,
      receiptDate: calendarDateFromDb(row.receiptDate),
    }));
  }

  async list(db: Db, params: PurchaseOrderListParams) {
    const filters: Prisma.ConstructionProcurementPurchaseOrderWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        locationKind: params.location.kind,
        locationId: params.location.id,
        deletedAt: null,
      },
    ];
    if (params.from != null)
      filters.push({ orderDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ orderDate: { lte: calendarDateToDb(params.to) } });
    if (params.approvalStatus != null)
      filters.push({ approvalStatus: params.approvalStatus });
    if (params.receiptStatus != null)
      filters.push({ receiptStatus: params.receiptStatus });
    if (params.supplierId != null)
      filters.push({ supplierId: params.supplierId });
    if (params.purchaseRequestId != null)
      filters.push({ purchaseRequestId: params.purchaseRequestId });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where = {
      AND:
        cursor == null
          ? filters
          : [
              ...filters,
              {
                OR: backwards
                  ? [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ]
                  : [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
              },
            ],
    };
    const [page, total] = await Promise.all([
      db.constructionProcurementPurchaseOrder.findMany({
        where,
        include: withLines,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      db.constructionProcurementPurchaseOrder.count({
        where: { AND: filters },
      }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return { items: rows.map(toStored), hasMore, total };
  }

  async supplierFacets(db: Db, workspaceId: string, location: StockLocation) {
    const rows = await db.constructionProcurementPurchaseOrder.findMany({
      where: {
        workspaceId,
        locationKind: location.kind,
        locationId: location.id,
        deletedAt: null,
      },
      distinct: ["supplierId"],
      orderBy: [{ supplierId: "asc" }, { createdAt: "desc" }],
      select: { supplierId: true, supplierName: true },
    });
    return rows
      .map((row) => ({ id: row.supplierId, name: row.supplierName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async store(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionProcurementStore.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { suppliers: { select: { supplierId: true } } },
    });
    return row == null
      ? null
      : {
          id: row.id,
          name: row.name,
          address: row.address,
          stateCode: row.stateCode,
          supplierIds: row.suppliers.map((supplier) => supplier.supplierId),
        };
  }

  async purchaseRequestNumbers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await db.constructionProcurementPurchaseRequest.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, number: true },
    });
    return new Map(rows.map((row) => [row.id, row.number]));
  }
}
