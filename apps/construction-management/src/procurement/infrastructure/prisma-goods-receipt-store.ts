import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";

import type {
  GoodsReceiptListPage,
  GoodsReceiptListParams,
  GoodsReceiptStore,
  OrderFacts,
  ReceiptLocationFacts,
  StoredGoodsReceipt,
  SupplierOption,
} from "../application/goods-receipt-handlers";
import { receiptStatus } from "../domain/goods-receipt";
import type { StockLocation } from "../domain/stock-location";

type Db = Prisma.TransactionClient;

type ReceiptRow = Prisma.ConstructionProcurementGoodsReceiptGetPayload<{
  include: { items: true };
}>;

const qty = (value: Prisma.Decimal) => value.toFixed(3);
const pct = (value: Prisma.Decimal) => value.toFixed(2);

function toStored(row: ReceiptRow): StoredGoodsReceipt {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    location: { kind: row.locationKind, id: row.locationId },
    number: row.number,
    receiptDate: calendarDateFromDb(row.receiptDate),
    inventoryDate: calendarDateFromDb(row.inventoryDate),
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    purchaseOrderId: row.purchaseOrderId,
    supplyType: row.supplyType,
    details: {
      invoiceNo: row.invoiceNo,
      invoiceDate:
        row.invoiceDate == null ? null : calendarDateFromDb(row.invoiceDate),
      invoiceAmount: row.invoiceAmount,
      deliveryChallanNo: row.deliveryChallanNo,
      grnDcNo: row.grnDcNo,
      vehicleNo: row.vehicleNo,
      driverName: row.driverName,
      driverMobile: row.driverMobile,
      ewayBillNo: row.ewayBillNo,
      remark: row.remark,
    },
    totals: {
      taxableTotal: row.taxableTotal,
      cgstTotal: row.cgstTotal,
      sgstTotal: row.sgstTotal,
      igstTotal: row.igstTotal,
      totalValue: row.totalValue,
    },
    lines: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        position: item.position,
        materialId: item.materialId,
        materialName: item.materialName,
        uomId: item.uomId,
        uomName: item.uomName,
        hsnCode: item.hsnCode,
        receivedQty: qty(item.receivedQty),
        unitRate: item.unitRate,
        gstRate: pct(item.gstRate),
        amounts: {
          taxable: item.taxable,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
          total: item.total,
        },
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function headerData(receipt: StoredGoodsReceipt) {
  const { details, totals } = receipt;
  return {
    receiptDate: calendarDateToDb(receipt.receiptDate),
    inventoryDate: calendarDateToDb(receipt.inventoryDate),
    supplierId: receipt.supplierId,
    supplierName: receipt.supplierName,
    purchaseOrderId: receipt.purchaseOrderId,
    supplyType: receipt.supplyType,
    invoiceNo: details.invoiceNo,
    invoiceDate:
      details.invoiceDate == null
        ? null
        : calendarDateToDb(details.invoiceDate),
    invoiceAmount: details.invoiceAmount,
    deliveryChallanNo: details.deliveryChallanNo,
    grnDcNo: details.grnDcNo,
    vehicleNo: details.vehicleNo,
    driverName: details.driverName,
    driverMobile: details.driverMobile,
    ewayBillNo: details.ewayBillNo,
    remark: details.remark,
    taxableTotal: totals.taxableTotal,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    igstTotal: totals.igstTotal,
    totalValue: totals.totalValue,
    updatedAt: receipt.updatedAt,
    updatedBy: receipt.updatedBy,
  };
}

function itemRows(
  receipt: StoredGoodsReceipt,
): Prisma.ConstructionProcurementGoodsReceiptItemCreateManyInput[] {
  return receipt.lines.map((line) => ({
    id: line.id,
    goodsReceiptId: receipt.id,
    purchaseOrderItemId: line.purchaseOrderItemId,
    position: line.position,
    materialId: line.materialId,
    materialName: line.materialName,
    uomId: line.uomId,
    uomName: line.uomName,
    hsnCode: line.hsnCode,
    receivedQty: new Prisma.Decimal(line.receivedQty),
    unitRate: line.unitRate,
    gstRate: new Prisma.Decimal(line.gstRate),
    taxable: line.amounts.taxable,
    cgst: line.amounts.cgst,
    sgst: line.amounts.sgst,
    igst: line.amounts.igst,
    total: line.amounts.total,
  }));
}

type OrderRow = Prisma.ConstructionProcurementPurchaseOrderGetPayload<{
  include: { items: true };
}>;

/**
 * Σ received per PO line from live GRN lines, leaving out one GRN (the
 * one being edited) when given.
 */
async function receivedByLine(
  db: Db,
  orderIds: readonly string[],
  excludeReceiptId?: string,
): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db.$queryRaw<
    { itemId: string; received: string }[]
  >(Prisma.sql`
    SELECT gri.purchase_order_item_id::text AS "itemId",
           SUM(gri.received_qty)::text AS received
    FROM construction_procurement.goods_receipt_items gri
    JOIN construction_procurement.goods_receipts gr ON gr.id = gri.goods_receipt_id
    WHERE gr.purchase_order_id = ANY(${[...orderIds]}::uuid[])
      AND gr.deleted_at IS NULL
      ${excludeReceiptId == null ? Prisma.empty : Prisma.sql`AND gr.id <> ${excludeReceiptId}::uuid`}
      AND gri.purchase_order_item_id IS NOT NULL
    GROUP BY gri.purchase_order_item_id`);
  return new Map(
    rows.map((row) => [
      row.itemId,
      new Prisma.Decimal(row.received).toFixed(3),
    ]),
  );
}

