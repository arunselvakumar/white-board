import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { TrackingDocumentLocator } from "../application/document-files-ports";
import {
  trackingDocumentNotFound,
  type LocatedTrackingDocument,
} from "../domain/document-files";
import type { TrackingDocumentType } from "../domain/tracking-documents";

type Db = PrismaClient | Prisma.TransactionClient;

/** Each document's table in `construction_tracking`. */
const TABLES: Record<TrackingDocumentType, Prisma.Sql> = {
  task: Prisma.sql`construction_tracking.tasks`,
  issue: Prisma.sql`construction_tracking.issues`,
  inspection: Prisma.sql`construction_tracking.inspections`,
};

const live = (workspaceId: string, id: string) => ({
  id,
  workspaceId,
  deletedAt: null,
});

/**
 * Finds a live tracking document of the Company in its own table and says
 * which Project its menu is checked on and who it is assigned to. Its
 * label is `T-12` for a task, the number for an issue or an inspection.
 */
export async function locateTrackingDocument(
  db: Db,
  workspaceId: string,
  type: TrackingDocumentType,
  id: string,
): Promise<LocatedTrackingDocument | null> {
  const base = { type, id, workspaceId };
  switch (type) {
    case "task": {
      const row = await db.constructionTrackingTask.findFirst({
        where: live(workspaceId, id),
        select: {
          projectId: true,
          createdBy: true,
          taskNo: true,
          assignees: { select: { memberId: true } },
        },
      });
      return row == null
        ? null
        : {
            ...base,
            projectId: row.projectId,
            createdBy: row.createdBy,
            label: `T-${String(row.taskNo)}`,
            assigneeMemberIds: row.assignees.map((item) => item.memberId),
            inspection: null,
          };
    }
    case "issue": {
      const row = await db.constructionTrackingIssue.findFirst({
        where: live(workspaceId, id),
        select: {
          projectId: true,
          createdBy: true,
          number: true,
          assigneeMemberId: true,
        },
      });
      return row == null
        ? null
        : {
            ...base,
            projectId: row.projectId,
            createdBy: row.createdBy,
            label: row.number,
            assigneeMemberIds:
              row.assigneeMemberId == null ? [] : [row.assigneeMemberId],
            inspection: null,
          };
    }
    case "inspection": {
      const row = await db.constructionTrackingInspection.findFirst({
        where: live(workspaceId, id),
        select: {
          projectId: true,
          createdBy: true,
          number: true,
          status: true,
          inspectorMemberId: true,
        },
      });
      return row == null
        ? null
        : {
            ...base,
            projectId: row.projectId,
            createdBy: row.createdBy,
            label: row.number,
            assigneeMemberIds: null,
            inspection: {
              status: row.status,
              inspectorMemberId: row.inspectorMemberId,
            },
          };
    }
  }
}

/**
 * Locks the document's row for the rest of the transaction, so a document
 * deleted meanwhile gets no new file: 404 `<DOCUMENT>_NOT_FOUND`.
 */
export async function lockTrackingDocument(
  tx: Prisma.TransactionClient,
  document: Pick<LocatedTrackingDocument, "type" | "id" | "workspaceId">,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM ${TABLES[document.type]}
    WHERE id = ${document.id}::uuid
      AND workspace_id = ${document.workspaceId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw trackingDocumentNotFound(document.type);
}

export class PrismaTrackingDocumentLocator implements TrackingDocumentLocator {
  constructor(private readonly db: PrismaClient) {}

  locate(workspaceId: string, type: TrackingDocumentType, id: string) {
    return locateTrackingDocument(this.db, workspaceId, type, id);
  }
}
