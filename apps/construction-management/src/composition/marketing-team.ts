import { prisma } from "@repo/construction-db";

import type { MarketingTeam } from "@/src/marketing/application/ports";
import { teamMembersHolding } from "@/src/organization/infrastructure/team-members-holding";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

/**
 * Marketing People and names, read from the organization context (ADR
 * CM-0040 §4). Marketing never reads organization tables itself; the
 * Team page and the per-person reports build on this too.
 */
export const marketingTeam: MarketingTeam = {
  async people(workspaceId) {
    const rows = await teamMembersHolding(
      prisma,
      workspaceId,
      "marketing.visits",
      "create",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      isOwner: row.isOwner,
      active: row.active,
    }));
  },

  async memberNames(workspaceId, memberIds) {
    const ids = [...new Set(memberIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },

  userNames(workspaceId, userIds) {
    return userNamesInCompany(prisma, workspaceId, userIds);
  },

  async memberOfUser(workspaceId, userId) {
    const row = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  },
};
