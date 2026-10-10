import { prisma, type PrismaClient } from "@repo/construction-db";

import { companyToday } from "@/src/shared-kernel/company-today";
import {
  InProcessEventDispatcher,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

import { GoodsReceiptHandlers } from "../application/goods-receipt-handlers";
import {
  NOT_PAID,
  type GoodsReceiptPayments,
  type ProcurementDirectory,
} from "../application/ports";
import { PrismaGoodsReceiptStore } from "./prisma-goods-receipt-store";
import { loadBackdatedCheck } from "./procurement-guards";
import { stockLedger } from "./stock-ledger-instance";

/**
 * Goods Receipts (CM-505) over Prisma. The directory is the composition
 * root's (`src/composition/procurement-directory.ts`); payments answer
 * "not paid" until M7 wires supplier payments in.
 */
export function createGoodsReceiptHandlers(deps: {
  directory: ProcurementDirectory;
  prisma?: PrismaClient;
  payments?: GoodsReceiptPayments;
  dispatcher?: EventDispatcher;
}): GoodsReceiptHandlers {
  const db = deps.prisma ?? prisma;
  return new GoodsReceiptHandlers({
    store: new PrismaGoodsReceiptStore(db),
    directory: deps.directory,
    ledger: stockLedger(),
    payments: deps.payments ?? NOT_PAID,
    backdated: (actor) => loadBackdatedCheck(db, actor),
    today: (workspaceId) => companyToday(db, workspaceId),
    dispatcher: deps.dispatcher ?? new InProcessEventDispatcher(),
    db,
  });
}
