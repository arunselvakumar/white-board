import { protectCompany } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";

import { can, type Flag, type MenuKey } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/**
 * Whether the signed-in Team Member has a Flag on a Menu, for a page to
 * hide actions they can't take (ADR CM-0003). Only a hint for the screen:
 * every route checks again with `requireAccess`.
 */
export async function viewerCan(
  menu: MenuKey,
  flag: Flag,
  options: { projectId?: string } = {},
): Promise<boolean> {
  const auth = await protectCompany();
  if (auth.workspaceId == null || auth.role == null) return false;
  const access = await loadMemberAccess(prisma, {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    role: auth.role,
  });
  return can(access, menu, flag, options);
}
