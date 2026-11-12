import { cache } from "react";

import type { MainMenuAccess } from "@/app/app/_components/app-shell/main-menu-areas";

import { viewerCan } from "./viewer-can";

/**
 * What the signed-in Team Member's Role lets the main menu show, read once
 * per request for the shell and for Home (ADR CM-0039). The Dashboard needs
 * the Dashboard menu's Read; the Staff group of Human Resources needs Team
 * Members or Role Management Read (ADR CM-0030, ADR CM-0034).
 */
export const mainMenuAccess = cache(async (): Promise<MainMenuAccess> => {
  const [dashboard, teamMembers, roles] = await Promise.all([
    viewerCan("reporting.project_dashboard", "read"),
    viewerCan("organization.team_members", "read"),
    viewerCan("organization.roles", "read"),
  ]);
  return {
    canOpenDashboard: dashboard,
    canOpenStaffRoles: teamMembers || roles,
  };
});
