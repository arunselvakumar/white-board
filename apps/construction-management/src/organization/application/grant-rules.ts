import {
  fromMask,
  type MemberAccess,
  type PermissionSet,
} from "@/src/shared-kernel/access";
import { forbidden } from "@/src/shared-kernel/domain-error";

/**
 * Who may hand out which rights (ADR CM-0003). The Owner may grant anything.
 * A Member who manages Team Members may grant only cells they hold
 * themselves, and never changes their own matrix — otherwise "edit Team
 * Members" would be "do anything".
 */
export function assertCanGrant(
  grantor: MemberAccess,
  permissions: PermissionSet,
  target: { userId: string | null },
): void {
  if (grantor.role === "owner") return;
  if (target.userId != null && target.userId === grantor.userId)
    throw forbidden(
      "CANNOT_CHANGE_OWN_PERMISSIONS",
      "You cannot change your own Permission Matrix. Ask the Owner.",
    );
  for (const [menu, mask] of Object.entries(permissions.toMasks())) {
    const own = grantor.permissions.toMasks()[menu] ?? 0;
    const extra = mask & ~own;
    if (extra !== 0)
      throw forbidden(
        "CANNOT_GRANT_MORE_THAN_YOU_HAVE",
        `You can only grant rights you hold yourself (${menu}: ${fromMask(extra).join(", ")}).`,
      );
  }
}
