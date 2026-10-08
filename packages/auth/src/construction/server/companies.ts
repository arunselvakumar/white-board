import { prisma } from "@repo/db";

import { COMPANY_WORKSPACE_KIND, parseCompanyRole } from "../roles";
import type { CompanySummary } from "../types";
import { constructionAuth } from "./auth";

/**
 * Server-side Company membership (ADR CM-0002). Routes have already checked
 * the Session; these never trust a caller for anything but ids.
 */
export const companies = {
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
