import { prisma } from "@repo/construction-db";

import { SalesSettingsHandlers } from "@/src/sales/application/sales-settings-handlers";
import { PrismaSalesListStore } from "@/src/sales/infrastructure/sales-list-store";

/** The store of Funnel Stages, Lead Sources and Lost Reasons (CM-1002). */
export const salesListStore = new PrismaSalesListStore();

/** Sales settings handlers (CM-1002) wired to Prisma. */
export function createSalesSettingsHandlers(): SalesSettingsHandlers {
  return new SalesSettingsHandlers({ db: prisma, store: salesListStore });
}

/** One set of handlers for every settings route. */
export const salesSettingsHandlers = createSalesSettingsHandlers();
