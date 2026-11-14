import { prisma, type PrismaClient } from "@repo/construction-db";

export type SiteEngineerSignInLink = {
  /** The Site Engineer (supervisor row). */
  id: string;
  name: string;
  teamMemberId: string;
  deleted: boolean;
};

/**
 * Every Site Engineer that points at a sign-in, deleted ones included, so
 * an Activity feed can name the Site Engineer behind a sign-in's history
 * (ADR CM-0038 §1).
 */
export async function siteEngineerSignInLinks(
  workspaceId: string,
  db: Pick<PrismaClient, "constructionMastersSupervisor"> = prisma,
): Promise<SiteEngineerSignInLink[]> {
  const rows = await db.constructionMastersSupervisor.findMany({
    where: { workspaceId, teamMemberId: { not: null } },
    select: { id: true, name: true, teamMemberId: true, deletedAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.flatMap((row) =>
    row.teamMemberId == null
      ? []
      : [
          {
            id: row.id,
            name: row.name,
            teamMemberId: row.teamMemberId,
            deleted: row.deletedAt != null,
          },
        ],
  );
}

/**
 * A live Site Engineer and the sign-in their row points at (null without
 * one), or null when there is no such Site Engineer in the Company.
 */
export async function siteEngineerSignIn(
  workspaceId: string,
  id: string,
  db: Pick<PrismaClient, "constructionMastersSupervisor"> = prisma,
): Promise<{ id: string; teamMemberId: string | null } | null> {
  return db.constructionMastersSupervisor.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: { id: true, teamMemberId: true },
  });
}
