import { Prisma, type PrismaClient } from "@repo/construction-db";

import { flagBit, type Flag, type MenuKey } from "@/src/shared-kernel/access";

/** A Team Member as other contexts see them in a picker or a team list. */
export type TeamMemberHolding = {
  id: string;
  userId: string | null;
  name: string;
  mobile: string | null;
  isOwner: boolean;
  /** Joined and not removed. */
  active: boolean;
};

/**
 * Team Members whose Role holds `flag` on `menu`, and the Owner, who holds
 * every cell (ADR CM-0040 §4): Marketing People are those holding
 * `marketing.visits` create. Removed members are left out; members still
 * joining are listed as not active. Owner first, then by name.
 */
export async function teamMembersHolding(
  db: Pick<PrismaClient, "$queryRaw">,
  workspaceId: string,
  menu: MenuKey,
  flag: Flag,
): Promise<TeamMemberHolding[]> {
  const bit = flagBit(flag);
  return db.$queryRaw<TeamMemberHolding[]>(Prisma.sql`
    SELECT m.id, m.user_id AS "userId", m.name, m.mobile,
           m.is_owner AS "isOwner", (m.status = 'active') AS active
    FROM construction_organization.team_members m
    WHERE m.workspace_id = ${workspaceId}
      AND m.deleted_at IS NULL
      AND (
        m.is_owner
        OR EXISTS (
          SELECT 1
          FROM construction_organization.roles r
          JOIN construction_organization.role_menu_permissions p
            ON p.role_id = r.id
          WHERE r.id = m.role_id
            AND r.deleted_at IS NULL
            AND p.menu = ${menu}
            AND (p.flags & ${bit}) <> 0
        )
      )
    ORDER BY m.is_owner DESC, lower(m.name), m.id
  `);
}
