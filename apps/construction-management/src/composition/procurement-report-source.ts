import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { procurementDirectory } from "@/src/composition/procurement-directory";
import { projectLocationLabeller } from "@/src/composition/progress-report-source";
import {
  TRANSFER_STATUS_LABELS,
  TRANSFER_TYPE_LABELS,
  transferStatus,
  transferType,
} from "@/src/procurement/domain/material-transfer";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { userNames } from "@/src/procurement/infrastructure/inventory-locations";
import { stockRegister } from "@/src/procurement/infrastructure/inventory-queries";
import type {
  ProcurementFilterNames,
  ProcurementReportPlaces,
  ProcurementReportSource,
} from "@/src/reporting/application/ports";
import type { DateRange } from "@/src/reporting/domain/report-period";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

const APPROVAL_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const ORDER_STATUS_LABELS = {
  not_ordered: "Not ordered",
  partially_ordered: "Partially ordered",
  ordered: "Ordered",
  excess_ordered: "Excess ordered",
} as const;

const RECEIPT_STATUS_LABELS = {
  not_received: "Not received",
  partially_received: "Partially received",
  received: "Received",
} as const;

/** A Decimal quantity (three places) as a number for a quantity column. */
function quantity(value: Prisma.Decimal | null | undefined): number {
  return Number(new Prisma.Decimal(value ?? 0).toFixed(3));
}

/** Paise for a money column; past a safe integer is a data error. */
function paise(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A procurement amount is beyond a safe integer.");
  return number;
}

function between({ from, to }: DateRange) {
  return { gte: calendarDateToDb(from), lte: calendarDateToDb(to) };
}

/** The live Projects and Stores a report reads, by id with their names. */
type Resolved = {
  projects: Map<string, string>;
  stores: Map<string, string>;
};

/**
 * The procurement reports' read model (CM-903): plain reads of the
 * procurement tables with names from projects, masters and organization,
 * and the Stock Register screen's own query (`stockRegister`), so a
 * report's figures are the screen's. Lives in composition because it
 * crosses contexts; reporting only sees the `ProcurementReportSource`
 * port and printable words.
 */
