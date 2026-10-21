import { projectClientUsage } from "@/src/composition/project-clients";
import { createClientHandlers } from "@/src/masters/infrastructure/prisma-client-store";

export { CLIENTS_MENU } from "@/src/masters/application/client-handlers";

/**
 * Client handlers (CM-1101), wired once for every route. The delete guard
 * reads Projects through the composition root (ADR CM-0023 §2).
 */
export const clientHandlers = createClientHandlers({
  usage: projectClientUsage(),
});
