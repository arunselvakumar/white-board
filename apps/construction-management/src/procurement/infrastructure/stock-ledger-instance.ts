import { PrismaStockLedger } from "./prisma-stock-ledger";
import { PrismaStockLevelWatcher } from "./stock-level-watcher";

const watcher = new PrismaStockLevelWatcher();

/**
 * The stock ledger every procurement write uses, with Current Inventory's
 * minimum-stock watcher (CM-506): a write that takes a material to or
 * below its alerting minimum returns `StockBelowMinimum` among its events.
 */
export function stockLedger(): PrismaStockLedger {
  return new PrismaStockLedger(watcher);
}

/** The watcher, for a stock setting change to re-check its crossing. */
export function stockLevelWatcher(): PrismaStockLevelWatcher {
  return watcher;
}
