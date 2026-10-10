import { Prisma } from "@repo/construction-db";
import { prisma, type PrismaClient } from "@repo/construction-db";

import type { PartyUsage } from "@/src/masters/application/party-handlers";
import type { MaterialUsage } from "@/src/masters/application/material-ports";

/**
 * Whether procurement points at a masters row (CM-501): masters may not
 * delete a Material on a live document's line or with any stock entry
 * (the ledger is history, CM-0015 §5), a Supplier on a live Purchase
 * Order or Goods Receipt, or a Contractor on a live Material Request.
 * Masters never imports procurement; these are plain reads of its tables.
 */
export function procurementMaterialUsage(
  db: PrismaClient = prisma,
): MaterialUsage {
  return async (workspaceId, materialId) => {
    const rows = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM construction_procurement.stock_entries
        WHERE workspace_id = ${workspaceId} AND material_id = ${materialId}::uuid
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.purchase_request_items i
        JOIN construction_procurement.purchase_requests d ON d.id = i.purchase_request_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.purchase_order_items i
        JOIN construction_procurement.purchase_orders d ON d.id = i.purchase_order_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.goods_receipt_items i
        JOIN construction_procurement.goods_receipts d ON d.id = i.goods_receipt_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.material_transfer_items i
        JOIN construction_procurement.material_transfers d ON d.id = i.material_transfer_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.material_request_items i
        JOIN construction_procurement.material_requests d ON d.id = i.material_request_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_procurement.delivery_note_items i
        JOIN construction_procurement.delivery_notes d ON d.id = i.delivery_note_id
        WHERE d.workspace_id = ${workspaceId} AND i.material_id = ${materialId}::uuid
          AND d.deleted_at IS NULL
      ) AS used
    `);
    return rows[0]?.used === true;
  };
}

export function procurementPartyUsage(db: PrismaClient = prisma): PartyUsage {
  return async (kind, workspaceId, id) => {
    const rows =
      kind === "supplier"
        ? await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
            SELECT EXISTS (
              SELECT 1 FROM construction_procurement.purchase_orders
              WHERE workspace_id = ${workspaceId} AND supplier_id = ${id}::uuid
                AND deleted_at IS NULL
            ) OR EXISTS (
              SELECT 1 FROM construction_procurement.goods_receipts
              WHERE workspace_id = ${workspaceId} AND supplier_id = ${id}::uuid
                AND deleted_at IS NULL
            ) AS used
          `)
        : await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
            SELECT EXISTS (
              SELECT 1 FROM construction_procurement.material_requests
              WHERE workspace_id = ${workspaceId} AND contractor_id = ${id}::uuid
                AND deleted_at IS NULL
            ) AS used
          `);
    return rows[0]?.used === true;
  };
}
