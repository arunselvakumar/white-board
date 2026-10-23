import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { messagingEvents } from "@/src/composition/messaging";
import { EscalationBillHandlers } from "@/src/contracts/application/escalation-bill-handlers";
import { EscalationClauseHandlers } from "@/src/contracts/application/escalation-clause-handlers";
import type { EscalationDeps } from "@/src/contracts/application/escalation-ports";
import { PriceIndexHandlers } from "@/src/contracts/application/price-index-handlers";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaClientBillStore } from "@/src/contracts/infrastructure/prisma-client-bill-store";
import { PrismaContractorBillStore } from "@/src/contracts/infrastructure/prisma-contractor-bill-store";
import {
  PrismaEscalationBillStore,
  PrismaEscalationClauseStore,
  PrismaPriceIndexStore,
} from "@/src/contracts/infrastructure/prisma-escalation-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import type { EscalationComponent } from "@/src/contracts/domain/contract-terms";
import { companyToday } from "@/src/shared-kernel/company-today";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

import { contractsPartyInvoicing } from "./contracts-party-invoicing";
import { reconciliationHandlers } from "./contracts-reconciliation";

/**
 * Price indices, escalation clauses and escalation bills (CM-1109) wired
 * to Prisma, the BOQ lock, the Work Order and RA bill stores (retention
 * held, the client contract's terms), the contracts directory, finance
 * (the invoice through `PartyInvoicing`), the Back-dated Entry policy and
 * messaging (`document.*` with the escalation approval types).
 */
export function createEscalationDeps(): EscalationDeps {
  const clauses = new PrismaEscalationClauseStore();
  return {
    db: prisma,
    indices: new PrismaPriceIndexStore(),
    clauses,
    bills: new PrismaEscalationBillStore(),
    boq: new PrismaBoqStore(),
    workOrders: new PrismaWorkOrderStore(),
    contractorBills: new PrismaContractorBillStore(),
    clientBills: new PrismaClientBillStore(),
    directory: contractsDirectory,
    invoicing: contractsPartyInvoicing(),
    // CM-1110: the 10CA quantities from material reconciliation — the
    // theoretical consumption of each quantity component's Material by
    // work billed in the period. Typed quantities on the draft override.
    materialQuantities: async (db, { workspaceId, contract, period }) => {
      const clause = await clauses.forContract(db, workspaceId, contract);
      if (clause == null) return new Map();
      const quantities = await reconciliationHandlers.periodQuantities(
        db,
        workspaceId,
        contract,
        period,
        clause.terms.components.filter((row) => row.basis === "quantity"),
      );
      return new Map(
        [...quantities].map(
          ([component, quantity]) =>
            [component as EscalationComponent, quantity] as const,
        ),
      );
    },
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

const deps = createEscalationDeps();

export const priceIndexHandlers = new PriceIndexHandlers({
  db: prisma,
  store: deps.indices,
});
export const escalationClauseHandlers = new EscalationClauseHandlers(deps);
export const escalationBillHandlers = new EscalationBillHandlers(deps);
