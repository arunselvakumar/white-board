import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import {
  createProjectHandlers,
  createProjectLogos,
} from "@/src/projects/infrastructure/create-project-handlers";
import { can, type MemberAccess } from "@/src/shared-kernel/access";

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
