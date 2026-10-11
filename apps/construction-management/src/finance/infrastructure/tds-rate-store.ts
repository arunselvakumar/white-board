import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";

import type { FinanceTx } from "../application/party-ports";
import type { TdsRate } from "../domain/tds";

/** The dated TDS rate table (`statutory_tds_rates`, CM-0008, CM-0017 §8). */
export async function loadTdsRates(db: FinanceTx): Promise<TdsRate[]> {
  const rows = await db.constructionFinanceStatutoryTdsRate.findMany({
    orderBy: [{ section: "asc" }, { effectiveFrom: "asc" }],
  });
  return rows.map((row) => ({
    section: row.section,
    label: row.label,
    payeeKind: row.payeeKind,
    rate: row.rate.toFixed(2),
    singleThreshold: row.singleThreshold,
    aggregateThreshold: row.aggregateThreshold,
    effectiveFrom: calendarDateFromDb(row.effectiveFrom),
  }));
}
