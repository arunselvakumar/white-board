import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { messagingEvents } from "@/src/composition/messaging";
import { BoqHandlers } from "@/src/contracts/application/boq-handlers";
import type { BoqDeps } from "@/src/contracts/application/boq-ports";
import { VariationHandlers } from "@/src/contracts/application/variation-handlers";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { companyToday } from "@/src/shared-kernel/company-today";

/**
 * The BOQ and its Variations (CM-1103) wired to Prisma, the contracts
 * directory and messaging: a Variation raises `document.submitted`, then
 * `document.approved` or `document.rejected` (approval type `variation`).
 */
export function createBoqDeps(): BoqDeps {
  return {
    db: prisma,
    store: new PrismaBoqStore(),
    directory: contractsDirectory,
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

const deps = createBoqDeps();

/** One set of handlers for every BOQ route. */
export const boqHandlers = new BoqHandlers(deps);
export const variationHandlers = new VariationHandlers(deps);
