import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createProjectHandlers } from "@/src/projects/infrastructure/create-project-handlers";

/**
 * One composition for every projects route. The plan limits (CM-118) are
 * the organization context's; the routes are where contexts meet.
 */
export const projectHandlers = createProjectHandlers({
  plan: createPlanGate(),
});
