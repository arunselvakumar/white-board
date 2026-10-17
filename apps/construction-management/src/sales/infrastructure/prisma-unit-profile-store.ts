import { Prisma } from "@repo/construction-db";

import type {
  StoredUnitProfile,
  UnitProfileRow,
  UnitProfileStore,
} from "../application/booking-ports";
import type { SalesTx } from "../application/ports";

type Row = Prisma.ConstructionSalesUnitProfileGetPayload<object>;

/** `numeric` → `"1250.5"` (no trailing zeros). */
export function areaText(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toString();
}

function toStored(row: Row): StoredUnitProfile {
  return {
    unitId: row.unitId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    wingId: row.wingId,
    unitType: row.unitType,
    carpetArea: areaText(row.carpetArea),
    builtUpArea: areaText(row.builtUpArea),
    superBuiltUpArea: areaText(row.superBuiltUpArea),
    areaUnit: row.areaUnit,
    unavailable: row.unavailable,
    unavailableReason: row.unavailableReason,
    unavailableNote: row.unavailableNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** `construction_sales.unit_profiles` (CM-1005): one row per unit with details. */
export class PrismaUnitProfileStore implements UnitProfileStore {
  async profiles(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitIds?: readonly string[],
  ) {
    if (unitIds?.length === 0) return new Map<string, StoredUnitProfile>();
    const rows = await db.constructionSalesUnitProfile.findMany({
      where: {
        workspaceId,
        projectId,
        ...(unitIds == null ? {} : { unitId: { in: [...new Set(unitIds)] } }),
      },
    });
    return new Map(rows.map((row) => [row.unitId, toStored(row)]));
  }

  /**
   * One `INSERT … ON CONFLICT` per 500 rows: an import of 2,000 units
   * stays well inside the transaction's time limit.
   */
  async save(
    db: SalesTx,
    rows: readonly UnitProfileRow[],
    by: string,
    at: Date,
  ): Promise<void> {
    for (let start = 0; start < rows.length; start += 500) {
      const chunk = rows.slice(start, start + 500);
      const values = chunk.map(
        (row) => Prisma.sql`(
          ${row.unitId}::uuid, ${row.workspaceId}, ${row.projectId}::uuid,
          ${row.wingId}::uuid, ${row.unitType},
          ${row.carpetArea}::numeric, ${row.builtUpArea}::numeric,
          ${row.superBuiltUpArea}::numeric,
          ${row.areaUnit}::construction_sales.area_unit, ${row.unavailable},
          ${row.unavailableReason}::construction_sales.unavailable_reason,
          ${row.unavailableNote}, ${at}, ${at}, ${by}, ${by})`,
      );
      await db.$executeRaw(Prisma.sql`
        INSERT INTO construction_sales.unit_profiles (
          unit_id, workspace_id, project_id, wing_id, unit_type,
          carpet_area, built_up_area, super_built_up_area, area_unit,
          unavailable, unavailable_reason, unavailable_note,
          created_at, updated_at, created_by, updated_by)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (unit_id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          wing_id = EXCLUDED.wing_id,
          unit_type = EXCLUDED.unit_type,
          carpet_area = EXCLUDED.carpet_area,
          built_up_area = EXCLUDED.built_up_area,
          super_built_up_area = EXCLUDED.super_built_up_area,
          area_unit = EXCLUDED.area_unit,
          unavailable = EXCLUDED.unavailable,
          unavailable_reason = EXCLUDED.unavailable_reason,
          unavailable_note = EXCLUDED.unavailable_note,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by`);
    }
  }
}
