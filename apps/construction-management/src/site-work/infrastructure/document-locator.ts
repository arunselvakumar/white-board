import { Prisma, type PrismaClient } from "@repo/construction-db";

import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";

import type { SiteWorkDocumentLocator } from "../application/document-thread-ports";
import {
  siteWorkDocumentNotFound,
  type LocatedSiteWorkDocument,
} from "../domain/document-thread";
import type { SiteWorkDocumentType } from "../domain/site-work-documents";

type Db = PrismaClient | Prisma.TransactionClient;

/** Each document's table in `construction_site_work`. */
const TABLES: Record<SiteWorkDocumentType, Prisma.Sql> = {
  worksheet: Prisma.sql`construction_site_work.worksheets`,
  equipment_usage: Prisma.sql`construction_site_work.equipment_usage_sheets`,
  site_diary: Prisma.sql`construction_site_work.site_diaries`,
  hindrance: Prisma.sql`construction_site_work.hindrances`,
};

const live = (workspaceId: string, id: string) => ({
  id,
  workspaceId,
  deletedAt: null,
});

const SELECT = { createdBy: true, projectId: true } as const;

/**
 * Finds a live site-work document of the Company in its own table and says
 * which Project its menu is checked on. Its label is its number, or a Site
 * Diary's date.
 */
export async function locateSiteWorkDocument(
  db: Db,
  workspaceId: string,
  type: SiteWorkDocumentType,
  id: string,
): Promise<LocatedSiteWorkDocument | null> {
  const base = { type, id, workspaceId };
  switch (type) {
    case "worksheet": {
      const row = await db.constructionSiteWorkWorksheet.findFirst({
        where: live(workspaceId, id),
        select: { ...SELECT, number: true },
      });
      return row == null ? null : { ...base, ...pick(row), label: row.number };
    }
    case "equipment_usage": {
      const row = await db.constructionSiteWorkEquipmentUsageSheet.findFirst({
        where: live(workspaceId, id),
        select: { ...SELECT, number: true },
      });
      return row == null ? null : { ...base, ...pick(row), label: row.number };
    }
    case "site_diary": {
      const row = await db.constructionSiteWorkSiteDiary.findFirst({
        where: live(workspaceId, id),
        select: { ...SELECT, diaryDate: true },
      });
      return row == null
        ? null
        : {
            ...base,
            ...pick(row),
            label: calendarDateFromDb(row.diaryDate),
          };
    }
    case "hindrance": {
      const row = await db.constructionSiteWorkHindrance.findFirst({
        where: live(workspaceId, id),
        select: { ...SELECT, number: true },
      });
      return row == null ? null : { ...base, ...pick(row), label: row.number };
    }
  }
}

function pick(row: { createdBy: string; projectId: string }) {
  return { createdBy: row.createdBy, projectId: row.projectId };
}

/**
 * Locks the document's row for the rest of the transaction, so a document
 * deleted meanwhile gets no new remark or file: 404 `<DOCUMENT>_NOT_FOUND`.
 */
export async function lockSiteWorkDocument(
  tx: Prisma.TransactionClient,
  document: Pick<LocatedSiteWorkDocument, "type" | "id" | "workspaceId">,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM ${TABLES[document.type]}
    WHERE id = ${document.id}::uuid
      AND workspace_id = ${document.workspaceId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw siteWorkDocumentNotFound(document.type);
}

export class PrismaSiteWorkDocumentLocator implements SiteWorkDocumentLocator {
  constructor(private readonly db: PrismaClient) {}

  locate(workspaceId: string, type: SiteWorkDocumentType, id: string) {
    return locateSiteWorkDocument(this.db, workspaceId, type, id);
  }
}
