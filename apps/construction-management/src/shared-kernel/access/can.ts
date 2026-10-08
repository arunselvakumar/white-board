import { forbidden } from "../domain-error";
import type { Flag } from "./flags";
import { menuByKey, type MenuKey } from "./menus";
import type { PermissionSet } from "./permission-set";

/**
 * What one Team Member may do in the Active Company, loaded once per request
 * (ADR CM-0003). The Owner can do everything.
 */
export type MemberAccess = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
  permissions: PermissionSet;
  /** Projects the Team Member is assigned to (`modules/03`). */
  projectIds: ReadonlySet<string>;
};

/**
 * The one access check every command and query uses (ADR CM-0003). A
 * project-level menu also needs the Team Member on that Project.
 */
export function can(
  member: MemberAccess,
  menu: MenuKey,
  flag: Flag,
  options: { projectId?: string } = {},
): boolean {
  if (member.role === "owner") return true;
  const definition = menuByKey(menu);
  if (definition == null) return false;
  if (!member.permissions.has(menu, flag)) return false;
  if (
    definition.projectScoped &&
    options.projectId != null &&
    !member.projectIds.has(options.projectId)
  )
    return false;
  return true;
}

export function assertCan(
  member: MemberAccess,
  menu: MenuKey,
  flag: Flag,
  options: { projectId?: string } = {},
): void {
  if (!can(member, menu, flag, options))
    throw forbidden(
      "PERMISSION_DENIED",
      "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
}

/**
 * Without View All a Team Member sees only entries they created: a list
 * filter on the creator column, never a separate endpoint.
 */
export function ownEntriesOnly(
  member: MemberAccess,
  menu: MenuKey,
): { createdBy: string } | null {
  return can(member, menu, "view_all") ? null : { createdBy: member.userId };
}

/** Without Financial, amounts are null in Response models. */
export function financialValue<T>(
  member: MemberAccess,
  menu: MenuKey,
  value: T,
): T | null {
  return can(member, menu, "financial") ? value : null;
}
