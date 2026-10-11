import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { StructureUsage } from "@/src/projects/domain/structure-repository";

/**
 * Every site record that names a piece of a Project's structure through a
 * `LocationRef` (JSON `site_location`): Daily Worksheets, Equipment Usage
 * sheets and Hindrances (M6, ADR CM-0016 §7), and procurement's Purchase
 * Requests, Purchase Orders, stock movements, Material Requests and stock
 * ledger entries (M5). Live rows count; ledger entries are history and
 * always count. Read by table, without importing those contexts (ADR
 * CM-0001). Tasks, Issues and Inspections (M8) and Bookings (M10) add their
 * tables here.
 */
const SOURCES: readonly { table: string; live: boolean }[] = [
  { table: "construction_site_work.worksheets", live: true },
  { table: "construction_site_work.equipment_usage_sheets", live: true },
  { table: "construction_site_work.hindrances", live: true },
  { table: "construction_procurement.purchase_requests", live: true },
  { table: "construction_procurement.purchase_orders", live: true },
  { table: "construction_procurement.stock_movements", live: true },
  { table: "construction_procurement.material_requests", live: true },
  { table: "construction_procurement.stock_entries", live: false },
];

/** The `site_location` of every source in the Company, as one relation. */
function refs(workspaceId: string): Prisma.Sql {
  return Prisma.join(
    SOURCES.map(
      (source) => Prisma.sql`
        SELECT site_location AS ref FROM ${Prisma.raw(source.table)}
        WHERE workspace_id = ${workspaceId}
          AND site_location IS NOT NULL
          ${source.live ? Prisma.sql`AND deleted_at IS NULL` : Prisma.empty}`,
    ),
    " UNION ALL ",
  );
}

export class PrismaStructureUsage implements StructureUsage {
  constructor(private readonly db: PrismaClient) {}

  async usedFloorsAndUnits(
    workspaceId: string,
    ids: { floorIds: readonly string[]; unitIds: readonly string[] },
  ): Promise<{ floorIds: string[]; unitIds: string[] }> {
    if (ids.floorIds.length === 0 && ids.unitIds.length === 0)
      return { floorIds: [], unitIds: [] };
    const rows = await this.db.$queryRaw<
      { kind: "floor" | "unit"; id: string }[]
    >(Prisma.sql`
      WITH refs AS (${refs(workspaceId)})
      SELECT DISTINCT 'floor' AS kind, f.id
      FROM refs, jsonb_array_elements_text(refs.ref -> 'floorIds') AS f(id)
      WHERE refs.ref ->> 'type' = 'wing' AND f.id = ANY(${[...ids.floorIds]}::text[])
      UNION
      SELECT DISTINCT 'unit' AS kind, u.id
      FROM refs, jsonb_array_elements_text(refs.ref -> 'unitIds') AS u(id)
      WHERE refs.ref ->> 'type' = 'wing' AND u.id = ANY(${[...ids.unitIds]}::text[])`);
    return {
      floorIds: rows.filter((row) => row.kind === "floor").map((row) => row.id),
      unitIds: rows.filter((row) => row.kind === "unit").map((row) => row.id),
    };
  }

  async isWingUsed(workspaceId: string, wingId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
      WITH refs AS (${refs(workspaceId)})
      SELECT EXISTS (
        SELECT 1 FROM refs
        WHERE ref ->> 'type' = 'wing' AND ref ->> 'wingId' = ${wingId}
      ) AS used`);
    return rows[0]?.used === true;
  }

  async isLocationUsed(
    workspaceId: string,
    locationId: string,
  ): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
      WITH refs AS (${refs(workspaceId)})
      SELECT EXISTS (
        SELECT 1 FROM refs
        WHERE ref ->> 'type' = 'location' AND ref ->> 'locationId' = ${locationId}
      ) AS used`);
    return rows[0]?.used === true;
  }
}
