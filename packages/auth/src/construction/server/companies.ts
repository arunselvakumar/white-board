import { prisma } from "@repo/db";

import { COMPANY_WORKSPACE_KIND, parseCompanyRole } from "../roles";
import type { CompanySummary } from "../types";

/**
 * Server-side Company membership reads (ADR CM-0002). Company creation,
 * invitations and switching arrive with M1.
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
};
