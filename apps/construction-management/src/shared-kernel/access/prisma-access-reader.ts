import type { PrismaClient } from "@repo/construction-db";

import type { MemberAccess } from "./can";
import { PermissionSet } from "./permission-set";

/**
 * Loads one Team Member's access for a request (ADR CM-0003): the matrix of
 * their Role, read on every request, so editing a Role changes access from
 * the next one (ADR CM-0029). Reads the organization context's grant tables
 * directly, like `recordAudit` writes its audit table: the matrix is part
 * of the kernel's contract.
 */
export async function loadMemberAccess(
  db: Pick<PrismaClient, "constructionOrganizationTeamMember">,
  session: { workspaceId: string; userId: string; role: "owner" | "member" },
): Promise<MemberAccess> {
  if (session.role === "owner")
    return {
      ...session,
      permissions: PermissionSet.everything(),
      roleId: null,
      projectIds: new Set(),
    };
  const member = await db.constructionOrganizationTeamMember.findFirst({
    where: {
      workspaceId: session.workspaceId,
      userId: session.userId,
      status: "active",
      deletedAt: null,
    },
    select: {
      roleId: true,
      role: {
        select: { permissions: { select: { menu: true, flags: true } } },
      },
      projects: { select: { projectId: true } },
    },
  });
  const masks: Record<string, number> = {};
  for (const grant of member?.role?.permissions ?? [])
    masks[grant.menu] = grant.flags;
  return {
    ...session,
    permissions: PermissionSet.fromMasks(masks),
    roleId: member?.roleId ?? null,
    projectIds: new Set(member?.projects.map((project) => project.projectId)),
  };
}
