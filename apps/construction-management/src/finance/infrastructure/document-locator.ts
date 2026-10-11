import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { FinanceDirectory } from "../application/ports";
import type { FinanceDocumentLocator } from "../application/document-thread-ports";
import {
  FINANCE_DOCUMENTS,
  financeDocumentNotFound,
  type FinanceDocumentType,
  type LocatedFinanceDocument,
} from "../domain/finance-documents";

type Db = Prisma.TransactionClient;

type Row = {
  createdBy: string;
  projectId: string | null;
  storeId: string | null;
  label: string;
  holderMemberId: string | null;
};

/** `construction_finance.<table>` of a document type. */
function tableOf(type: FinanceDocumentType): Prisma.Sql {
  return Prisma.raw(`construction_finance.${FINANCE_DOCUMENTS[type].table}`);
}

/**
 * One live row of the Company's document, with what the thread needs: its
 * Project (or Store), its label and, for a petty-cash voucher, its
 * account's holder. A settlement takes its invoice's Project and number.
 */
async function rowOf(
  db: Db,
  workspaceId: string,
  type: FinanceDocumentType,
  id: string,
): Promise<Row | null> {
  const where = Prisma.sql`d.id = ${id}::uuid
    AND d.workspace_id = ${workspaceId} AND d.deleted_at IS NULL`;
  let rows: Row[];
  switch (type) {
    case "settlement":
      rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT d.created_by AS "createdBy", i.project_id::text AS "projectId",
          i.store_id::text AS "storeId",
          'Settlement of ' || i.invoice_number AS label,
          NULL::text AS "holderMemberId"
        FROM construction_finance.settlements d
        JOIN construction_finance.invoices i ON i.id = d.invoice_id
        WHERE ${where}`);
      break;
    case "petty_cash_voucher":
      rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT d.created_by AS "createdBy", d.project_id::text AS "projectId",
          NULL::text AS "storeId", d.number AS label,
          a.holder_member_id::text AS "holderMemberId"
        FROM construction_finance.petty_cash_vouchers d
        JOIN construction_finance.accounts a ON a.id = d.account_id
        WHERE ${where}`);
      break;
    case "invoice":
    case "party_payment": {
      const column = Prisma.raw(
        `d.${FINANCE_DOCUMENTS[type].numberColumn ?? "id"}`,
      );
      rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT d.created_by AS "createdBy", d.project_id::text AS "projectId",
          d.store_id::text AS "storeId", ${column} AS label,
          NULL::text AS "holderMemberId"
        FROM ${tableOf(type)} d
        WHERE ${where}`);
      break;
    }
    default:
      rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT d.created_by AS "createdBy", d.project_id::text AS "projectId",
          NULL::text AS "storeId", d.number AS label,
          NULL::text AS "holderMemberId"
        FROM ${tableOf(type)} d
        WHERE ${where}`);
  }
  return rows[0] ?? null;
}

/**
 * Finds a live finance document of the Company in its own table (ADR
 * CM-0017): which Project its menu is checked on, whether it sits at a
 * Store, and a petty-cash voucher's holder (whose User id decides who sees
 * it without View all).
 */
export async function locateFinanceDocument(
  db: Db,
  directory: Pick<FinanceDirectory, "teamMembers">,
  workspaceId: string,
  type: FinanceDocumentType,
  id: string,
): Promise<LocatedFinanceDocument | null> {
  const row = await rowOf(db, workspaceId, type, id);
  if (row == null) return null;
  const holderUserId =
    row.holderMemberId == null
      ? null
      : ((
          await directory.teamMembers(db, workspaceId, [row.holderMemberId])
        ).get(row.holderMemberId)?.userId ?? null);
  return {
    type,
    id,
    workspaceId,
    projectId: row.projectId,
    storeId: row.storeId,
    label: row.label,
    createdBy: row.createdBy,
    holderUserId,
  };
}

/**
 * Locks the document's row for the rest of the transaction, so a document
 * deleted meanwhile gets no new remark or file: 404 `<DOCUMENT>_NOT_FOUND`.
 */
export async function lockFinanceDocument(
  tx: Prisma.TransactionClient,
  document: Pick<LocatedFinanceDocument, "type" | "id" | "workspaceId">,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM ${tableOf(document.type)}
    WHERE id = ${document.id}::uuid
      AND workspace_id = ${document.workspaceId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw financeDocumentNotFound(document.type);
}

export class PrismaFinanceDocumentLocator implements FinanceDocumentLocator {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: Pick<FinanceDirectory, "teamMembers">,
  ) {}

  locate(workspaceId: string, type: FinanceDocumentType, id: string) {
    return locateFinanceDocument(
      this.db,
      this.directory,
      workspaceId,
      type,
      id,
    );
  }
}
