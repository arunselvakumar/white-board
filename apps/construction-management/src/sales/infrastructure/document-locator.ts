import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { SalesDocumentLocator } from "../application/document-files";
import {
  salesDocumentNotFound,
  type LocatedSalesDocument,
  type SalesDocumentType,
} from "../domain/document-files";

type Db = PrismaClient | Prisma.TransactionClient;

const TABLES: Record<SalesDocumentType, Prisma.Sql> = {
  inquiry: Prisma.sql`construction_sales.inquiries`,
  booking: Prisma.sql`construction_sales.bookings`,
};

/**
 * Finds a live inquiry or booking of the Company: the Project its menu is
 * checked on and, for an inquiry, who sees it without View all.
 */
export async function locateSalesDocument(
  db: Db,
  workspaceId: string,
  type: SalesDocumentType,
  id: string,
): Promise<LocatedSalesDocument | null> {
  const where = { id, workspaceId, deletedAt: null };
  if (type === "inquiry") {
    const row = await db.constructionSalesInquiry.findFirst({
      where,
      select: {
        projectId: true,
        createdBy: true,
        name: true,
        assigneeMemberId: true,
        leadOwnerMemberId: true,
      },
    });
    if (row == null) return null;
    return {
      type,
      id,
      workspaceId,
      projectId: row.projectId,
      label: row.name,
      createdBy: row.createdBy,
      scopeMemberIds: [row.assigneeMemberId, row.leadOwnerMemberId].filter(
        (memberId): memberId is string => memberId != null,
      ),
    };
  }
  const row = await db.constructionSalesBooking.findFirst({
    where,
    select: { projectId: true, createdBy: true, customerName: true },
  });
  if (row == null) return null;
  return {
    type,
    id,
    workspaceId,
    projectId: row.projectId,
    label: row.customerName,
    createdBy: row.createdBy,
    scopeMemberIds: null,
  };
}

/**
 * Locks the document's row for the rest of the transaction, so a document
 * deleted meanwhile gets no new file: 404 `<DOCUMENT>_NOT_FOUND`.
 */
export async function lockSalesDocument(
  tx: Prisma.TransactionClient,
  document: Pick<LocatedSalesDocument, "type" | "id" | "workspaceId">,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM ${TABLES[document.type]}
    WHERE id = ${document.id}::uuid
      AND workspace_id = ${document.workspaceId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw salesDocumentNotFound(document.type);
}

export class PrismaSalesDocumentLocator implements SalesDocumentLocator {
  constructor(private readonly db: PrismaClient) {}

  locate(workspaceId: string, type: SalesDocumentType, id: string) {
    return locateSalesDocument(this.db, workspaceId, type, id);
  }
}
