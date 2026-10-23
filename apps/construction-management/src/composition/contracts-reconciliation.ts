import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { ReconciliationHandlers } from "@/src/contracts/application/reconciliation-handlers";
import { PrismaReconciliationStore } from "@/src/contracts/infrastructure/prisma-reconciliation-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";

import { contractsMaterialIssues } from "./contracts-material-issues";

/**
 * Material reconciliation (CM-1110) wired to Prisma, the Work Order store
 * (materials and coefficients), the contracts directory (material names)
 * and procurement's issues through `contractsMaterialIssues`.
 */
export const reconciliationHandlers = new ReconciliationHandlers({
  db: prisma,
  store: new PrismaReconciliationStore(),
  workOrders: new PrismaWorkOrderStore(),
  issues: contractsMaterialIssues,
  directory: contractsDirectory,
});
