import {
  getCompanyAuthFromHeaders,
  type CompanyAuthUser,
  type CompanyRole,
} from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";

import { requireCompanyNotBeingDeleted } from "./company-deletion-guard";
import { jsonError } from "./json-error";

export type CompanySession = {
  userId: string;
  /** The Better Auth session behind the request (Devices, reveal codes). */
  sessionId: string;
  /** The Active Company. */
  workspaceId: string;
  role: CompanyRole;
  user: CompanyAuthUser;
};

/**
 * 403 `PASSWORD_CHANGE_REQUIRED` while an admin-set password waits to be
 * changed (ADR CM-0029 §8). Only the auth routes (change password, sign
 * out, the session) stay open; they do not come through these guards.
 */
export function passwordChangeRequired(user: CompanyAuthUser): Response | null {
  if (!user.mustChangePassword) return null;
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PASSWORD_CHANGE_REQUIRED",
    "Change the password you were given before you continue.",
  );
}

/**
 * The API gate (root ADR-0013, ADR-0014): no Session → 401
 * `UNAUTHENTICATED`, an admin-set password not yet changed → 403
 * `PASSWORD_CHANGE_REQUIRED`, no Active Company → 403 `NO_ACTIVE_COMPANY`. The role
 * is read from the member row on every request. A write to a Company that
 * waits to be deleted answers 409 `COMPANY_DELETION_SCHEDULED` unless it
 * is one of the writes left open (CM-907, `company-deletion-guard.ts`).
 */
export async function requireCompanySession(
  request: Request,
): Promise<CompanySession | Response> {
  const state = await getCompanyAuthFromHeaders(request.headers);
  if (!state.isAuthenticated)
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  const changePassword = passwordChangeRequired(state.user);
  if (changePassword != null) return changePassword;
  if (state.workspaceId == null || state.role == null)
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NO_ACTIVE_COMPANY",
      "An active Company is required.",
    );
  const deleting = await requireCompanyNotBeingDeleted(
    request,
    state.workspaceId,
  );
  if (deleting != null) return deleting;
  return {
    userId: state.userId,
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    role: state.role,
    user: state.user,
  };
}

export type UserSession = {
  userId: string;
  sessionId: string;
  user: CompanyAuthUser;
};

/**
 * A signed-in User, with or without an Active Company: creating, listing
 * and switching Companies. 401 `UNAUTHENTICATED` otherwise, and 403
 * `PASSWORD_CHANGE_REQUIRED` as `requireCompanySession`.
 */
export async function requireUserSession(
  request: Request,
): Promise<UserSession | Response> {
  const state = await getCompanyAuthFromHeaders(request.headers);
  if (!state.isAuthenticated)
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  const changePassword = passwordChangeRequired(state.user);
  if (changePassword != null) return changePassword;
  return {
    userId: state.userId,
    sessionId: state.sessionId,
    user: state.user,
  };
}

/** The Owner of the Active Company. Used until the Permission Matrix exists. */
export async function requireOwnerSession(
  request: Request,
): Promise<CompanySession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  if (session.role !== "owner")
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "Only the Owner can do this.",
    );
  return session;
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
