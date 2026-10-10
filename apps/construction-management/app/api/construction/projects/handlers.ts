import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import type { ProjectHomeReadModel } from "@/src/projects/application/project-home-handlers";
import {
  createProjectHandlers,
  createProjectHomeHandlers,
  createProjectLogos,
} from "@/src/projects/infrastructure/create-project-handlers";
import { can, isMenuKey, type MemberAccess } from "@/src/shared-kernel/access";

/**
 * One composition for every projects route. The plan limits (CM-118) are
 * the organization context's; the routes are where contexts meet.
 */
export const projectHandlers = createProjectHandlers({
  plan: createPlanGate(),
});

/** The Project logo (CM-401); its storage counts against the plan. */
export const projectLogos = createProjectLogos({ plan: createPlanGate() });

/**
 * The order value (CM-413) and the budget (CM-401) need the Project menu's
 * Financial flag: to see them in a response and to set them on the form.
 * The Owner has every flag.
 */
export function projectFinancial(access: MemberAccess): boolean {
  return can(access, "projects.project", "financial");
}

/** The Project home and member preferences (CM-411, CM-412). */
export const projectHome = createProjectHomeHandlers();

/**
 * A Project's home for this member: each module by Read on its menu on
 * this Project; hidden modules marked for those with the Project menu's
 * Update flag, left out for everyone else.
 */
export function projectHomeFor(
  access: MemberAccess,
  projectId: string,
): Promise<ProjectHomeReadModel> {
  return projectHome.home({
    viewer: access,
    projectId,
    canRead: (menu) =>
      isMenuKey(menu) && can(access, menu, "read", { projectId }),
    canUpdate: can(access, "projects.project", "update", { projectId }),
  });
}
