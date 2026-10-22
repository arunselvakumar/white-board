import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { messagingEvents } from "@/src/composition/messaging";
import { ContractorBillHandlers } from "@/src/contracts/application/contractor-bill-handlers";
import type { ContractorBillDeps } from "@/src/contracts/application/contractor-bill-ports";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaContractorBillStore } from "@/src/contracts/infrastructure/prisma-contractor-bill-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import { companyToday } from "@/src/shared-kernel/company-today";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

import { projectLocationLabeller } from "./progress-report-source";
import {
  contractorTdsEstimate,
  contractsPartyInvoicing,
} from "./contracts-party-invoicing";

/**
 * Contractor Bills (CM-1106) wired to Prisma, the BOQ lock, the Work Order
 * store, the contracts directory, finance (the payable invoice and the
 * TDS estimate), the Back-dated Entry policy and messaging
 * (`document.submitted|approved|rejected`, approval type
 * `contractor_bill`).
 */
export function createContractorBillDeps(): ContractorBillDeps {
  return {
    db: prisma,
    store: new PrismaContractorBillStore(),
    boq: new PrismaBoqStore(),
    workOrders: new PrismaWorkOrderStore(),
    directory: contractsDirectory,
    invoicing: contractsPartyInvoicing(),
    tds: contractorTdsEstimate,
    locationLabels: (workspaceId, projectId) =>
      projectLocationLabeller(workspaceId, projectId),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

/** One set of handlers for every Contractor Bill route. */
export const contractorBillHandlers = new ContractorBillHandlers(
  createContractorBillDeps(),
);
