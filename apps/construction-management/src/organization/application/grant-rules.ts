import {
  fromMask,
  type MemberAccess,
  type PermissionSet,
} from "@/src/shared-kernel/access";
import { forbidden } from "@/src/shared-kernel/domain-error";

/**
 * Who may hand out which rights (ADR CM-0003, CM-0030). The Owner may grant
 * anything. A Member may give someone a Role, or save a Role, only when
 * they hold every cell in `cells` themselves — otherwise "edit Team
 * Members" or "edit Roles" would be "do anything". For a Role edit,
 * `cells` is what changed (added or removed); for giving a Role, the
 * whole Role.
 */
export function assertCanGrant(
  grantor: MemberAccess,
  cells: PermissionSet,
): void {
  if (grantor.role === "owner") return;
  const own = grantor.permissions.toMasks();
  for (const [menu, mask] of Object.entries(cells.toMasks())) {
    const extra = mask & ~(own[menu] ?? 0);
    if (extra !== 0)
      throw forbidden(
        "CANNOT_GRANT",
        `You can only grant rights you hold yourself (${menu}: ${fromMask(extra).join(", ")}).`,
      );
  }
}

/**
 * Nobody but the Owner changes their own access: not the Role they are on,
 * and not which Role they have (ADR CM-0030).
 */
export function assertNotOwnRole(
  grantor: MemberAccess,
  target: { roleId?: string | null; userId?: string | null },
): void {
  if (grantor.role === "owner") return;
  const ownRole =
    target.roleId != null &&
    grantor.roleId != null &&
    target.roleId === grantor.roleId;
  const ownself = target.userId != null && target.userId === grantor.userId;
  if (ownRole || ownself)
    throw forbidden(
      "OWN_ROLE",
      "You cannot change your own access. Ask the Owner.",
    );
}
