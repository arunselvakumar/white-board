import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { AdvanceHandlers } from "@/src/contracts/application/advance-handlers";
import type { AdvanceDeps } from "@/src/contracts/application/advance-ports";
import { PrismaAdvanceStore } from "@/src/contracts/infrastructure/prisma-advance-store";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaClientBillStore } from "@/src/contracts/infrastructure/prisma-client-bill-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import { companyToday } from "@/src/shared-kernel/company-today";

import {
  contractsAdvancePayments,
  contractsPartyInvoicing,
} from "./contracts-party-invoicing";

/**
 * Advances, bank guarantees, retention release and DLP (CM-1108) wired to
 * Prisma, the BOQ lock, the Work Order and client contract stores, the
 * contracts directory and finance (the advance's payment or receipt, and
 * the release's invoice).
 */
export function createAdvanceDeps(): AdvanceDeps {
  return {
    db: prisma,
    store: new PrismaAdvanceStore(),
    boq: new PrismaBoqStore(),
    workOrders: new PrismaWorkOrderStore(),
    clientBills: new PrismaClientBillStore(),
    directory: contractsDirectory,
    invoicing: contractsPartyInvoicing(),
    payments: contractsAdvancePayments(),
    today: (workspaceId) => companyToday(prisma, workspaceId),
  };
}

/** One set of handlers for every advance, guarantee and release route. */
export const advanceHandlers = new AdvanceHandlers(createAdvanceDeps());