function toOrder(
  row: OrderRow,
  received: ReadonlyMap<string, string> | null,
): OrderFacts {
  return {
    id: row.id,
    number: row.number,
    orderDate: calendarDateFromDb(row.orderDate),
    location: { kind: row.locationKind, id: row.locationId },
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplyType: row.supplyType,
    approvalStatus: row.approvalStatus,
    receiptStatus: row.receiptStatus,
    closed: row.closedAt != null,
    lines: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        materialId: item.materialId,
        materialName: item.materialName,
        uomId: item.uomId,
        uomName: item.uomName,
        hsnCode: item.hsnCode,
        quantity: qty(item.quantity),
        unitRate: item.unitRate,
        taxable: item.taxable,
        gstRate: pct(item.gstRate),
        receivedQty:
          received == null
            ? qty(item.receivedQty)
            : (received.get(item.id) ?? "0.000"),
      })),
  };
}

/** Goods Receipts over `construction_procurement.goods_receipts` (CM-505). */
export class PrismaGoodsReceiptStore implements GoodsReceiptStore {
  constructor(private readonly db: PrismaClient) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.$transaction(work, { timeout: 20_000 });
  }

  async find(
    db: Db,
    workspaceId: string,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<StoredGoodsReceipt | null> {
    if (options.lock === true) {
      const locked = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text FROM construction_procurement.goods_receipts
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`);
      if (locked.length === 0) return null;
    }
    const row = await db.constructionProcurementGoodsReceipt.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { items: true },
    });
    return row == null ? null : toStored(row);
  }

  async location(
    db: Db,
    workspaceId: string,
    location: StockLocation,
  ): Promise<ReceiptLocationFacts | null> {
    if (location.kind === "project") {
      const project = await db.constructionProjectsProject.findFirst({
        where: { id: location.id, workspaceId, deletedAt: null },
        select: { name: true, stateCode: true },
      });
      return project == null
        ? null
        : {
            location,
            name: project.name,
            stateCode: project.stateCode,
            storeSupplierIds: null,
          };
    }
    const store = await db.constructionProcurementStore.findFirst({
      where: { id: location.id, workspaceId, deletedAt: null },
      select: {
        name: true,
        stateCode: true,
        suppliers: { select: { supplierId: true } },
      },
    });
    return store == null
      ? null
      : {
          location,
          name: store.name,
          stateCode: store.stateCode,
          storeSupplierIds: new Set(store.suppliers.map((s) => s.supplierId)),
        };
  }

  async suppliersAt(
    db: Db,
    workspaceId: string,
    location: ReceiptLocationFacts,
  ): Promise<SupplierOption[]> {
    const rows = await db.constructionMastersSupplier.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        ...(location.storeSupplierIds == null
          ? { projects: { some: { projectId: location.location.id } } }
          : { id: { in: [...location.storeSupplierIds] } }),
      },
      select: { id: true, name: true, gstin: true, stateCode: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      gstin: row.gstin,
      stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
    }));
  }

  async order(
    db: Db,
    workspaceId: string,
    id: string,
    options: { lock?: boolean; excludeReceiptId?: string } = {},
  ): Promise<OrderFacts | null> {
    if (options.lock === true) {
      const locked = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text FROM construction_procurement.purchase_orders
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`);
      if (locked.length === 0) return null;
    }
    const row = await db.constructionProcurementPurchaseOrder.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { items: true },
    });
    if (row == null) return null;
    const received =
      options.excludeReceiptId == null
        ? null
        : await receivedByLine(db, [row.id], options.excludeReceiptId);
    return toOrder(row, received);
  }

  async receivableOrders(
    db: Db,
    workspaceId: string,
    location: StockLocation,
    options: { includeId?: string | null; excludeReceiptId?: string },
  ): Promise<OrderFacts[]> {
    const open: Prisma.ConstructionProcurementPurchaseOrderWhereInput = {
      approvalStatus: "approved",
      closedAt: null,
      receiptStatus: { in: ["not_received", "partially_received"] },
    };
    const rows = await db.constructionProcurementPurchaseOrder.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        locationKind: location.kind,
        locationId: location.id,
        OR:
          options.includeId == null
            ? [open]
            : [open, { id: options.includeId }],
      },
      include: { items: true },
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const received =
      options.excludeReceiptId == null
        ? null
        : await receivedByLine(
            db,
            rows.map((row) => row.id),
            options.excludeReceiptId,
          );
    return rows.map((row) => toOrder(row, received));
  }

  async insert(tx: Db, receipt: StoredGoodsReceipt): Promise<void> {
    await tx.constructionProcurementGoodsReceipt.create({
      data: {
        id: receipt.id,
        workspaceId: receipt.workspaceId,
        locationKind: receipt.location.kind,
        locationId: receipt.location.id,
        number: receipt.number,
        ...headerData(receipt),
        createdAt: receipt.createdAt,
        createdBy: receipt.createdBy,
      },
    });
    await tx.constructionProcurementGoodsReceiptItem.createMany({
      data: itemRows(receipt),
    });
  }

  async replace(tx: Db, receipt: StoredGoodsReceipt): Promise<void> {
    const updated = await tx.constructionProcurementGoodsReceipt.updateMany({
      where: {
        id: receipt.id,
        workspaceId: receipt.workspaceId,
        deletedAt: null,
      },
      data: headerData(receipt),
    });
    if (updated.count === 0)
      throw conflict(
        "GOODS_RECEIPT_CHANGED",
        "Someone changed this Goods Receipt after you opened it. Reload to see the latest.",
      );
    await tx.constructionProcurementGoodsReceiptItem.deleteMany({
      where: { goodsReceiptId: receipt.id },
    });
    await tx.constructionProcurementGoodsReceiptItem.createMany({
      data: itemRows(receipt),
    });
  }

  async tombstone(
    tx: Db,
    receipt: StoredGoodsReceipt,
    by: string,
    now: Date,
  ): Promise<void> {
    await tx.constructionProcurementGoodsReceipt.updateMany({
      where: {
        id: receipt.id,
        workspaceId: receipt.workspaceId,
        deletedAt: null,
      },
      data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
    });
  }

  async recomputeOrderReceipt(tx: Db, purchaseOrderId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE construction_procurement.purchase_order_items poi
      SET received_qty = COALESCE((
        SELECT SUM(gri.received_qty)
        FROM construction_procurement.goods_receipt_items gri
        JOIN construction_procurement.goods_receipts gr ON gr.id = gri.goods_receipt_id
        WHERE gri.purchase_order_item_id = poi.id AND gr.deleted_at IS NULL
      ), 0)
      WHERE poi.purchase_order_id = ${purchaseOrderId}::uuid`);
    const items = await tx.constructionProcurementPurchaseOrderItem.findMany({
      where: { purchaseOrderId },
      select: { quantity: true, receivedQty: true },
    });
    await tx.constructionProcurementPurchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        receiptStatus: receiptStatus(
          items.map((item) => ({
            ordered: qty(item.quantity),
            received: qty(item.receivedQty),
          })),
        ),
      },
    });
  }

  async list(params: GoodsReceiptListParams): Promise<GoodsReceiptListPage> {
    const filters: Prisma.ConstructionProcurementGoodsReceiptWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        locationKind: params.location.kind,
        locationId: params.location.id,
        deletedAt: null,
      },
    ];
    if (params.createdBy != null) filters.push({ createdBy: params.createdBy });
    if (params.supplierId != null)
      filters.push({ supplierId: params.supplierId });
    if (params.purchaseOrderId != null)
      filters.push({ purchaseOrderId: params.purchaseOrderId });
    if (params.withPurchaseOrder === true)
      filters.push({ purchaseOrderId: { not: null } });
    if (params.withPurchaseOrder === false)
      filters.push({ purchaseOrderId: null });
    if (params.from != null)
      filters.push({ receiptDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ receiptDate: { lte: calendarDateToDb(params.to) } });
    const search = params.search?.trim();
    if (search != null && search !== "") {
      const contains = { contains: search, mode: "insensitive" as const };
      filters.push({
        OR: [
          { number: contains },
          { invoiceNo: contains },
          { deliveryChallanNo: contains },
          { grnDcNo: contains },
        ],
      });
    }
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where: Prisma.ConstructionProcurementGoodsReceiptWhereInput = {
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
    const base = filters.slice(0, params.createdBy == null ? 1 : 2);
    const [page, total, suppliers] = await Promise.all([
      this.db.constructionProcurementGoodsReceipt.findMany({
        where,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        include: { _count: { select: { items: true } } },
      }),
      this.db.constructionProcurementGoodsReceipt.count({
        where: { AND: filters },
      }),
      this.db.constructionProcurementGoodsReceipt.findMany({
        where: { AND: base },
        distinct: ["supplierId"],
        select: { supplierId: true, supplierName: true },
        orderBy: [{ supplierId: "asc" }, { createdAt: "desc" }],
        take: 200,
      }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const orderIds = [
      ...new Set(
        rows
          .map((row) => row.purchaseOrderId)
          .filter((id): id is string => id != null),
      ),
    ];
    const orders =
      orderIds.length === 0
        ? []
        : await this.db.constructionProcurementPurchaseOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, number: true },
          });
    const numbers = new Map(orders.map((order) => [order.id, order.number]));
    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        receiptDate: calendarDateFromDb(row.receiptDate),
        inventoryDate: calendarDateFromDb(row.inventoryDate),
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        purchaseOrder:
          row.purchaseOrderId == null
            ? null
            : {
                id: row.purchaseOrderId,
                number: numbers.get(row.purchaseOrderId) ?? "",
              },
        invoiceNo: row.invoiceNo,
        deliveryChallanNo: row.deliveryChallanNo,
        totalValue: row.totalValue,
        lineCount: row._count.items,
        createdAt: row.createdAt,
      })),
      total,
      hasMore,
      suppliers: suppliers
        .map((row) => ({ id: row.supplierId, name: row.supplierName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async userNames(
    db: Db,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, userId: { in: [...userIds] } },
      select: { userId: true, name: true },
    });
    return new Map(
      rows
        .filter(
          (row): row is { userId: string; name: string } => row.userId != null,
        )
        .map((row) => [row.userId, row.name]),
    );
  }

  async companyName(db: Db, workspaceId: string): Promise<string> {
    const row = await db.constructionOrganizationCompanyProfile.findUnique({
      where: { workspaceId },
      select: { name: true },
    });
    return row?.name ?? "";
  }
}
