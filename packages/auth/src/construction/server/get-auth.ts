import { prisma } from "@repo/construction-db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { COMPANY_WORKSPACE_KIND, parseCompanyRole } from "../roles";
import type {
  CompanyAuthSnapshot,
  CompanyAuthState,
  SignedInCompanyAuthState,
} from "../types";
import { constructionAuth } from "./auth";
import { companies } from "./companies";

export const SIGNED_OUT_OF_COMPANY: CompanyAuthState = {
  isAuthenticated: false,
  userId: null,
  sessionId: null,
  workspaceId: null,
  role: null,
  user: null,
};

/**
 * The Session behind a request. The Active Company and role come from the
 * member row on every call, so a removed Team Member loses access on their
 * next request even though their Session is still valid.
 */
export async function getCompanyAuthFromHeaders(
  requestHeaders: Headers,
): Promise<CompanyAuthState> {
  const result = await constructionAuth.api.getSession({
    headers: requestHeaders,
  });
  if (result == null) return SIGNED_OUT_OF_COMPANY;
  const { session, user } = result;

  let workspaceId: string | null = null;
  let role: SignedInCompanyAuthState["role"] = null;
  const activeWorkspaceId = session.activeOrganizationId ?? null;
  if (activeWorkspaceId != null) {
    const member = await prisma.identityWorkspaceMember.findFirst({
      where: {
        organizationId: activeWorkspaceId,
        userId: user.id,
        workspace: { institutionType: COMPANY_WORKSPACE_KIND },
      },
      select: { role: true },
    });
    role = parseCompanyRole(member?.role);
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
      phoneNumber:
        user.phoneNumberVerified === true ? (user.phoneNumber ?? null) : null,
      image: user.image ?? null,
    },
  };
}

/** `getCompanyAuthFromHeaders` for the current request, once per render. */
export const getCompanyAuth = cache(async (): Promise<CompanyAuthState> =>
  getCompanyAuthFromHeaders(await headers()),
);

/** Guard for layouts and pages; the proxy is the optimistic first check. */
export async function protectCompany(): Promise<SignedInCompanyAuthState> {
  const state = await getCompanyAuth();
  if (!state.isAuthenticated) redirect("/sign-in");
  return state;
}

/** What the root layout hands `<CompanyAuthProvider>`. */
export async function getCompanyAuthSnapshot(): Promise<CompanyAuthSnapshot> {
  const state = await getCompanyAuth();
  return {
    userId: state.userId,
    workspaceId: state.workspaceId,
    role: state.role,
    user: state.user,
    companies:
      state.userId == null ? [] : await companies.listForUser(state.userId),
  };
}
