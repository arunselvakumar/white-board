import { Prisma, type PrismaClient } from "@repo/construction-db";

import { isUuid } from "@/src/shared-kernel/ids";

import type { ProjectDirectory } from "../application/ports";

/**
 * Reads live ids from `construction_projects.projects`; the projects
 * context is referenced by id only, so this is a plain read of its table.
 */
export class PrismaProjectDirectory implements ProjectDirectory {
  constructor(private readonly db: PrismaClient) {}

  async unknownIds(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<string[]> {
    const wanted = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const candidates = wanted.filter(isUuid);
    const rows =
      candidates.length === 0
        ? []
        : await this.db.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id::text AS "id" FROM construction_projects.projects
              WHERE workspace_id = ${workspaceId}
                AND deleted_at IS NULL
                AND id = ANY(${candidates}::uuid[])`,
          );
    const known = new Set(rows.map((row) => row.id.toLowerCase()));
    return wanted.filter((id) => !known.has(id.toLowerCase()));
  }
}
