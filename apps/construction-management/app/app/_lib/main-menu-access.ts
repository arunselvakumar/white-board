import { protectCompany } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { cache } from "react";

import type { MainMenuAccess } from "@/app/app/_components/app-shell/main-menu-areas";
import { NO_MARKETING_ACCESS } from "@/lib/marketing-nav";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/**
 * What the signed-in Team Member's Role lets the main menu show, read once
 * per request for the shell and for Home (ADR CM-0039). The Dashboard needs
 * the Dashboard menu's Read; the Staff group of Human Resources needs Team
 * Members or Role Management Read (ADR CM-0030, ADR CM-0034); each
 * Marketing entry needs its own menu's Read, and Reports the Report flag on
 * Visits (ADR CM-0040 §1). Only a hint: every page and route checks again.
 */
export const mainMenuAccess = cache(async (): Promise<MainMenuAccess> => {
  const auth = await protectCompany();
  if (auth.workspaceId == null || auth.role == null)
    return {
      canOpenDashboard: false,
      canOpenStaffRoles: false,
      marketing: NO_MARKETING_ACCESS,
    };
  const access = await loadMemberAccess(prisma, {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    role: auth.role,
  });
  return {
    canOpenDashboard: can(access, "reporting.project_dashboard", "read"),
    canOpenStaffRoles:
      can(access, "organization.team_members", "read") ||
      can(access, "organization.roles", "read"),
    marketing: {
      dashboard: can(access, "marketing.dashboard", "read"),
      visits: can(access, "marketing.visits", "read"),
      followUps: can(access, "marketing.follow_ups", "read"),
      companies: can(access, "marketing.companies", "read"),
      team: can(access, "marketing.team", "read"),
      reports: can(access, "marketing.visits", "report"),
    },
  };
});
