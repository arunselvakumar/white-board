import { Prisma } from "@repo/construction-db";

import type { DomainEvent } from "@/src/shared-kernel/events";

import type { StockKey, StockLevelWatcher } from "../application/ports";
import type { StockBelowMinimum } from "../domain/events";
import {
  belowAlertingMinimum,
  effectiveMinimum,
} from "../domain/inventory-stock-state";
import { stockLocationKey } from "../domain/stock-location";

type Tx = Prisma.TransactionClient;

type Row = {
  id: string;
  locationKind: "project" | "store";
  locationId: string;
  materialId: string;
  minStockQty: string | null;
  minAlertEnabled: boolean;
  belowMinimum: boolean;
  materialMinimum: string | null;
  stock: string;
};

/** Stock settings with their Material's minimum and the stock now. */
function settings(tx: Tx, workspaceId: string, filter: Prisma.Sql) {
  return tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT s.id::text AS id,
           s.location_kind::text AS "locationKind",
           s.location_id::text AS "locationId",
           s.material_id::text AS "materialId",
           s.min_stock_qty::text AS "minStockQty",
           s.min_alert_enabled AS "minAlertEnabled",
           s.below_minimum AS "belowMinimum",
           m.min_stock_qty::text AS "materialMinimum",
           COALESCE((
             SELECT SUM(e.quantity)
             FROM construction_procurement.stock_entries e
             WHERE e.workspace_id = s.workspace_id
               AND e.location_kind = s.location_kind
               AND e.location_id = s.location_id
               AND e.material_id = s.material_id
           ), 0)::text AS stock
    FROM construction_procurement.stock_settings s
    LEFT JOIN construction_masters.materials m
      ON m.id = s.material_id AND m.workspace_id = s.workspace_id
    WHERE s.workspace_id = ${workspaceId}
      ${filter}`);
}

/**
 * The minimum-stock watcher (CM-506, ADR CM-0015 §10). After every ledger
 * write, inside its transaction, it looks at the touched (location,
 * material) pairs that have a stock setting with the alert on or a
 * remembered crossing, compares stock with the minimum (the location's
 * override, else the Material's), and flips `below_minimum`. Falling to or
 * below the minimum returns `StockBelowMinimum`; rising above it only
 * clears the flag. The Material's minimum is a plain read of the masters
 * table by id (the masters context is referred to by id only).
 */
export class PrismaStockLevelWatcher implements StockLevelWatcher {
  async afterStockChanged(
    tx: Tx,
    workspaceId: string,
    keys: readonly StockKey[],
  ): Promise<DomainEvent[]> {
    if (keys.length === 0) return [];
    const wanted = new Set(
      keys.map((key) => `${stockLocationKey(key.location)}:${key.materialId}`),
    );
    const rows = await settings(
      tx,
      workspaceId,
      Prisma.sql`AND s.material_id = ANY(${[...new Set(keys.map((key) => key.materialId))]}::uuid[])
        AND (s.min_alert_enabled OR s.below_minimum)`,
    );
    return this.apply(
      tx,
      workspaceId,
      rows.filter((row) =>
        wanted.has(
          `${stockLocationKey({ kind: row.locationKind, id: row.locationId })}:${row.materialId}`,
        ),
      ),
    );
  }

  /**
   * Re-checks one setting after its minimum or toggle changed: turning
   * the alert on while already at or below the minimum is a crossing.
   */
  async afterSettingChanged(
    tx: Tx,
    workspaceId: string,
    key: StockKey,
  ): Promise<DomainEvent[]> {
    const rows = await settings(
      tx,
      workspaceId,
      Prisma.sql`AND s.location_kind = ${key.location.kind}::construction_procurement.location_kind
        AND s.location_id = ${key.location.id}::uuid
        AND s.material_id = ${key.materialId}::uuid`,
    );
    return this.apply(tx, workspaceId, rows);
  }

  private async apply(
    tx: Tx,
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<DomainEvent[]> {
    const events: DomainEvent[] = [];
    const now = new Date();
    for (const row of rows) {
      const minimum = effectiveMinimum(row.minStockQty, row.materialMinimum);
      const below = belowAlertingMinimum(
        normalise(row.stock),
        minimum == null ? null : normalise(minimum),
        row.minAlertEnabled,
      );
      if (below === row.belowMinimum) continue;
      await tx.constructionProcurementStockSetting.update({
        where: { id: row.id },
        data: { belowMinimum: below },
      });
      if (below && minimum != null) {
        const event: StockBelowMinimum = {
          type: "procurement.stock_below_minimum",
          workspaceId,
          occurredAt: now,
          locationKind: row.locationKind,
          locationId: row.locationId,
          materialId: row.materialId,
          stock: new Prisma.Decimal(row.stock).toFixed(3),
          minimum: new Prisma.Decimal(minimum).toFixed(3),
        };
        events.push(event);
      }
    }
    return events;
  }
}

/** Postgres `numeric::text` keeps its scale; trim to the 3 decimals Quantity takes. */
function normalise(decimal: string): string {
  return new Prisma.Decimal(decimal).toFixed(3);
}
