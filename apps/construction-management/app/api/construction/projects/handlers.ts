import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createProjectHandlers } from "@/src/projects/infrastructure/create-project-handlers";
import { can, type MemberAccess } from "@/src/shared-kernel/access";

/**
 * One composition for every projects route. The plan limits (CM-118) are
 * the organization context's; the routes are where contexts meet.
 */
export const projectHandlers = createProjectHandlers({
  plan: createPlanGate(),
});

/**
 * The order value (CM-413) needs the Project menu's Financial flag: to see
 * it in a response and to set it on the form. The Owner has every flag.
 */
export function projectFinancial(access: MemberAccess): boolean {
  return can(access, "projects.project", "financial");
}
