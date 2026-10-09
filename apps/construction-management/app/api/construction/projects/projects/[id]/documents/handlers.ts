import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createProjectDocuments } from "@/src/projects/infrastructure/create-project-documents";

/**
 * One composition for the Project document routes (CM-414). Storage limits
 * are the organization context's plan; the routes are where contexts meet.
 */
export const projectDocuments = createProjectDocuments({
  plan: createPlanGate(),
});
