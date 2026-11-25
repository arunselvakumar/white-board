import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { StockHandlers } from "../application/stock-handlers";
import { StockItemHandlers } from "../application/stock-item-handlers";
import { PrismaStockItemStore } from "./prisma-stock-item-store";
import { PrismaStockStore } from "./prisma-stock-store";

export function createStockHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): { items: StockItemHandlers; stock: StockHandlers } {
  const db = deps?.prisma ?? prisma;
  const now = deps?.now ?? (() => new Date());
  return {
    items: new StockItemHandlers({ store: new PrismaStockItemStore(db), now }),
    stock: new StockHandlers({ store: new PrismaStockStore(db), now }),
  };
}