export function createProcurementReportSource(
  db: PrismaClient = prisma,
): ProcurementReportSource {
  /** The places' live Projects and Stores (null: every one; empty: none). */
  async function resolve(
    workspaceId: string,
    places: ProcurementReportPlaces,
  ): Promise<Resolved> {
    const [projects, stores] = await Promise.all([
      places.projectIds?.length === 0
        ? []
        : db.constructionProjectsProject.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              ...(places.projectIds == null
                ? {}
                : { id: { in: places.projectIds } }),
            },
            select: { id: true, name: true },
          }),
      places.storeIds?.length === 0
        ? []
        : db.constructionProcurementStore.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              ...(places.storeIds == null
                ? {}
                : { id: { in: places.storeIds } }),
            },
            select: { id: true, name: true },
          }),
    ]);
    return {
      projects: new Map(projects.map((row) => [row.id, row.name])),
      stores: new Map(stores.map((row) => [row.id, row.name])),
    };
  }

  /** Documents located at one of the places (`location_kind`, `location_id`). */
  function locatedAt(resolved: Resolved) {
    return {
      OR: [
        {
          locationKind: "project" as const,
          locationId: { in: [...resolved.projects.keys()] },
        },
        {
          locationKind: "store" as const,
          locationId: { in: [...resolved.stores.keys()] },
        },
      ],
    };
  }

  function placeName(
    resolved: Resolved,
    kind: "project" | "store",
    id: string,
  ): string {
    return (
      (kind === "project"
        ? resolved.projects.get(id)
        : resolved.stores.get(id)) ?? "—"
    );
  }

  /** Names of Projects and Stores by id, deleted ones keeping theirs. */
  async function anyPlaceNames(
    workspaceId: string,
    projectIds: readonly string[],
    storeIds: readonly string[],
  ): Promise<Resolved> {
    const [projects, stores] = await Promise.all([
      projectIds.length === 0
        ? []
        : db.constructionProjectsProject.findMany({
            where: { workspaceId, id: { in: [...new Set(projectIds)] } },
            select: { id: true, name: true },
          }),
      storeIds.length === 0
        ? []
        : db.constructionProcurementStore.findMany({
            where: { workspaceId, id: { in: [...new Set(storeIds)] } },
            select: { id: true, name: true },
          }),
    ]);
    return {
      projects: new Map(projects.map((row) => [row.id, row.name])),
      stores: new Map(stores.map((row) => [row.id, row.name])),
    };
  }

  async function supplierName(
    workspaceId: string,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    const row = await db.constructionMastersSupplier.findFirst({
      where: { workspaceId, id },
      select: { name: true },
    });
    if (row == null)
      throw new DomainError(
        "SUPPLIER_NOT_FOUND",
        "The chosen Supplier is not one of the Company's.",
      );
    return row.name;
  }

  async function materialName(
    workspaceId: string,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    const row = await db.constructionMastersMaterial.findFirst({
      where: { workspaceId, id },
      select: { name: true },
    });
    if (row == null)
      throw new DomainError(
        "MATERIAL_NOT_FOUND",
        "The chosen Material is not one of the Company's.",
      );
    return row.name;
  }

  async function categoryName(
    workspaceId: string,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    const row = await db.constructionMastersMaterialCategory.findFirst({
      where: { workspaceId, id },
      select: { name: true },
    });
    if (row == null)
      throw new DomainError(
        "MATERIAL_CATEGORY_NOT_FOUND",
        "The chosen Material Category is not one of the Company's.",
      );
    return row.name;
  }

  return {
    async purchaseRequests(workspaceId, filter) {
      const [resolved, material, category, creator] = await Promise.all([
        resolve(workspaceId, { projectIds: filter.projectIds, storeIds: [] }),
        materialName(workspaceId, filter.materialId),
        categoryName(workspaceId, filter.categoryId),
        filter.createdBy == null
          ? null
          : userNames(db, workspaceId, [filter.createdBy]).then(
              (names) => names.get(filter.createdBy ?? "") ?? "a removed user",
            ),
      ]);
      const names: ProcurementFilterNames = {
        material,
        category,
        createdBy: creator,
      };
      const itemMatch = {
        ...(filter.materialId == null ? {} : { materialId: filter.materialId }),
        ...(filter.categoryId == null ? {} : { categoryId: filter.categoryId }),
      };
      const rows = await db.constructionProcurementPurchaseRequest.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          projectId: { in: [...resolved.projects.keys()] },
          requestDate: between(filter.range),
          ...(filter.status == null ? {} : { approvalStatus: filter.status }),
          ...(filter.createdBy == null ? {} : { createdBy: filter.createdBy }),
          ...(Object.keys(itemMatch).length === 0
            ? {}
            : { items: { some: itemMatch } }),
        },
        include: { items: { orderBy: { position: "asc" } } },
        orderBy: [{ requestDate: "asc" }, { number: "asc" }],
      });
      const [users, categories, labellers] = await Promise.all([
        userNames(
          db,
          workspaceId,
          rows.flatMap((row) => [row.createdBy, row.decidedBy ?? []].flat()),
        ),
        db.constructionMastersMaterialCategory.findMany({
          where: {
            workspaceId,
            id: {
              in: [
                ...new Set(
                  rows.flatMap((row) =>
                    row.items.flatMap((item) => item.categoryId ?? []),
                  ),
                ),
              ],
            },
          },
          select: { id: true, name: true },
        }),
        Promise.all(
          [...new Set(rows.map((row) => row.projectId))].map(
            async (projectId) =>
              [
                projectId,
                await projectLocationLabeller(workspaceId, projectId, db),
              ] as const,
          ),
        ),
      ]);
      const categoryOf = new Map(categories.map((row) => [row.id, row.name]));
      const labelOf = new Map(labellers);
      return {
        names,
        rows: rows.flatMap((request) => {
          const location =
            labelOf.get(request.projectId)?.(request.siteLocation) ?? null;
          return request.items
            .filter(
              (item) =>
                (filter.materialId == null ||
                  item.materialId === filter.materialId) &&
                (filter.categoryId == null ||
                  item.categoryId === filter.categoryId),
            )
            .map((item) => ({
              number: request.number,
              requestDate: calendarDateFromDb(request.requestDate),
              project: resolved.projects.get(request.projectId) ?? "—",
              material: item.materialName,
              category:
                item.categoryId == null
                  ? null
                  : (categoryOf.get(item.categoryId) ?? null),
              quantity: quantity(item.quantity),
              orderedQty: quantity(item.orderedQty),
              uom: item.uomName,
              requiredBy:
                request.requiredDate == null
                  ? null
                  : calendarDateFromDb(request.requiredDate),
              location,
              status: APPROVAL_LABELS[request.approvalStatus],
              orderStatus: ORDER_STATUS_LABELS[request.orderStatus],
              createdBy: users.get(request.createdBy) ?? null,
              decidedBy:
                request.decidedBy == null
                  ? null
                  : (users.get(request.decidedBy) ?? null),
              remark: request.separateRemarks
                ? (item.remark ?? null)
                : (request.commonRemark ?? request.remark ?? null),
            }));
        }),
      };
    },

    async purchaseOrders(workspaceId, filter) {
      const [resolved, supplier] = await Promise.all([
        resolve(workspaceId, filter.places),
        supplierName(workspaceId, filter.supplierId),
      ]);
      const orders = await db.constructionProcurementPurchaseOrder.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...locatedAt(resolved),
          orderDate: between(filter.range),
          ...(filter.status == null ? {} : { approvalStatus: filter.status }),
          ...(filter.supplierId == null
            ? {}
            : { supplierId: filter.supplierId }),
        },
        include: { items: { orderBy: { position: "asc" } } },
        orderBy: [{ orderDate: "asc" }, { number: "asc" }],
      });
      const requestIds = [
        ...new Set(orders.flatMap((order) => order.purchaseRequestId ?? [])),
      ];
      const requests =
        requestIds.length === 0
          ? []
          : await db.constructionProcurementPurchaseRequest.findMany({
              where: { workspaceId, id: { in: requestIds } },
              select: { id: true, number: true },
            });
      const requestNumber = new Map(
        requests.map((row) => [row.id, row.number]),
      );
      return {
        names: { supplier },
        rows: orders.map((order) => ({
          number: order.number,
          orderDate: calendarDateFromDb(order.orderDate),
          place: placeName(resolved, order.locationKind, order.locationId),
          supplier: order.supplierName,
          purchaseRequest:
            order.purchaseRequestId == null
              ? null
              : (requestNumber.get(order.purchaseRequestId) ?? null),
          expectedDelivery: calendarDateFromDb(order.expectedDeliveryDate),
          status: APPROVAL_LABELS[order.approvalStatus],
          receiptStatus:
            order.closedAt != null
              ? "Closed"
              : RECEIPT_STATUS_LABELS[order.receiptStatus],
          taxable: paise(order.taxableTotal),
          cgst: paise(order.cgstTotal),
          sgst: paise(order.sgstTotal),
          igst: paise(order.igstTotal),
          grandTotal: paise(order.grandTotal),
          lines: order.items.map((item) => ({
            material: item.materialName,
            uom: item.uomName,
            ordered: quantity(item.quantity),
            received: quantity(item.receivedQty),
            unitRate: paise(item.unitRate),
            gstRate: Number(item.gstRate.toFixed(2)),
            total: paise(item.total),
          })),
        })),
      };
    },

    async materialReceived(workspaceId, filter) {
      const [resolved, supplier] = await Promise.all([
        resolve(workspaceId, filter.places),
        supplierName(workspaceId, filter.supplierId),
      ]);
      const receipts = await db.constructionProcurementGoodsReceipt.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...locatedAt(resolved),
          receiptDate: between(filter.range),
          ...(filter.supplierId == null
            ? {}
            : { supplierId: filter.supplierId }),
          ...(filter.ownBy == null ? {} : { createdBy: filter.ownBy }),
        },
        include: { items: { orderBy: { position: "asc" } } },
        orderBy: [{ receiptDate: "asc" }, { number: "asc" }],
      });
      const orderIds = [
        ...new Set(receipts.flatMap((row) => row.purchaseOrderId ?? [])),
      ];
      const [orders, users] = await Promise.all([
        orderIds.length === 0
          ? []
          : db.constructionProcurementPurchaseOrder.findMany({
              where: { workspaceId, id: { in: orderIds } },
              select: { id: true, number: true },
            }),
        userNames(
          db,
          workspaceId,
          receipts.map((row) => row.createdBy),
        ),
      ]);
      const orderNumber = new Map(orders.map((row) => [row.id, row.number]));
      const money = (value: bigint | null) =>
        filter.financial && value != null ? paise(value) : null;
      return {
        names: { supplier },
        rows: receipts.map((receipt) => ({
          number: receipt.number,
          receiptDate: calendarDateFromDb(receipt.receiptDate),
          place: placeName(resolved, receipt.locationKind, receipt.locationId),
          supplier: receipt.supplierName,
          purchaseOrder:
            receipt.purchaseOrderId == null
              ? null
              : (orderNumber.get(receipt.purchaseOrderId) ?? null),
          invoiceNo: receipt.invoiceNo,
          invoiceDate:
            receipt.invoiceDate == null
              ? null
              : calendarDateFromDb(receipt.invoiceDate),
          challanNo: receipt.deliveryChallanNo,
          grnDcNo: receipt.grnDcNo,
          vehicleNo: receipt.vehicleNo,
          enteredBy: users.get(receipt.createdBy) ?? null,
          taxable: money(receipt.taxableTotal),
          gst: money(receipt.cgstTotal + receipt.sgstTotal + receipt.igstTotal),
          total: money(receipt.totalValue),
          invoiceAmount: money(receipt.invoiceAmount),
          lines: receipt.items.map((item) => ({
            material: item.materialName,
            uom: item.uomName,
            quantity: quantity(item.receivedQty),
            unitRate: money(item.unitRate),
            gstRate: Number(item.gstRate.toFixed(2)),
            total: money(item.total),
          })),
        })),
      };
    },

    async materialTransfers(workspaceId, filter) {
      const resolved = await resolve(workspaceId, filter.places);
      const projects = [...resolved.projects.keys()];
      const stores = [...resolved.stores.keys()];
      const status =
        filter.status == null
          ? {}
          : filter.status === "pending" || filter.status === "rejected"
            ? { approvalStatus: filter.status }
            : {
                approvalStatus: "approved" as const,
                deliveredOn:
                  filter.status === "delivered" ? { not: null } : null,
              };
      const type =
        filter.transferType == null
          ? {}
          : {
              fromKind: filter.transferType.startsWith("project")
                ? ("project" as const)
                : ("store" as const),
              toKind: filter.transferType.endsWith("project")
                ? ("project" as const)
                : ("store" as const),
            };
      const transfers =
        await db.constructionProcurementMaterialTransfer.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            transferDate: between(filter.range),
            ...status,
            ...type,
            OR: [
              { fromKind: "project", fromId: { in: projects } },
              { toKind: "project", toId: { in: projects } },
              { fromKind: "store", fromId: { in: stores } },
              { toKind: "store", toId: { in: stores } },
            ],
          },
          include: { items: { orderBy: { position: "asc" } } },
          orderBy: [{ transferDate: "asc" }, { number: "asc" }],
        });
      const sides = transfers.flatMap((row) => [
        { kind: row.fromKind, id: row.fromId },
        { kind: row.toKind, id: row.toId },
      ]);
      const [places, users] = await Promise.all([
        anyPlaceNames(
          workspaceId,
          sides
            .filter((side) => side.kind === "project")
            .map((side) => side.id),
          sides.filter((side) => side.kind === "store").map((side) => side.id),
        ),
        userNames(
          db,
          workspaceId,
          transfers.flatMap((row) =>
            [row.createdBy, row.deliveredBy ?? []].flat(),
          ),
        ),
      ]);
      return transfers.map((transfer) => {
        const from: StockLocation = {
          kind: transfer.fromKind,
          id: transfer.fromId,
        };
        const to: StockLocation = { kind: transfer.toKind, id: transfer.toId };
        const deliveredOn =
          transfer.deliveredOn == null
            ? null
            : calendarDateFromDb(transfer.deliveredOn);
        return {
          number: transfer.number,
          transferDate: calendarDateFromDb(transfer.transferDate),
          type: TRANSFER_TYPE_LABELS[transferType(from, to)],
          from: placeName(places, from.kind, from.id),
          to: placeName(places, to.kind, to.id),
          status:
            TRANSFER_STATUS_LABELS[
              transferStatus({
                approvalStatus: transfer.approvalStatus,
                deliveredOn,
              })
            ],
          sentBy: users.get(transfer.createdBy) ?? null,
          receivedBy:
            transfer.receiverName ??
            (transfer.deliveredBy == null
              ? null
              : (users.get(transfer.deliveredBy) ?? null)),
          deliveredOn,
          remark: transfer.remark,
          lines: transfer.items.map((item) => ({
            material: item.materialName,
            uom: item.uomName,
            quantity: quantity(item.quantity),
          })),
        };
      });
    },

    async stockRegister(workspaceId, filter) {
      const [resolved, material, category, inCategory] = await Promise.all([
        resolve(workspaceId, filter.places),
        materialName(workspaceId, filter.materialId),
        categoryName(workspaceId, filter.categoryId),
        filter.categoryId == null
          ? null
          : db.constructionMastersMaterial
              .findMany({
                where: { workspaceId, categoryId: filter.categoryId },
                select: { id: true },
              })
              .then((rows) => new Set(rows.map((row) => row.id))),
      ]);
      const chosenStore =
        filter.places.storeIds?.length === 1
          ? (resolved.stores.get(filter.places.storeIds[0] ?? "") ?? null)
          : null;
      if (filter.places.storeIds?.length === 1 && chosenStore == null)
        throw new DomainError(
          "STORE_NOT_FOUND",
          "The chosen Store is not one of the Company's.",
        );
      const locations: { location: StockLocation; name: string }[] = [
        ...[...resolved.projects].map(([id, name]) => ({
          location: { kind: "project" as const, id },
          name,
        })),
        ...[...resolved.stores].map(([id, name]) => ({
          location: { kind: "store" as const, id },
          name,
        })),
      ];
      const rows = [];
      // One location at a time: the screen's query, so the figures match.
      for (const { location, name } of locations) {
        const register = await stockRegister(
          db,
          procurementDirectory,
          workspaceId,
          location,
          filter.range,
        );
        for (const row of register) {
          if (filter.materialId != null && row.materialId !== filter.materialId)
            continue;
          if (inCategory != null && !inCategory.has(row.materialId)) continue;
          rows.push({
            place: name,
            material: row.materialName,
            category: row.categoryName,
            uom: row.uomName,
            opening: Number(row.opening),
            received: Number(row.received),
            transferredIn: Number(row.transferredIn),
            transferredOut: Number(row.transferredOut),
            issued: Number(row.issued),
            receivedFromStore: Number(row.receivedFromStore),
            consumed: Number(row.consumed),
            missing: Number(row.missing),
            adjustment: Number(row.adjustment),
            closing: Number(row.closing),
          });
        }
      }
      return {
        names: { material, category, store: chosenStore },
        rows,
      };
    },
  };
}
