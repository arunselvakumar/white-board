import { prisma } from "@repo/construction-db";

import { VisitFiles } from "@/src/marketing/application/visit-files";
import { PrismaVisitFileStore } from "@/src/marketing/infrastructure/prisma-visit-file-store";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { marketingTeam } from "./marketing-team";
import { visitHandlers } from "./marketing-visits";

/**
 * A Visit's photos and files (ADR CM-0040 §9): the Visit and its scope
 * from the Visit handlers, storage limits from the organization context's
 * plan, names from the team.
 */
export const visitFiles = new VisitFiles({
  visit: (access, visitId) => visitHandlers.find(access, visitId),
  store: new PrismaVisitFileStore(prisma),
  names: (workspaceId, userIds) =>
    marketingTeam.userNames(workspaceId, userIds),
  storage: objectStorage(),
  plan: createPlanGate(),
});
