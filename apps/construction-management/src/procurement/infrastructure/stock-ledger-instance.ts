import { NO_STOCK_WATCHER } from "../application/ports";
import { PrismaStockLedger } from "./prisma-stock-ledger";

/**
 * The stock ledger every procurement write uses. Current Inventory
 * (CM-506) replaces the watcher with its minimum-stock watcher here, so
 * no caller changes.
 */
export function stockLedger(): PrismaStockLedger {
  return new PrismaStockLedger(NO_STOCK_WATCHER);
}
