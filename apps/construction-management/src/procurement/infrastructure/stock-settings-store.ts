import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError } from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import type { ProcurementDirectory } from "../application/ports";
import type { StockLocation } from "../domain/stock-location";
import { nonNegativeQuantity } from "../domain/stock-movement";
import { requireStockLocation } from "./inventory-locations";
import { inventoryRowOf, type InventoryRow } from "./inventory-queries";
import { stockLevelWatcher } from "./stock-ledger-instance";
import {
  assertCanAtLocation,
  upsertSetting,
  type InventoryCaller,
} from "./stock-movement-store";

export type StockSettingsInput = {
  /** Decimal string; null clears it. Left out: unchanged. */
  estimatedQty?: string | null;
  /** The location's minimum; null goes back to the Material's. */
  minStockQty?: string | null;
  minAlertEnabled?: boolean;
};

/**
 * Update / Add Estimation Qty, the minimum-stock override and the alert
 * toggle of one material at a location (CM-506, ADR CM-0015 §10), in
 * `stock_settings`. A change to the minimum or the toggle re-checks the
 * crossing, so turning the alert on at or below the minimum raises
 * `StockBelowMinimum`.
 */
export class StockSettingsCommands {
  constructor(
    private readonly deps: {
      db: PrismaClient;
      directory: ProcurementDirectory;
      dispatcher: EventDispatcher;
    },
  ) {}

  async update(
    caller: InventoryCaller,
    location: StockLocation,
    materialId: string,
    input: StockSettingsInput,
  ): Promise<InventoryRow> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const { db, directory } = this.deps;
    const named = await requireStockLocation(db, directory, workspaceId, location);
    assertCanAtLocation(access, named, "update");
    const materials = await directory.materials(db, workspaceId, [materialId]);
    if (!materials.has(materialId))
      throw new DomainError(
        "MATERIAL_NOT_FOUND",
        "This material was not found in Masters.",
        { details: { field: "materialId", ids: [materialId] } },
      );
    const data: Parameters<typeof upsertSetting>[5] = {};
    if (input.estimatedQty !== undefined)
      data.estimatedQty =
        input.estimatedQty == null
          ? null
          : new Prisma.Decimal(
              nonNegativeQuantity(input.estimatedQty, "estimatedQty"),
            );
    if (input.minStockQty !== undefined)
      data.minStockQty =
        input.minStockQty == null
          ? null
          : new Prisma.Decimal(
              nonNegativeQuantity(input.minStockQty, "minStockQty"),
            );
    if (input.minAlertEnabled !== undefined)
      data.minAlertEnabled = input.minAlertEnabled;
    if (Object.keys(data).length === 0)
      throw new DomainError("NOTHING_TO_CHANGE", "Change at least one field.");
    const key = { location, materialId };
    const events = await db.$transaction(async (tx) => {
      const before = await tx.constructionProcurementStockSetting.findUnique({
        where: {
          workspaceId_locationKind_locationId_materialId: {
            workspaceId,
            locationKind: location.kind,
            locationId: location.id,
            materialId,
          },
        },
      });
      await upsertSetting(tx, workspaceId, location, materialId, actor.userId, data);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "stock_settings.updated",
        entityType: "stock_setting",
        entityId: materialId,
        before:
          before == null
            ? null
            : {
                estimatedQty: before.estimatedQty?.toFixed(3) ?? null,
                minStockQty: before.minStockQty?.toFixed(3) ?? null,
                minAlertEnabled: before.minAlertEnabled,
              },
        after: {
          location,
          ...Object.fromEntries(
            Object.entries(data).map(([field, value]) => [
              field,
              value instanceof Prisma.Decimal ? value.toFixed(3) : value,
            ]),
          ),
        },
      });
      if (data.minStockQty === undefined && data.minAlertEnabled === undefined)
        return [];
      return stockLevelWatcher().afterSettingChanged(tx, workspaceId, key);
    });
    if (events.length > 0) await this.deps.dispatcher.dispatch(events);
    const row = await inventoryRowOf(db, directory, workspaceId, location, materialId);
    if (row == null)
      throw new DomainError(
        "MATERIAL_NOT_FOUND",
        "This material was not found in Masters.",
      );
    return row;
  }
}
