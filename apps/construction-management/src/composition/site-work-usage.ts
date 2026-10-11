import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { PartyUsage } from "@/src/masters/application/party-handlers";
import type { MaterialUsage } from "@/src/masters/application/material-ports";
import type { MasterUsage } from "@/src/masters/application/ports";
import type { WorkTypeUsage } from "@/src/masters/application/work-type-ports";

/**
 * Whether live site-work rows point at a masters row (CM-601, ADR CM-0016
 * §7): masters may not delete a Work Type, Department, Contractor or
 * Material that a live worksheet, usage sheet, hindrance or equipment
 * names. Masters never imports site work; these are plain reads of its
 * tables. A Work Type's own Material list does not count (deleting the
 * Material unassigns it).
 */

async function exists(db: PrismaClient, query: Prisma.Sql): Promise<boolean> {
  const rows = await db.$queryRaw<{ used: boolean }[]>(query);
  return rows[0]?.used === true;
}

/** A live Daily Worksheet names the Work Type. */
export function siteWorkWorkTypeUsage(
  db: PrismaClient = prisma,
): WorkTypeUsage {
  return (workspaceId, workTypeId) =>
    exists(
      db,
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_site_work.worksheets
          WHERE workspace_id = ${workspaceId} AND work_type_id = ${workTypeId}::uuid
            AND deleted_at IS NULL
        ) AS used
      `,
    );
}

/** A live worksheet or usage sheet is booked under the Department. */
export function siteWorkDepartmentUsage(
  db: PrismaClient = prisma,
): MasterUsage {
  return async (kind, workspaceId, id) =>
    kind === "department" &&
    exists(
      db,
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_site_work.worksheets
          WHERE workspace_id = ${workspaceId} AND department_id = ${id}::uuid
            AND deleted_at IS NULL
        ) OR EXISTS (
          SELECT 1 FROM construction_site_work.equipment_usage_sheets
          WHERE workspace_id = ${workspaceId} AND department_id = ${id}::uuid
            AND deleted_at IS NULL
        ) AS used
      `,
    );
}

/**
 * A live worksheet, usage sheet or hindrance names the Contractor, or live
 * rented equipment is hired from them. Suppliers have no site-work users.
 */
export function siteWorkPartyUsage(db: PrismaClient = prisma): PartyUsage {
  return async (kind, workspaceId, id) =>
    kind === "contractor" &&
    exists(
      db,
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_site_work.worksheets
          WHERE workspace_id = ${workspaceId} AND contractor_id = ${id}::uuid
            AND deleted_at IS NULL
        ) OR EXISTS (
          SELECT 1 FROM construction_site_work.equipment_usage_sheets
          WHERE workspace_id = ${workspaceId} AND contractor_id = ${id}::uuid
            AND deleted_at IS NULL
        ) OR EXISTS (
          SELECT 1 FROM construction_site_work.hindrances
          WHERE workspace_id = ${workspaceId} AND contractor_id = ${id}::uuid
            AND deleted_at IS NULL
        ) OR EXISTS (
          SELECT 1 FROM construction_site_work.equipment
          WHERE workspace_id = ${workspaceId} AND hire_party_id = ${id}::uuid
            AND deleted_at IS NULL
        ) AS used
      `,
    );
}

/** A material line of a live worksheet or usage sheet names the Material. */
export function siteWorkMaterialUsage(
  db: PrismaClient = prisma,
): MaterialUsage {
  return (workspaceId, materialId) =>
    exists(
      db,
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_site_work.worksheet_materials m
          JOIN construction_site_work.worksheets w ON w.id = m.worksheet_id
          WHERE w.workspace_id = ${workspaceId} AND m.material_id = ${materialId}::uuid
            AND w.deleted_at IS NULL
        ) OR EXISTS (
          SELECT 1 FROM construction_site_work.equipment_usage_materials m
          JOIN construction_site_work.equipment_usage_sheets s ON s.id = m.sheet_id
          WHERE s.workspace_id = ${workspaceId} AND m.material_id = ${materialId}::uuid
            AND s.deleted_at IS NULL
        ) AS used
      `,
    );
}

/** In use when any of the checks says so (they run one after another). */
export function anyUsage<Args extends unknown[]>(
  ...checks: ((...args: Args) => Promise<boolean>)[]
): (...args: Args) => Promise<boolean> {
  return async (...args) => {
    for (const check of checks) if (await check(...args)) return true;
    return false;
  };
}
