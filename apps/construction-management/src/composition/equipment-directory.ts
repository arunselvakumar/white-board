import { Prisma } from "@repo/construction-db";

import type {
  EquipmentDirectory,
  EquipmentHirePartyFacts,
  EquipmentProjectFacts,
} from "@/src/site-work/application/ports";

/**
 * What the Equipment register reads from projects, masters and
 * organization (CM-603). Lives in composition because it crosses
 * contexts; site-work only sees the `EquipmentDirectory` port.
 */
export const equipmentDirectory: EquipmentDirectory = {
  async projects(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionProjectsProject.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, name: true },
    });
    return new Map(
      rows.map((row): [string, EquipmentProjectFacts] => [row.id, row]),
    );
  },

  async projectOptions(db, workspaceId) {
    return db.constructionProjectsProject.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  async hireParties(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, name: true, isActive: true },
    });
    return new Map(
      rows.map((row): [string, EquipmentHirePartyFacts] => [row.id, row]),
    );
  },

  async hirePartyOptions(db, workspaceId) {
    return db.constructionMastersContractor.findMany({
      where: { workspaceId, deletedAt: null, isActive: true },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    });
  },

  async memberNames(db, workspaceId, userIds) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await db.$queryRaw<{ userId: string; name: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (user_id) user_id AS "userId", name
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${[...userIds]}::text[])
        ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC
      `,
    );
    return new Map(rows.map((row) => [row.userId, row.name]));
  },
};
