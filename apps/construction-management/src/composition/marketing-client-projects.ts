import type { ClientProjects } from "@/src/marketing/application/ports";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { sameClientName } from "@/src/projects/domain/client-groups";
import { createProjectHandlers } from "@/src/projects/infrastructure/create-project-handlers";

/**
 * A Prospect Company's Projects (ADR CM-0040 §12), read through the
 * projects context's own list, so the viewer sees only the Projects they
 * may open: the Owner every one, a member those assigned to them. The
 * match is CM-0027's client-name rule; nothing is stored.
 */
export function createClientProjects(
  projects = createProjectHandlers({ plan: createPlanGate() }),
): ClientProjects {
  return {
    async forClient(access, clientName) {
      const { items } = await projects.list(access);
      return items
        .filter((project) => sameClientName(project.clientName, clientName))
        .map(({ id, name, status }) => ({ id, name, status }));
    },
  };
}

export const marketingClientProjects = createClientProjects();
