import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  SiteRecordContractor,
  SiteRecordDirectory,
  SiteRecordTeamMember,
} from "@/src/site-work/application/ports";

/**
 * What the Site Diary and the Hindrance register read from projects,
 * masters (Contractors on a Project) and organization (Team Members),
 * CM-607. Lives in composition because it crosses contexts; site-work only
 * sees the `SiteRecordDirectory` port.
 */
export function siteRecordDirectory(
  db: PrismaClient = prisma,
): SiteRecordDirectory {
  return {
    async projectExists(workspaceId, projectId) {
      const found = await db.constructionProjectsProject.findFirst({
        where: { id: projectId, workspaceId, deletedAt: null },
        select: { id: true },
      });
      return found != null;
    },

    async projectContractors(workspaceId, projectId) {
      const rows = await db.constructionMastersContractor.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          projects: { some: { projectId } },
        },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: "asc" },
      });
      return rows.map((row): SiteRecordContractor => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive,
      }));
    },

    async contractorNames(workspaceId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await db.constructionMastersContractor.findMany({
        where: { workspaceId, id: { in: [...ids] } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    async projectTeamMembers(workspaceId, projectId) {
      const rows = await db.constructionOrganizationTeamMember.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          status: "active",
          userId: { not: null },
          OR: [{ isOwner: true }, { projects: { some: { projectId } } }],
        },
        select: { userId: true, name: true, isOwner: true },
        orderBy: { name: "asc" },
      });
      return rows.flatMap((row): SiteRecordTeamMember[] =>
        row.userId == null
          ? []
          : [{ userId: row.userId, name: row.name, isOwner: row.isOwner }],
      );
    },

    async userNames(workspaceId, userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await db.constructionOrganizationTeamMember.findMany({
        where: { workspaceId, userId: { in: [...userIds] } },
        select: { userId: true, name: true },
      });
      return new Map(
        rows.flatMap((row) =>
          row.userId == null ? [] : [[row.userId, row.name] as const],
        ),
      );
    },
  };
}
