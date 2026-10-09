import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { UploaderNames } from "../application/project-documents";

/**
 * Team Member names by User id, read from
 * `construction_organization.team_members` (the organization context is
 * referred to by id only, so this is a plain read of its table). A removed
 * Team Member's name still says who uploaded a file; a live row wins.
 */
export class PrismaUploaderNames implements UploaderNames {
  constructor(private readonly db: PrismaClient) {}

  async namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db.$queryRaw<{ userId: string; name: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (user_id) user_id AS "userId", name
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${[...userIds]}::text[])
        ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC
      `,
    );
    return new Map(rows.map((row) => [row.userId, row.name]));
  }
}
