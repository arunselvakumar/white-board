import type { PrismaClient } from "@repo/construction-db";

import type { RoleEmployees } from "../application/role-employees";

/**
 * A plain read of `construction_labour.employees` by Role id (ADR CM-0055
 * §2); the organization context imports nothing of the labour context.
 */
export function prismaRoleEmployees(db: PrismaClient): RoleEmployees {
  return {
    async counts(workspaceId) {
      const rows = await db.$queryRaw<{ roleId: string; count: number }[]>`
        SELECT role_id::text AS "roleId", count(*)::int AS count
        FROM construction_labour.employees
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        GROUP BY role_id
      `;
      return new Map(rows.map((row) => [row.roleId, row.count]));
    },
  };
}
