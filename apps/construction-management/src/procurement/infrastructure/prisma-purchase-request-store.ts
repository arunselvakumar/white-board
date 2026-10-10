import { Prisma } from "@repo/construction-db";

import type { ApprovalState } from "@/src/shared-kernel/approval";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type {
  LinkedPurchaseOrder,
  PurchaseRequestContent,
  PurchaseRequestListParams,
  PurchaseRequestStore,
  StoredPurchaseRequest,
} from "../application/purchase-request-handlers";

type Db = Prisma.TransactionClient;

const withItems = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.ConstructionProcurementPurchaseRequestInclude;

type Row = Prisma.ConstructionProcurementPurchaseRequestGetPayload<{
  include: typeof withItems;
}>;

function toStored(row: Row): StoredPurchaseRequest {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    requestDate: calendarDateFromDb(row.requestDate),
    requiredDate:
      row.requiredDate == null ? null : calendarDateFromDb(row.requiredDate),
    siteLocation: (row.siteLocation as LocationRef | null) ?? null,
    remark: row.remark,
    separateRemarks: row.separateRemarks,
    commonRemark: row.commonRemark,
    source: row.source,
    approval: {
      status: row.approvalStatus,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      rejectionReason: row.rejectionReason,
    },
    orderStatus: row.orderStatus,
    markedOrderedAt: row.markedOrderedAt,
    markedOrderedBy: row.markedOrderedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    items: row.items.map((item) => ({
      id: item.id,
      position: item.position,
      materialId: item.materialId,
      materialName: item.materialName,
      categoryId: item.categoryId,
      uomId: item.uomId,
      uomName: item.uomName,
      quantity: item.quantity.toFixed(3),
      remark: item.remark,
      orderedQty: item.orderedQty.toFixed(3),
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

function contentColumns(content: PurchaseRequestContent) {
  return {
    requestDate: calendarDateToDb(content.requestDate),
    requiredDate:
      content.requiredDate == null
        ? null
        : calendarDateToDb(content.requiredDate),
    siteLocationType: content.siteLocation?.type ?? null,
    siteLocation:
      content.siteLocation == null
        ? Prisma.DbNull
        : (JSON.parse(
            JSON.stringify(content.siteLocation),
          ) as Prisma.InputJsonValue),
    remark: content.remark,
    separateRemarks: content.separateRemarks,
    commonRemark: content.commonRemark,
  };
}

function itemRows(content: PurchaseRequestContent) {
  return content.lines.map((line, position) => ({
    id: newId(),
    position,
    materialId: line.materialId,
    materialName: line.materialName,
    categoryId: line.categoryId,
    uomId: line.uomId,
    uomName: line.uomName,
    quantity: new Prisma.Decimal(line.quantity),
    remark: line.remark,
  }));
}

/**
 * Purchase Requests in `construction_procurement.purchase_requests` and
 * `purchase_request_items` (CM-503). Every method runs on the client it
 * is given, so writes join the caller's transaction.
 */
export class PrismaPurchaseRequestStore implements PurchaseRequestStore {
  async find(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionProcurementPurchaseRequest.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: withItems,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: Db, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_procurement.purchase_requests
      WHERE workspace_id = ${workspaceId}
        AND id = ANY(${[...ids]}::uuid[])
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionProcurementPurchaseRequest.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      include: withItems,
    });
    return rows.map(toStored);
  }

  async insert(
    db: Db,
    row: Parameters<PurchaseRequestStore["insert"]>[1],
  ): Promise<void> {
    await db.constructionProcurementPurchaseRequest.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        number: row.number,
        source: row.source,
        ...contentColumns(row),
        ...approvalColumns(row.approval),
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
        items: { create: itemRows(row) },
      },
    });
  }

  async replace(
    db: Db,
    id: string,
    content: PurchaseRequestContent & {
      approval: ApprovalState;
      by: string;
      at: Date;
    },
  ): Promise<void> {
    await db.constructionProcurementPurchaseRequestItem.deleteMany({
      where: { purchaseRequestId: id },
    });
    await db.constructionProcurementPurchaseRequest.update({
      where: { id },
      data: {
        ...contentColumns(content),
        ...approvalColumns(content.approval),
        updatedAt: content.at,
        updatedBy: content.by,
        items: { create: itemRows(content) },
      },
    });
  }

  async setApproval(
    db: Db,
    id: string,
    approval: ApprovalState,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionProcurementPurchaseRequest.update({
      where: { id },
      data: { ...approvalColumns(approval), updatedAt: at, updatedBy: by },
    });
  }

  async markOrdered(db: Db, id: string, by: string, at: Date) {
    await db.constructionProcurementPurchaseRequest.update({
      where: { id },
      data: {
        markedOrderedAt: at,
        markedOrderedBy: by,
        orderStatus: "ordered",
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async tombstone(db: Db, id: string, by: string, at: Date) {
    await db.constructionProcurementPurchaseRequest.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async orderLineCount(db: Db, id: string): Promise<number> {
    return db.constructionProcurementPurchaseOrderItem.count({
      where: {
        purchaseRequestItem: { purchaseRequestId: id },
        purchaseOrder: { deletedAt: null },
      },
    });
  }

  async linkedOrders(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<LinkedPurchaseOrder[]> {
    const rows = await db.constructionProcurementPurchaseOrder.findMany({
      where: { workspaceId, purchaseRequestId: id, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        number: true,
        orderDate: true,
        supplierName: true,
        approvalStatus: true,
        grandTotal: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      orderDate: calendarDateFromDb(row.orderDate),
    }));
  }

  async list(db: Db, params: PurchaseRequestListParams) {
    const filters: Prisma.ConstructionProcurementPurchaseRequestWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
      },
    ];
    if (params.from != null)
      filters.push({ requestDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ requestDate: { lte: calendarDateToDb(params.to) } });
    if (params.approvalStatus != null)
      filters.push({ approvalStatus: params.approvalStatus });
    if (params.orderStatus != null)
      filters.push({ orderStatus: params.orderStatus });
    if (params.createdBy != null) filters.push({ createdBy: params.createdBy });
    if (params.locationType != null)
      filters.push({ siteLocationType: params.locationType });
    if (params.categoryId != null)
      filters.push({ items: { some: { categoryId: params.categoryId } } });
    if (params.materialId != null)
      filters.push({ items: { some: { materialId: params.materialId } } });
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
      db.constructionProcurementPurchaseRequest.findMany({
        where,
        include: withItems,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      db.constructionProcurementPurchaseRequest.count({
        where: { AND: filters },
      }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return { items: rows.map(toStored), hasMore, total };
  }

  async facets(db: Db, workspaceId: string, projectId: string) {
    const [creators, materials] = await Promise.all([
      db.$queryRaw<{ userId: string; name: string | null }[]>(Prisma.sql`
        SELECT DISTINCT pr.created_by AS "userId",
          (SELECT tm.name FROM construction_organization.team_members tm
           WHERE tm.workspace_id = pr.workspace_id AND tm.user_id = pr.created_by
           ORDER BY (tm.deleted_at IS NULL) DESC, tm.created_at DESC LIMIT 1) AS name
        FROM construction_procurement.purchase_requests pr
        WHERE pr.workspace_id = ${workspaceId}
          AND pr.project_id = ${projectId}::uuid
          AND pr.deleted_at IS NULL`),
      db.$queryRaw<
        { id: string; name: string; categoryId: string | null }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (i.material_id)
          i.material_id::text AS id, i.material_name AS name,
          i.category_id::text AS "categoryId"
        FROM construction_procurement.purchase_request_items i
        JOIN construction_procurement.purchase_requests pr ON pr.id = i.purchase_request_id
        WHERE pr.workspace_id = ${workspaceId}
          AND pr.project_id = ${projectId}::uuid
          AND pr.deleted_at IS NULL
        ORDER BY i.material_id, pr.created_at DESC`),
    ]);
    return {
      creators: creators
        .map((row) => ({ userId: row.userId, name: row.name ?? "Unknown" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      materials: materials.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async names(db: Db, workspaceId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await db.$queryRaw<
      { userId: string; name: string }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (user_id) user_id AS "userId", name
      FROM construction_organization.team_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ANY(${[...userIds]}::text[])
      ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC`);
    return new Map(rows.map((row) => [row.userId, row.name]));
  }

  async onTheWay(
    db: Db,
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
    excludePurchaseRequestId: string | null,
  ) {
    const rows = await db.$queryRaw<
      { materialId: string; quantity: string }[]
    >(Prisma.sql`
      SELECT material_id::text AS "materialId", SUM(quantity)::text AS quantity
      FROM (
        SELECT i.material_id, GREATEST(i.quantity - i.ordered_qty, 0) AS quantity
        FROM construction_procurement.purchase_request_items i
        JOIN construction_procurement.purchase_requests pr ON pr.id = i.purchase_request_id
        WHERE pr.workspace_id = ${workspaceId}
          AND pr.project_id = ${projectId}::uuid
          AND pr.deleted_at IS NULL
          AND pr.approval_status <> 'rejected'
          AND pr.marked_ordered_at IS NULL
          AND i.material_id = ANY(${[...materialIds]}::uuid[])
          ${excludePurchaseRequestId == null ? Prisma.empty : Prisma.sql`AND pr.id <> ${excludePurchaseRequestId}::uuid`}
        UNION ALL
        SELECT poi.material_id, GREATEST(poi.quantity - poi.received_qty, 0)
        FROM construction_procurement.purchase_order_items poi
        JOIN construction_procurement.purchase_orders po ON po.id = poi.purchase_order_id
        WHERE po.workspace_id = ${workspaceId}
          AND po.location_kind = 'project'
          AND po.location_id = ${projectId}::uuid
          AND po.deleted_at IS NULL
          AND po.approval_status <> 'rejected'
          AND po.closed_at IS NULL
          AND poi.material_id = ANY(${[...materialIds]}::uuid[])
      ) AS way
      GROUP BY material_id`);
    return new Map(rows.map((row) => [row.materialId, row.quantity]));
  }

  async estimatedQuantities(
    db: Db,
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
  ) {
    const rows = await db.constructionProcurementStockSetting.findMany({
      where: {
        workspaceId,
        locationKind: "project",
        locationId: projectId,
        materialId: { in: [...materialIds] },
        estimatedQty: { not: null },
      },
      select: { materialId: true, estimatedQty: true },
    });
    return new Map(
      rows.map((row) => [row.materialId, row.estimatedQty?.toFixed(3) ?? "0"]),
    );
  }
}
