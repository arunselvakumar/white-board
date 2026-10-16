import type { PrismaClient } from "@repo/construction-db";

import { flagBit, type Flag } from "./flags";
import { menuByKey, type MenuKey } from "./menus";

type Db = Pick<PrismaClient, "constructionOrganizationTeamMember">;

export type NotificationRecipientsQuery = {
  workspaceId: string;
  menu: MenuKey;
  /** The flag the event needs besides Notification: `approve` or `read`. */
  flag: Flag;
  /** For a Project-scoped menu: only members assigned to this Project. */
  projectId?: string | null;
  /** The person whose action raised the event; never notified of it. */
  exceptUserId?: string | null;
  /**
   * Direct recipients (assignees, the creator): only these users are
   * considered, and they still need the flags (ADR CM-0021 §6). Absent:
   * every member of the Company.
   */
  among?: readonly string[];
};

/**
 * Who may receive a module's notification (ADR CM-0021 §6): the active
 * Team Members with a User who hold the menu's Notification flag and
 * `flag`, and — when the menu is Project-scoped and a Project is given —
 * are assigned to that Project, never `exceptUserId`. The Owner passes the
 * matrix and the assignment check, as in `can()`. Reads the organization
 * context's grant tables directly, like `loadMemberAccess`.
 */
export async function notificationRecipients(
  db: Db,
  query: NotificationRecipientsQuery,
): Promise<string[]> {
  const definition = menuByKey(query.menu);
  if (definition == null) return [];
  if (query.among?.length === 0) return [];
  const needsProject = definition.projectScoped && query.projectId != null;
  const needed = flagBit("notification") | flagBit(query.flag);
  const members = await db.constructionOrganizationTeamMember.findMany({
    where: {
      workspaceId: query.workspaceId,
      status: "active",
      deletedAt: null,
      userId:
        query.among == null ? { not: null } : { in: [...new Set(query.among)] },
    },
    select: {
      userId: true,
      isOwner: true,
      permissions: { where: { menu: query.menu }, select: { flags: true } },
      projects: {
        where: { projectId: query.projectId ?? "" },
        select: { projectId: true },
        take: 1,
      },
    },
  });
  const recipients = new Set<string>();
  for (const member of members) {
    if (member.userId == null || member.userId === query.exceptUserId) continue;
    if (!member.isOwner) {
      const mask = member.permissions[0]?.flags ?? 0;
      if ((mask & needed) !== needed) continue;
      if (needsProject && member.projects.length === 0) continue;
    }
    recipients.add(member.userId);
  }
  return [...recipients];
}

/**
 * The User ids of active Team Members ("assigned to you" events name
 * Team Members); members without a User, left or deleted are dropped.
 */
export async function userIdsOfTeamMembers(
  db: Db,
  workspaceId: string,
  memberIds: readonly string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const members = await db.constructionOrganizationTeamMember.findMany({
    where: {
      workspaceId,
      id: { in: [...new Set(memberIds)] },
      status: "active",
      deletedAt: null,
      userId: { not: null },
    },
    select: { userId: true },
  });
  return [
    ...new Set(
      members.flatMap((member) =>
        member.userId == null ? [] : [member.userId],
      ),
    ),
  ];
}
