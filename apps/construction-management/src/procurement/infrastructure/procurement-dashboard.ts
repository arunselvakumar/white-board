import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { ProcurementDirectory } from "../application/ports";

export type MaterialSummary = {
  /** Materials with stock movements or settings on the Project. */
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
};

export type PurchaseOrderSummary = {
  /** Live, non-rejected POs of the Project dated in the duration. */
  count: number;
  /** Σ grand total, paise. */
  value: bigint;
  /** Σ grand total per calendar month of the order date, oldest first. */
  months: { month: string; value: bigint }[];
};

export type PendingApprovals = {
  purchaseRequests: number;
  purchaseOrders: number;
  /** Pending transfers out of the Project (it approves them). */
  transfers: number;
};

/**
 * The Project Dashboard's Materials section and Material Approvals KPI
 * (CM-510). Stock states follow ADR CM-0015 §10: out at or below zero, low
 * at or below a minimum above zero (the location's override, else the
 * Material's), whatever the alert toggle says.
 */
export class ProcurementDashboard {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: ProcurementDirectory,
  ) {}

  async materialSummary(
    workspaceId: string,
    projectId: string,
  ): Promise<MaterialSummary> {
    const rows = await this.db.$queryRaw<
      { materialId: string; stock: string | null; minimum: string | null }[]
    >(Prisma.sql`
      SELECT m.material_id::text AS "materialId",
             s.stock::text AS stock,
             st.min_stock_qty::text AS minimum
      FROM (
        SELECT material_id FROM "construction_procurement"."stock_entries"
        WHERE workspace_id = ${workspaceId} AND location_kind = 'project' AND location_id = ${projectId}::uuid
        UNION
        SELECT material_id FROM "construction_procurement"."stock_settings"
        WHERE workspace_id = ${workspaceId} AND location_kind = 'project' AND location_id = ${projectId}::uuid
      ) m
      LEFT JOIN (
        SELECT material_id, SUM(quantity) AS stock
        FROM "construction_procurement"."stock_entries"
        WHERE workspace_id = ${workspaceId} AND location_kind = 'project' AND location_id = ${projectId}::uuid
        GROUP BY material_id
      ) s ON s.material_id = m.material_id
      LEFT JOIN "construction_procurement"."stock_settings" st
        ON st.workspace_id = ${workspaceId} AND st.location_kind = 'project'
       AND st.location_id = ${projectId}::uuid AND st.material_id = m.material_id`);
    const masters = await this.directory.materials(
      this.db,
      workspaceId,
      rows.map((row) => row.materialId),
    );
    const summary: MaterialSummary = {
      total: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
    };
    for (const row of rows) {
      // A material deleted from the master no longer counts.
      const material = masters.get(row.materialId);
      if (material == null) continue;
      summary.total += 1;
      const stock = new Prisma.Decimal(row.stock ?? "0");
      const minimum = new Prisma.Decimal(
        row.minimum ?? material.minStockQty ?? "0",
      );
      if (stock.lte(0)) summary.outOfStock += 1;
      else if (minimum.gt(0) && stock.lte(minimum)) summary.lowStock += 1;
      else summary.inStock += 1;
    }
    return summary;
  }

  async purchaseOrders(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<PurchaseOrderSummary> {
    const rows = await this.db.$queryRaw<
      { month: string; count: bigint; value: bigint }[]
    >(Prisma.sql`
      SELECT to_char(order_date, 'YYYY-MM') AS month,
             COUNT(*)::bigint AS count,
             COALESCE(SUM(grand_total), 0)::bigint AS value
      FROM "construction_procurement"."purchase_orders"
      WHERE workspace_id = ${workspaceId}
        AND location_kind = 'project' AND location_id = ${projectId}::uuid
        AND deleted_at IS NULL AND approval_status <> 'rejected'
        AND order_date BETWEEN ${calendarDateToDb(from)}::date AND ${calendarDateToDb(to)}::date
      GROUP BY 1 ORDER BY 1`);
    const values = new Map(rows.map((row) => [row.month, row.value]));
    return {
      count: rows.reduce((sum, row) => sum + Number(row.count), 0),
      value: rows.reduce((sum, row) => sum + row.value, 0n),
      months: monthsBetween(from, to).map((month) => ({
        month,
        value: values.get(month) ?? 0n,
      })),
    };
  }

  async pendingApprovals(
    workspaceId: string,
    projectId: string,
  ): Promise<PendingApprovals> {
    const [purchaseRequests, purchaseOrders, transfers] = await Promise.all([
      this.db.constructionProcurementPurchaseRequest.count({
        where: {
          workspaceId,
          projectId,
          deletedAt: null,
          approvalStatus: "pending",
        },
      }),
      this.db.constructionProcurementPurchaseOrder.count({
        where: {
          workspaceId,
          locationKind: "project",
          locationId: projectId,
          deletedAt: null,
          approvalStatus: "pending",
        },
      }),
      this.db.constructionProcurementMaterialTransfer.count({
        where: {
          workspaceId,
          fromKind: "project",
          fromId: projectId,
          deletedAt: null,
          approvalStatus: "pending",
        },
      }),
    ]);
    return { purchaseRequests, purchaseOrders, transfers };
  }
}

/** Every `YYYY-MM` from `from`'s month to `to`'s, inclusive. */
export function monthsBetween(from: CalendarDate, to: CalendarDate): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${String(year)}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
