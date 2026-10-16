import { randomBytes } from "node:crypto";

import { prisma, type Prisma } from "@repo/construction-db";

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

  /**
   * Adds a User to a Company as a `member` (a Join Request was accepted,
   * ADR CM-0002). Does nothing if they are already in it.
   */
  async addMember(input: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    const existing = await prisma.identityWorkspaceMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.workspaceId,
          userId: input.userId,
        },
      },
      select: { id: true },
    });
    if (existing != null) return;
    await constructionAuth.api.addMember({
      body: {
        userId: input.userId,
        role: "member",
        organizationId: input.workspaceId,
      },
    });
  },

  /** The Companies the User is the Owner of, by name. */
  async ownedBy(userId: string): Promise<CompanySummary[]> {
    const all = await companies.listForUser(userId);
    return all.filter((company) => company.role === "owner");
  },

  /**
   * Makes `toUserId` the Company's `owner` and `fromUserId` a `member`
   * (Transfer ownership, CM-907). There is one Owner at a time (ADR
   * CM-0002). Pass the caller's transaction so the Team Member changes
   * commit with it. Throws unless `fromUserId` is the Owner and
   * `toUserId` a member.
   */
  async transferOwnership(
    input: { workspaceId: string; fromUserId: string; toUserId: string },
    db: Prisma.TransactionClient = prisma,
  ): Promise<void> {
    const demoted = await db.identityWorkspaceMember.updateMany({
      where: {
        organizationId: input.workspaceId,
        userId: input.fromUserId,
        role: "owner",
      },
      data: { role: "member" },
    });
    const promoted = await db.identityWorkspaceMember.updateMany({
      where: {
        organizationId: input.workspaceId,
        userId: input.toUserId,
        role: "member",
      },
      data: { role: "owner" },
    });
    if (demoted.count !== 1 || promoted.count !== 1)
      throw new Error("Ownership can pass only from the Owner to a member.");
  },

  /**
   * Takes the User out of every Company they are a `member` of (Delete My
   * Account, CM-907); an Owner's memberships stay. Returns those
   * Companies' ids.
   */
  async leaveAll(
    userId: string,
    db: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const memberships = await db.identityWorkspaceMember.findMany({
      where: {
        userId,
        role: { not: "owner" },
        workspace: { institutionType: COMPANY_WORKSPACE_KIND },
      },
      select: { id: true, organizationId: true },
    });
    if (memberships.length === 0) return [];
    await db.identityWorkspaceMember.deleteMany({
      where: { id: { in: memberships.map((row) => row.id) } },
    });
    return memberships.map((row) => row.organizationId);
  },

  /**
   * Deletes a Company's Workspace for good (its deletion came due,
   * CM-907): its memberships and invitations go with it, and no Session
   * points at it any more.
   */
  async purge(workspaceId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.identitySession.updateMany({
        where: { activeOrganizationId: workspaceId },
        data: { activeOrganizationId: null },
      });
      await tx.identityWorkspaceInvitation.deleteMany({
        where: { organizationId: workspaceId },
      });
      await tx.identityWorkspaceMember.deleteMany({
        where: { organizationId: workspaceId },
      });
      await tx.identityWorkspace.deleteMany({
        where: { id: workspaceId, institutionType: COMPANY_WORKSPACE_KIND },
      });
    });
  },

  /**
   * Removes a Member (never the Owner). Their Sessions stop pointing at the
   * Company, so access ends on their next request.
   */
  async removeMember(input: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.identityWorkspaceMember.deleteMany({
        where: {
          organizationId: input.workspaceId,
          userId: input.userId,
          role: { not: "owner" },
        },
      });
      if (removed.count === 0) return;
      await tx.identitySession.updateMany({
        where: {
          userId: input.userId,
          activeOrganizationId: input.workspaceId,
        },
        data: { activeOrganizationId: null },
      });
    });
  },
};
