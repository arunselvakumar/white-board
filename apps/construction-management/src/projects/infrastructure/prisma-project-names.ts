import { prisma, type PrismaClient } from "@repo/construction-db";

/**
 * Project names by id, deleted Projects included, for history that
 * outlives a Project (an Activity feed, ADR CM-0038 §1).
 */
export async function projectNames(
  workspaceId: string,
  ids: readonly string[],
  db: Pick<PrismaClient, "constructionProjectsProject"> = prisma,
): Promise<Map<string, { name: string; deleted: boolean }>> {
  if (ids.length === 0) return new Map();
  const rows = await db.constructionProjectsProject.findMany({
    where: { workspaceId, id: { in: [...new Set(ids)] } },
    select: { id: true, name: true, deletedAt: true },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, deleted: row.deletedAt != null },
    ]),
  );
}
