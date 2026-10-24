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

/**
 * `viewerCan` for several Flags on one Menu, loading the viewer's access
 * once. Same hint-only rule: the routes check again.
 */
export async function viewerFlags<F extends Flag>(
  menu: MenuKey,
  flags: readonly F[],
): Promise<Record<F, boolean>> {
  const auth = await protectCompany();
  const none = Object.fromEntries(flags.map((flag) => [flag, false])) as Record<
    F,
    boolean
  >;
  if (auth.workspaceId == null || auth.role == null) return none;
  const access = await loadMemberAccess(prisma, {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    role: auth.role,
  });
  return Object.fromEntries(
    flags.map((flag) => [flag, can(access, menu, flag)]),
  ) as Record<F, boolean>;
}
