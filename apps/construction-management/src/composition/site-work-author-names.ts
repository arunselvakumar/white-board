import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { SiteWorkAuthorNames } from "@/src/site-work/application/document-thread-ports";

/**
 * Names by User id for the site-work document thread, from
 * `construction_organization.team_members` (the Owner's row included). A
 * removed Team Member's name still shows; a live row wins.
 */
export function siteWorkAuthorNames(
  db: PrismaClient = prisma,
): SiteWorkAuthorNames {
  return {
    async namesOf(workspaceId, userIds) {
      if (userIds.length === 0) return new Map();
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
}
