import { randomBytes } from "node:crypto";

import { prisma } from "@repo/db";

import { COMPANY_WORKSPACE_KIND, parseCompanyRole } from "../roles";
import type { CompanySummary } from "../types";
import { constructionAuth } from "./auth";

/**
 * Server-side Company membership (ADR CM-0002). Routes have already checked
 * the Session; these never trust a caller for anything but ids.
 */
function slugFor(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(5).toString("hex");
  return base.length > 0 ? `${base}-${suffix}` : `company-${suffix}`;
}

export const companies = {
  /** Creates a Company (Workspace) with `ownerUserId` as its `owner` member. */
  async create(input: {
    name: string;
    ownerUserId: string;
  }): Promise<{ workspaceId: string }> {
    const company = await constructionAuth.api.createOrganization({
      body: {
        name: input.name.trim(),
        slug: slugFor(input.name),
        institutionType: COMPANY_WORKSPACE_KIND,
        userId: input.ownerUserId,
      },
    });
    return { workspaceId: company.id };
  },

  /**
   * Deletes a Company's Workspace and memberships. Only for undoing a
   * creation that failed half-way; Companies are never deleted otherwise.
   */
  async deleteCreated(workspaceId: string): Promise<void> {
    await prisma.identityWorkspace.deleteMany({
      where: { id: workspaceId, institutionType: COMPANY_WORKSPACE_KIND },
    });
  },

  /** Renames a Company's Workspace (the name the switcher shows). */
  async rename(workspaceId: string, name: string): Promise<void> {
    await prisma.identityWorkspace.updateMany({
      where: { id: workspaceId, institutionType: COMPANY_WORKSPACE_KIND },
      data: { name: name.trim() },
    });
  },

  /** The Companies a User belongs to, by name. */
  async listForUser(userId: string): Promise<CompanySummary[]> {
    const memberships = await prisma.identityWorkspaceMember.findMany({
      where: {
        userId,
        workspace: { institutionType: COMPANY_WORKSPACE_KIND },
      },
      select: {
        role: true,
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { workspace: { name: "asc" } },
    });
    return memberships.flatMap((membership) => {
      const role = parseCompanyRole(membership.role);
      return role == null ? [] : [{ ...membership.workspace, role }];
    });
  },

  /**
   * Makes a Company the Session's Active Company. Returns the response
   * headers Better Auth produced (session cookies) for the caller to forward.
   */
  async activate(
    requestHeaders: Headers,
    workspaceId: string,
  ): Promise<Headers> {
    const { headers } = await constructionAuth.api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId: workspaceId },
      returnHeaders: true,
    });
    return headers;
  },
};
