import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { MeasurementUnitUsage } from "@/src/masters/application/material-ports";
import type { PartyUsage } from "@/src/masters/application/party-handlers";
import type { MasterUsage } from "@/src/masters/application/ports";
import type { TrackingMasterUsage } from "@/src/masters/application/tracking-master-handlers";
import type { DrawingUsage } from "@/src/projects/application/project-drawings";

/**
 * What live tracking rows point at (CM-801, ADR CM-0019 §11): masters may
 * not delete an Issue Category a live issue names, a Tag a live task
 * carries, or a Department, Contractor or Measurement Unit a live task,
 * issue or inspection uses. Masters never imports tracking; these are
 * plain reads of `construction_tracking`.
 */
export function trackingMasterUsage(
  db: PrismaClient = prisma,
): TrackingMasterUsage {
  return async (kind, workspaceId, ids) => {
    if (ids.length === 0) return new Set();
    const list = [...new Set(ids)];
    const rows =
      kind === "issue_category"
        ? await db.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT DISTINCT category_id::text AS id
            FROM construction_tracking.issues
            WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
              AND category_id = ANY(${list}::uuid[])
          `)
        : await db.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT DISTINCT tt.tag_id::text AS id
            FROM construction_tracking.task_tags tt
            JOIN construction_tracking.tasks t ON t.id = tt.task_id
            WHERE t.workspace_id = ${workspaceId} AND t.deleted_at IS NULL
              AND tt.tag_id = ANY(${list}::uuid[])
          `);
    return new Set(rows.map((row) => row.id));
  };
}

async function exists(db: PrismaClient, query: Prisma.Sql): Promise<boolean> {
  const rows = await db.$queryRaw<{ used: boolean }[]>(query);
  return rows[0]?.used === true;
}

/** A live task, issue or inspection is booked under the Department. */
export function trackingDepartmentUsage(
  db: PrismaClient = prisma,
): MasterUsage {
  return async (kind, workspaceId, id) =>
    kind === "department" &&
    exists(db, trackingColumnUsed("department_id", workspaceId, id));
}

/** A live task, issue or inspection names the Contractor. */
export function trackingPartyUsage(db: PrismaClient = prisma): PartyUsage {
  return async (kind, workspaceId, id) =>
    kind === "contractor" &&
    exists(db, trackingColumnUsed("contractor_id", workspaceId, id));
}

/** A live task's Total work is counted in the Measurement Unit. */
export function trackingUnitUsage(
  db: PrismaClient = prisma,
): MeasurementUnitUsage {
  return (workspaceId, unitId) =>
    exists(
      db,
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_tracking.tasks
          WHERE workspace_id = ${workspaceId}
            AND total_work_unit_id = ${unitId}::uuid
            AND deleted_at IS NULL
        ) AS used
      `,
    );
}

/** `column` of a live task, issue or inspection is `id`. */
function trackingColumnUsed(
  column: "department_id" | "contractor_id",
  workspaceId: string,
  id: string,
): Prisma.Sql {
  const name = Prisma.raw(column);
  return Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM construction_tracking.tasks
      WHERE workspace_id = ${workspaceId} AND ${name} = ${id}::uuid
        AND deleted_at IS NULL
    ) OR EXISTS (
      SELECT 1 FROM construction_tracking.issues
      WHERE workspace_id = ${workspaceId} AND ${name} = ${id}::uuid
        AND deleted_at IS NULL
    ) OR EXISTS (
      SELECT 1 FROM construction_tracking.inspections
      WHERE workspace_id = ${workspaceId} AND ${name} = ${id}::uuid
        AND deleted_at IS NULL
    ) AS used
  `;
}

/**
 * Live Inspection Requests linking a Project Drawing (CM-0019 §9): the
 * projects context refuses deleting the drawing while there are any.
 */
export function trackingDrawingUsage(db: PrismaClient = prisma): DrawingUsage {
  return {
    async inspectionsLinking(workspaceId, drawingId) {
      const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(DISTINCT i.id)::int AS count
        FROM construction_tracking.inspection_drawings d
        JOIN construction_tracking.inspections i ON i.id = d.inspection_id
        WHERE i.workspace_id = ${workspaceId}
          AND i.deleted_at IS NULL
          AND d.drawing_id = ${drawingId}::uuid
      `);
      return rows[0]?.count ?? 0;
    },
  };
}
