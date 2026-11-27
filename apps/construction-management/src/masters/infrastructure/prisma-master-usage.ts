import type { PrismaClient } from "@repo/construction-db";

import type { MasterUsage } from "../application/ports";
import type { MasterKind } from "../domain/master-kind";

/**
 * Whether live labour-context rows point at a masters row (CM-203). The
 * labour context is referenced by id only, so these are plain reads of its
 * tables. The procurement masters of CM-501 check their own usage
 * (`MaterialMasterUsage`).
 */
export function prismaMasterUsage(db: PrismaClient): MasterUsage {
  return async (kind: MasterKind, workspaceId: string, id: string) => {
    if (kind !== "labour_category") return false;
    const rows = await db.$queryRaw<{ used: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM construction_labour.employees
        WHERE workspace_id = ${workspaceId}
          AND labour_category_id = ${id}::uuid
          AND deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_labour.vendor_rates r
        JOIN construction_labour.vendor_shifts s ON s.id = r.shift_id
        JOIN construction_labour.vendors v ON v.id = s.vendor_id
        WHERE v.workspace_id = ${workspaceId}
          AND r.labour_category_id = ${id}::uuid
          AND s.deleted_at IS NULL
          AND v.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_labour.employee_overtime o
        JOIN construction_labour.employee_attendance a ON a.id = o.attendance_id
        WHERE a.workspace_id = ${workspaceId}
          AND o.labour_category_id = ${id}::uuid
          AND a.deleted_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM construction_labour.vendor_attendance_lines l
        JOIN construction_labour.vendor_attendance a ON a.id = l.attendance_id
        WHERE a.workspace_id = ${workspaceId}
          AND l.labour_category_id = ${id}::uuid
          AND a.deleted_at IS NULL
      ) AS used
    `;
    return rows[0]?.used === true;
  };
}
