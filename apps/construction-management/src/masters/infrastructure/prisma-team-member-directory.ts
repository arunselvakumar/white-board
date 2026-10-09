import type { PrismaClient } from "@repo/db";

import type { TeamMemberDirectory } from "../application/ports";

/**
 * Live Team Members (not removed, not rejected) read from
 * `construction_organization.team_members` by id. The organization context
 * is referenced by id only, so this is a plain read of its table.
 */
export class PrismaTeamMemberDirectory implements TeamMemberDirectory {
  constructor(private readonly db: PrismaClient) {}

  async namesOf(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.$queryRaw<{ id: string; name: string }[]>`
      SELECT id::text AS id, name FROM construction_organization.team_members
      WHERE workspace_id = ${workspaceId}
        AND id::text = ANY(${[...ids]}::text[])
        AND deleted_at IS NULL
        AND status <> 'rejected'
    `;
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
