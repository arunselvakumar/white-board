import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { FeeAccountHandlers } from "../application/fee-account-handlers";
import { FeeHeadHandlers } from "../application/fee-head-handlers";
import { FeePaymentHandlers } from "../application/fee-payment-handlers";
import { FeeReportHandlers } from "../application/fee-report-handlers";
import { FeeStructureHandlers } from "../application/fee-structure-handlers";
import { PrismaFeeAccountStore } from "./prisma-fee-account-store";
import { PrismaFeeHeadStore } from "./prisma-fee-head-store";
import { PrismaFeeInvoiceGenerator } from "./prisma-fee-invoice-generator";
import { PrismaFeePaymentStore } from "./prisma-fee-payment-store";
import { PrismaFeeReportStore } from "./prisma-fee-report-store";
import { PrismaFeeStructureStore } from "./prisma-fee-structure-store";

export type FeeHandlers = {
  heads: FeeHeadHandlers;
  structures: FeeStructureHandlers;
  accounts: FeeAccountHandlers;
  payments: FeePaymentHandlers;
  reports: FeeReportHandlers;
};

export function createFeeHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): FeeHandlers {
  const db = deps?.prisma ?? prisma;
  const now = deps?.now ?? (() => new Date());
  const structures = new PrismaFeeStructureStore(db);
  const accounts = new PrismaFeeAccountStore(db);
  return {
    heads: new FeeHeadHandlers({ store: new PrismaFeeHeadStore(db), now }),
    structures: new FeeStructureHandlers({ store: structures }),
    accounts: new FeeAccountHandlers({
      store: accounts,
      generator: new PrismaFeeInvoiceGenerator(db),
      now,
    }),
    payments: new FeePaymentHandlers({
      payments: new PrismaFeePaymentStore(db),
      accounts,
      structures,
      now,
    }),
    reports: new FeeReportHandlers({
      store: new PrismaFeeReportStore(db),
      now,
    }),
  };
}
