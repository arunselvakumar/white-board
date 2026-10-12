import { prisma, type PrismaClient } from "@repo/construction-db";

import { companyToday } from "@/src/shared-kernel/company-today";

import { GoodsReceiptInvoices } from "../application/goods-receipt-invoices";
import { InvoiceHandlers } from "../application/invoice-handlers";
import { PartyOpeningHandlers } from "../application/party-opening-handlers";
import { PartyPaymentHandlers } from "../application/party-payment-handlers";
import type { PartyFinanceDeps } from "../application/party-ports";
import { PartyQueries } from "../application/party-queries";
import type { FinanceDirectory } from "../application/ports";
import { SettlementHandlers } from "../application/settlement-handlers";
import { lockedAccountFacts } from "./account-facts";
import { accountLedger } from "./account-ledger";
import { loadPartyBackdated } from "./party-backdated";
import { partyLedger } from "./party-ledger";
import { prismaPartyStore } from "./prisma-party-store";
import { loadTdsRates } from "./tds-rate-store";

/**
 * The party money engine over Prisma (CM-705, CM-706, CM-708): invoices,
 * payments, openings, settlements, the queries over the party ledger and
 * the GRN → supplier invoice sync. The directory is the composition
 * root's (`src/composition/finance-directory.ts`).
 */
export function createPartyFinance(deps: {
  directory: FinanceDirectory;
  prisma?: PrismaClient;
  clock?: () => Date;
}) {
  const db = deps.prisma ?? prisma;
  const base: PartyFinanceDeps = {
    db,
    directory: deps.directory,
    store: prismaPartyStore,
    ledgers: { party: partyLedger, account: accountLedger },
    backdated: (actor) => loadPartyBackdated(db, actor),
    today: (workspaceId) => companyToday(db, workspaceId),
    accountFacts: (tx, workspaceId, accountId) =>
      lockedAccountFacts(tx, deps.directory, workspaceId, accountId),
    tdsRates: loadTdsRates,
    clock: deps.clock,
  };
  const invoices = new InvoiceHandlers(base);
  return {
    invoices,
    payments: new PartyPaymentHandlers(base),
    openings: new PartyOpeningHandlers(base),
    settlements: new SettlementHandlers(base),
    queries: new PartyQueries(base, invoices),
    goodsReceipts: new GoodsReceiptInvoices(base),
  };
}

export type PartyFinance = ReturnType<typeof createPartyFinance>;
