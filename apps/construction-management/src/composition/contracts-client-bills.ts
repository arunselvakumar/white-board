import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { messagingEvents } from "@/src/composition/messaging";
import { ClientBillHandlers } from "@/src/contracts/application/client-bill-handlers";
import type { ClientBillDeps } from "@/src/contracts/application/client-bill-ports";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaClientBillStore } from "@/src/contracts/infrastructure/prisma-client-bill-store";
import { companyToday } from "@/src/shared-kernel/company-today";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

import { contractsPartyInvoicing } from "./contracts-party-invoicing";
import { projectLocationLabeller } from "./progress-report-source";

/**
 * Client Bills (CM-1107) wired to Prisma, the BOQ lock and items, the
 * contracts directory (the Project, its Client and the Company's billing
 * addresses), finance (the receivable invoice to the Client), the
 * Back-dated Entry policy and messaging (`document.submitted|approved|
 * rejected`, approval type `client_bill`).
 */
export function createClientBillDeps(): ClientBillDeps {
  return {
    db: prisma,
    store: new PrismaClientBillStore(),
    boq: new PrismaBoqStore(),
    directory: contractsDirectory,
    invoicing: contractsPartyInvoicing(),
    locationLabels: (workspaceId, projectId) =>
      projectLocationLabeller(workspaceId, projectId),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

/** One set of handlers for every Client Bill route. */
export const clientBillHandlers = new ClientBillHandlers(
  createClientBillDeps(),
);
