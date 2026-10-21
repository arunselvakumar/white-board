import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { ClientUsage } from "@/src/masters/application/client-handlers";
import type { ProjectClients } from "@/src/projects/domain/project-repository";

/**
 * Where Clients (masters) and Projects (projects) meet (ADR CM-0023 §2).
 * Neither context imports the other: these are plain reads of the other
 * context's table.
 */

/** How many live Projects link the Client: a Client in use cannot be deleted. */
export function projectClientUsage(db: PrismaClient = prisma): ClientUsage {
  return async (workspaceId, id) => {
    const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count FROM construction_projects.projects
      WHERE workspace_id = ${workspaceId} AND client_id = ${id}::uuid
        AND deleted_at IS NULL
    `);
    return rows[0]?.count ?? 0;
  };
}

/** A live Client of the Company by id, for the Project form's Client link. */
export function masterProjectClients(
  db: PrismaClient = prisma,
): ProjectClients {
  return {
    async find(workspaceId, id) {
      return db.constructionMastersClient.findFirst({
        where: { id, workspaceId, deletedAt: null },
        select: { id: true, name: true, isActive: true },
      });
    },
  };
}
