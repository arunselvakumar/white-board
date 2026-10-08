import {
  getCompanyAuthFromHeaders,
  type CompanyAuthUser,
  type CompanyRole,
} from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "./json-error";

export type CompanySession = {
  userId: string;
  /** The Active Company. */
  workspaceId: string;
  role: CompanyRole;
  user: CompanyAuthUser;
};

/**
 * The API gate (root ADR-0013, ADR-0014): no Session → 401
 * `UNAUTHENTICATED`, no Active Company → 403 `NO_ACTIVE_COMPANY`. The role
 * is read from the member row on every request.
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
  if (state.workspaceId == null || state.role == null)
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NO_ACTIVE_COMPANY",
      "An active Company is required.",
    );
  return {
    userId: state.userId,
    workspaceId: state.workspaceId,
    role: state.role,
    user: state.user,
  };
}

export type UserSession = { userId: string; user: CompanyAuthUser };

/**
 * A signed-in User, with or without an Active Company: creating, listing
 * and switching Companies. 401 `UNAUTHENTICATED` otherwise.
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
  return { userId: state.userId, user: state.user };
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
