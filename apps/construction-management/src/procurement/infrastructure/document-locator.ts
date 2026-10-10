import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { DocumentLocator } from "../application/document-thread-ports";
import {
  documentNotFound,
  locationScope,
  type LocatedDocument,
} from "../domain/document-thread";
import type { ProcurementDocumentType } from "../domain/documents";

type Db = PrismaClient | Prisma.TransactionClient;

/** Each document's table in `construction_procurement`. */
const TABLES: Record<ProcurementDocumentType, Prisma.Sql> = {
  purchase_request: Prisma.sql`construction_procurement.purchase_requests`,
  purchase_order: Prisma.sql`construction_procurement.purchase_orders`,
  goods_receipt: Prisma.sql`construction_procurement.goods_receipts`,
  material_transfer: Prisma.sql`construction_procurement.material_transfers`,
  material_request: Prisma.sql`construction_procurement.material_requests`,
  delivery_note: Prisma.sql`construction_procurement.delivery_notes`,
};

const live = (workspaceId: string, id: string) => ({
  id,
  workspaceId,
  deletedAt: null,
});

/**
 * Finds a live document of the Company in its own table (same context, so
 * a plain read) and says where its menu is checked:
 * - Purchase Request, Material Request, Delivery Note: its Project;
 * - Purchase Order, Goods Receipt: its location when it is a Project, the
 *   Company-level menu for a Store;
 * - Material Transfer: either side (a Store side on the Company menu).
 *
 * Its Gallery Project is that Project; for a transfer, the source when it
 * is a Project, else the destination.
 */
export async function locateDocument(
  db: Db,
  workspaceId: string,
  type: ProcurementDocumentType,
  id: string,
): Promise<LocatedDocument | null> {
  const base = { type, id, workspaceId };
  switch (type) {
    case "purchase_request": {
      const row = await db.constructionProcurementPurchaseRequest.findFirst({
        where: live(workspaceId, id),
        select: { createdBy: true, number: true, projectId: true },
      });
      return row == null
        ? null
        : {
            ...base,
            number: row.number,
            createdBy: row.createdBy,
            scopes: [row.projectId],
            galleryProjectId: row.projectId,
          };
    }
    case "purchase_order": {
      const row = await db.constructionProcurementPurchaseOrder.findFirst({
        where: live(workspaceId, id),
        select: {
          createdBy: true,
          number: true,
          locationKind: true,
          locationId: true,
        },
      });
      if (row == null) return null;
      const scope = locationScope(row.locationKind, row.locationId);
      return {
        ...base,
        number: row.number,
        createdBy: row.createdBy,
        scopes: [scope],
        galleryProjectId: scope,
      };
    }
    case "goods_receipt": {
      const row = await db.constructionProcurementGoodsReceipt.findFirst({
        where: live(workspaceId, id),
        select: {
          createdBy: true,
          number: true,
          locationKind: true,
          locationId: true,
        },
      });
      if (row == null) return null;
      const scope = locationScope(row.locationKind, row.locationId);
      return {
        ...base,
        number: row.number,
        createdBy: row.createdBy,
        scopes: [scope],
        galleryProjectId: scope,
      };
    }
    case "material_transfer": {
      const row = await db.constructionProcurementMaterialTransfer.findFirst({
        where: live(workspaceId, id),
        select: {
          createdBy: true,
          number: true,
          fromKind: true,
          fromId: true,
          toKind: true,
          toId: true,
        },
      });
      if (row == null) return null;
      const from = locationScope(row.fromKind, row.fromId);
      const to = locationScope(row.toKind, row.toId);
      return {
        ...base,
        number: row.number,
        createdBy: row.createdBy,
        scopes: [from, to],
        galleryProjectId: from ?? to,
      };
    }
    case "material_request": {
      const row = await db.constructionProcurementMaterialRequest.findFirst({
        where: live(workspaceId, id),
        select: { createdBy: true, number: true, projectId: true },
      });
      return row == null
        ? null
        : {
            ...base,
            number: row.number,
            createdBy: row.createdBy,
            scopes: [row.projectId],
            galleryProjectId: row.projectId,
          };
    }
    case "delivery_note": {
      const row = await db.constructionProcurementDeliveryNote.findFirst({
        where: live(workspaceId, id),
        select: { createdBy: true, number: true, projectId: true },
      });
      return row == null
        ? null
        : {
            ...base,
            number: row.number,
            createdBy: row.createdBy,
            scopes: [row.projectId],
            galleryProjectId: row.projectId,
          };
    }
  }
}

/**
 * Locks the document's row for the rest of the transaction, so a document
 * deleted meanwhile gets no new remark or file: 404 `<DOCUMENT>_NOT_FOUND`.
 */
export async function lockDocument(
  tx: Prisma.TransactionClient,
  document: Pick<LocatedDocument, "type" | "id" | "workspaceId">,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM ${TABLES[document.type]}
    WHERE id = ${document.id}::uuid
      AND workspace_id = ${document.workspaceId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw documentNotFound(document.type);
}

export class PrismaDocumentLocator implements DocumentLocator {
  constructor(private readonly db: PrismaClient) {}

  locate(workspaceId: string, type: ProcurementDocumentType, id: string) {
    return locateDocument(this.db, workspaceId, type, id);
  }
}
