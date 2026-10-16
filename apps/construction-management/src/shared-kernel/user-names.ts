import { Prisma, type PrismaClient } from "@repo/construction-db";

/** What screens show for a User who deleted their account (CM-907). */
export const DELETED_USER_NAME = "Deleted user";

type Db = Pick<PrismaClient, "$queryRaw">;

/**
 * Names by User id for "who did this" (created by, approved by, remarks),
 * from the Company's Team Members, the Owner's row included: a removed
 * Team Member's name still shows and a live row wins. A User who deleted
 * their account no longer has a linked Team Member and reads "Deleted
 * user" (`construction_organization.account_deletions`, CM-907).
 */
export async function userNamesInCompany(
  db: Db,
  workspaceId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.$queryRaw<{ userId: string; name: string }[]>(
    Prisma.sql`
      SELECT DISTINCT ON (user_id) user_id AS "userId", name
      FROM (
        SELECT user_id, name, 0 AS source, (deleted_at IS NULL) AS live, created_at
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${ids}::text[])
        UNION ALL
        SELECT user_id, ${DELETED_USER_NAME}, 1, true, deleted_at
        FROM construction_organization.account_deletions
        WHERE user_id = ANY(${ids}::text[])
      ) names
      ORDER BY user_id, source, live DESC, created_at DESC
    `,
  );
  return new Map(rows.map((row) => [row.userId, row.name]));
}

/** Adds "Deleted user" for the ids in `userIds` that `names` lacks and that deleted their account. */
export async function fillDeletedUserNames(
  db: Db,
  userIds: readonly string[],
  names: Map<string, string>,
): Promise<Map<string, string>> {
  const missing = [...new Set(userIds)].filter((id) => !names.has(id));
  if (missing.length === 0) return names;
  const rows = await db.$queryRaw<{ userId: string }[]>(Prisma.sql`
    SELECT DISTINCT user_id AS "userId"
    FROM construction_organization.account_deletions
    WHERE user_id = ANY(${missing}::text[])
  `);
  for (const row of rows) names.set(row.userId, DELETED_USER_NAME);
  return names;
}
