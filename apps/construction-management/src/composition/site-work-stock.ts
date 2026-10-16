import { prisma } from "@repo/construction-db";

import type { StockPosting } from "@/src/procurement/domain/stock-ledger";
import { stockLocation } from "@/src/procurement/domain/stock-location";
import { procurementEvents } from "@/src/composition/procurement-events";
import { stockLedger } from "@/src/procurement/infrastructure/stock-ledger-instance";
import type {
  SiteStock,
  SiteStockPosting,
} from "@/src/site-work/application/ports";

/**
 * Site-work's material lines on procurement's stock ledger (ADR CM-0016 §5):
 * each line is a Consumed entry at the Project on the sheet date, its
 * source the sheet (`daily_worksheet` / `equipment_usage`) and the line.
 * Errors pass through unchanged (409 `STOCK_INSUFFICIENT`).
 */
export function siteWorkStock(): SiteStock {
  const ledger = stockLedger();
  const postingsOf = (
    source: { type: "daily_worksheet" | "equipment_usage"; id: string },
    posting: SiteStockPosting,
  ): StockPosting[] =>
    posting.lines.map((line) => ({
      location: stockLocation("project", posting.projectId),
      materialId: line.materialId,
      entryDate: posting.date,
      type: "consumed",
      quantity: line.quantity,
      source,
      sourceLineId: line.lineId,
      counterpartyLabel: posting.label,
      siteLocation: posting.siteLocation,
    }));
  return {
    async replace(tx, source, posting) {
      return ledger.replaceSource(
        tx,
        { workspaceId: posting.workspaceId, by: posting.by },
        source,
        postingsOf(source, posting),
        {
          materialNames: new Map(
            posting.lines.map((line) => [line.materialId, line.materialName]),
          ),
        },
      );
    },
    async reverse(tx, source, ctx) {
      return ledger.reverseSource(tx, ctx, source);
    },
    async dispatch(events) {
      if (events.length > 0) await procurementEvents.dispatch([...events]);
    },
    async available(workspaceId, projectId, materialIds, on) {
      if (materialIds.length === 0) return new Map();
      return ledger.stock(
        prisma,
        workspaceId,
        stockLocation("project", projectId),
        materialIds,
        on,
      );
    },
  };
}
