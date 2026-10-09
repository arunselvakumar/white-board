import { prisma } from "@repo/whiteboard-db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { parseWorkspaceRole } from "../roles";
import type { AuthSnapshot, AuthState, SignedInAuthState } from "../types";
import { auth } from "./auth";
import { workspaces } from "./workspaces";

export const SIGNED_OUT: AuthState = {
  isAuthenticated: false,
  userId: null,
  sessionId: null,
  workspaceId: null,
  role: null,
  user: null,
};

/**
 * The Session behind a request, Clerk-`auth()`-style. The Active Workspace
 * and role come from the member row on every call, so a removed member loses
 * access on their next request even though their Session is still valid.
 */
export async function getAuthFromHeaders(
  requestHeaders: Headers,
): Promise<AuthState> {
  const result = await auth.api.getSession({ headers: requestHeaders });
  if (result == null) return SIGNED_OUT;
  const { session, user } = result;

  let workspaceId: string | null = null;
  let role: SignedInAuthState["role"] = null;
  const activeWorkspaceId = session.activeOrganizationId ?? null;
  if (activeWorkspaceId != null) {
    const member = await prisma.identityWorkspaceMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: activeWorkspaceId,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    role = parseWorkspaceRole(member?.role);
    if (role != null) workspaceId = activeWorkspaceId;
  }

  return {
    isAuthenticated: true,
    userId: user.id,
    sessionId: session.id,
    workspaceId,
    role,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      username: user.username ?? null,
      image: user.image ?? null,
    },
  };
}

/** `getAuthFromHeaders` for the current request, once per render. */
export const getAuth = cache(async (): Promise<AuthState> =>
  getAuthFromHeaders(await headers()),
);

/**
 * Clerk-`auth.protect()`-style guard for layouts and pages. The proxy sends
 * signed-out Users to Sign-in with a Redirect URL first; this is the backstop.
 */
export async function protect(): Promise<SignedInAuthState> {
  const state = await getAuth();
  if (!state.isAuthenticated) redirect("/login");
  return state;
}

/** What the root layout hands `<AuthProvider>`. */
export async function getAuthSnapshot(): Promise<AuthSnapshot> {
  const state = await getAuth();
  return {
    userId: state.userId,
    workspaceId: state.workspaceId,
    role: state.role,
    user: state.user,
    workspaces:
      state.userId == null ? [] : await workspaces.listForUser(state.userId),
  };
}
