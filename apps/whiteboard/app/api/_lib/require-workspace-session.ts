import { getAuth, type AuthUser, type WorkspaceRole } from "@repo/auth/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "./json-error";

export type WorkspaceSession<Role extends WorkspaceRole = WorkspaceRole> = {
  userId: string;
  workspaceId: string;
  role: Role;
  user: AuthUser;
};

/**
 * The single API gate (ADR-0013, ADR-0014, ADR-0034): no Session → 401, no
 * Active Workspace → 403 `NO_ACTIVE_WORKSPACE`, a role outside `roles` →
 * 403 `FORBIDDEN`. The role is read from the member row on every request.
 */
export async function requireWorkspaceSession<const Role extends WorkspaceRole>(
  roles: readonly Role[],
  forbiddenMessage: string,
): Promise<WorkspaceSession<Role> | Response> {
  const state = await getAuth();
  if (!state.isAuthenticated)
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  if (state.workspaceId == null || state.role == null)
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NO_ACTIVE_WORKSPACE",
      "An active workspace is required.",
    );
  if (!(roles as readonly WorkspaceRole[]).includes(state.role))
    return jsonError(StatusCodes.FORBIDDEN, "FORBIDDEN", forbiddenMessage);
  return {
    userId: state.userId,
    workspaceId: state.workspaceId,
    role: state.role as Role,
    user: state.user,
  };
}

/** The verified email a Student or Parent User is linked to Students by. */
export function verifiedEmailsOf(user: AuthUser): string[] {
  return user.emailVerified ? [user.email] : [];
}
