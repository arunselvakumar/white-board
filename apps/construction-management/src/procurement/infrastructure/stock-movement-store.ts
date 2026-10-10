import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { Flag, MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";
import { optionalText, requiredText } from "@/src/shared-kernel/approval";

import { canAtLocation } from "../application/inventory-access";
import type { MaterialFacts, ProcurementDirectory } from "../application/ports";
import {
  planInventoryImport,
  type InventoryImportPlan,
  type InventorySheetRow,
} from "../domain/inventory-import";
import type { StockPosting } from "../domain/stock-ledger";
import type { StockLocation } from "../domain/stock-location";
import {
  adjustmentDifference,
  assertMovementDate,
  isEditableMovement,
  MAX_MOVEMENT_LINES,
  movementBackdatedModule,
  movementQuantity,
  takesSiteLocation,
  type StockMovementKind,
} from "../domain/stock-movement";
import { requireStockLocation } from "./inventory-locations";
import {
  loadBackdatedCheck,
  type ProcurementActor,
} from "./procurement-guards";
import { stockLedger } from "./stock-ledger-instance";

type Tx = Prisma.TransactionClient;

export type InventoryCaller = {
  actor: ProcurementActor;
  access: MemberAccess;
};

export type StockMovement = {
  id: string;
  location: StockLocation;
  kind: StockMovementKind;
  date: CalendarDate;
  materialId: string;
  /** Positive, except an adjustment (signed). */
  quantity: string;
  siteLocation: LocationRef | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MovementRow =
  Prisma.ConstructionProcurementStockMovementGetPayload<object>;

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    location: { kind: row.locationKind, id: row.locationId },
    kind: row.kind,
    date: calendarDateFromDb(row.movementDate),
    materialId: row.materialId,
    quantity: row.quantity.toFixed(3),
    siteLocation: (row.siteLocation ?? null) as LocationRef | null,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function snapshot(movement: StockMovement) {
  return {
    location: movement.location,
    kind: movement.kind,
    date: movement.date,
    materialId: movement.materialId,
    quantity: movement.quantity,
    siteLocation: movement.siteLocation,
    remark: movement.remark,
  };
}

export type MovementLineInput = {
  date: CalendarDate;
  materialId: string;
  quantity: string;
  siteLocation?: LocationRefInput | null;
  remark?: string | null;
};

export type ImportResult = InventoryImportPlan & {
  /** Opening entries posted (0 on a dry run). */
  imported: number;
  /** Estimated quantities set (0 on a dry run). */
  estimatesSet: number;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/** Current Inventory flag at a location, else 403. */
export function assertCanAtLocation(
  access: MemberAccess,
  location: StockLocation,
  flag: Flag,
): void {
  if (!canAtLocation(access, location, flag)) throw permissionDenied();
}

/**
 * Consume, Missing, Adjust stock, their edits and deletes, and Import
 * Inventory Stock (CM-506). Every write is one transaction: the movement
 * row, its ledger entries through `stockLedger()` (which refuses stock
 * below zero on any later date, 409 `STOCK_INSUFFICIENT`) and an audit
 * event; minimum-stock events are dispatched after commit.
 */
export class StockMovementCommands {
  constructor(
    private readonly deps: {
      db: PrismaClient;
      directory: ProcurementDirectory;
      locations: LocationResolver;
      dispatcher: EventDispatcher;
    },
  ) {}

  private get db() {
    return this.deps.db;
  }

  private async materials(
    workspaceId: string,
    ids: readonly string[],
    field: (index: number) => string,
  ): Promise<Map<string, MaterialFacts>> {
    const found = await this.deps.directory.materials(
      this.db,
      workspaceId,
      ids,
    );
    ids.forEach((id, index) => {
      if (!found.has(id))
        throw new DomainError(
          "MATERIAL_NOT_FOUND",
          "This material was not found in Masters.",
          { details: { field: field(index), ids: [id] } },
        );
    });
    return found;
  }

  private async siteLocation(
    workspaceId: string,
    location: StockLocation,
    kind: StockMovementKind,
    input: LocationRefInput | null | undefined,
    field: string,
  ): Promise<LocationRef | null> {
    if (input == null) return null;
    if (location.kind !== "project" || !takesSiteLocation(kind))
      throw new DomainError(
        "SITE_LOCATION_NOT_ALLOWED",
        "A location inside the Project goes only on consumption at a Project.",
        { details: { field } },
      );
    const ref = locationRef(input);
    await this.deps.locations.assertOnProject(workspaceId, location.id, ref);
    return ref;
  }

  private async dispatch(events: readonly DomainEvent[]): Promise<void> {
    if (events.length > 0) await this.deps.dispatcher.dispatch(events);
  }

  /** Consume or Missing: one or many lines, each its own movement. */
  async record(
    caller: InventoryCaller,
    input: {
      location: StockLocation;
      kind: "consumed" | "missing";
      lines: readonly MovementLineInput[];
    },
  ): Promise<StockMovement[]> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const location = await requireStockLocation(
      this.db,
      this.deps.directory,
      workspaceId,
      input.location,
    );
    assertCanAtLocation(access, location, "create");
    if (input.lines.length === 0)
      throw new DomainError("MOVEMENT_LINES_REQUIRED", "Add a material.", {
        details: { field: "lines" },
      });
    if (input.lines.length > MAX_MOVEMENT_LINES)
      throw new DomainError(
        "MOVEMENT_TOO_MANY_LINES",
        `Add at most ${String(MAX_MOVEMENT_LINES)} lines.`,
        { details: { field: "lines" } },
      );
    const [check, today, materials] = await Promise.all([
      loadBackdatedCheck(this.db, actor),
      companyToday(this.db, workspaceId),
      this.materials(
        workspaceId,
        input.lines.map((line) => line.materialId),
        (index) => `lines.${String(index)}.materialId`,
      ),
    ]);
    const backdatedModule = movementBackdatedModule(input.kind);
    const lines: {
      id: string;
      date: CalendarDate;
      materialId: string;
      quantity: string;
      siteLocation: LocationRef | null;
      remark: string | null;
    }[] = [];
    for (const [index, line] of input.lines.entries()) {
      const at = (field: string) => `lines.${String(index)}.${field}`;
      assertMovementDate(line.date, today, at("date"));
      check(backdatedModule, "create", line.date);
      lines.push({
        id: newId(),
        date: line.date,
        materialId: line.materialId,
        quantity: movementQuantity(line.quantity, at("quantity")),
        siteLocation: await this.siteLocation(
          workspaceId,
          location,
          input.kind,
          line.siteLocation,
          at("siteLocation"),
        ),
        remark: optionalText(line.remark, at("remark")),
      });
    }
    const names = new Map(
      [...materials.values()].map((material) => [material.id, material.name]),
    );
    const { rows, events } = await this.db.$transaction(async (tx) => {
      const now = new Date();
      await tx.constructionProcurementStockMovement.createMany({
        data: lines.map((line) => ({
          id: line.id,
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          kind: input.kind,
          movementDate: calendarDateToDb(line.date),
          materialId: line.materialId,
          quantity: new Prisma.Decimal(line.quantity),
          siteLocationType: line.siteLocation?.type ?? null,
          siteLocation:
            line.siteLocation == null
              ? Prisma.DbNull
              : (line.siteLocation as Prisma.InputJsonValue),
          remark: line.remark,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })),
      });
      const written = await stockLedger().post(
        tx,
        { workspaceId, by: actor.userId },
        lines.map((line): StockPosting => ({
          location,
          materialId: line.materialId,
          entryDate: line.date,
          type: input.kind,
          quantity: line.quantity,
          source: { type: "stock_movement", id: line.id },
          siteLocation: line.siteLocation,
          remark: line.remark,
        })),
        { materialNames: names },
      );
      const created = await tx.constructionProcurementStockMovement.findMany({
        where: { id: { in: lines.map((line) => line.id) } },
      });
      const order = new Map(lines.map((line, index) => [line.id, index]));
      created.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      for (const row of created)
        await recordAudit(tx, {
          workspaceId,
          actorUserId: actor.userId,
          action: "stock_movement.created",
          entityType: "stock_movement",
          entityId: row.id,
          after: snapshot(toMovement(row)),
        });
      return { rows: created, events: written.events };
    });
    await this.dispatch(events);
    return rows.map(toMovement);
  }

  /**
   * Adjust stock: the counted quantity on a date and a reason; the
   * difference from the stock on that date posts as an Adjustment.
   */
  async adjust(
    caller: InventoryCaller,
    input: {
      location: StockLocation;
      materialId: string;
      date: CalendarDate;
      countedQty: string;
      reason: string;
    },
  ): Promise<StockMovement> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const location = await requireStockLocation(
      this.db,
      this.deps.directory,
      workspaceId,
      input.location,
    );
    assertCanAtLocation(access, location, "update");
    const [check, today, materials] = await Promise.all([
      loadBackdatedCheck(this.db, actor),
      companyToday(this.db, workspaceId),
      this.materials(workspaceId, [input.materialId], () => "materialId"),
    ]);
    assertMovementDate(input.date, today);
    check("current_inventory", "create", input.date);
    const reason = requiredText(
      input.reason,
      "ADJUSTMENT_REASON_REQUIRED",
      "reason",
    );
    const id = newId();
    const ledger = stockLedger();
    const names = new Map(
      [...materials.values()].map((material) => [material.id, material.name]),
    );
    const { row, events } = await this.db.$transaction(async (tx) => {
      await ledger.lock(tx, workspaceId, [
        { location, materialId: input.materialId },
      ]);
      const stock =
        (
          await ledger.stock(
            tx,
            workspaceId,
            location,
            [input.materialId],
            input.date,
          )
        ).get(input.materialId) ?? "0";
      const difference = adjustmentDifference(
        input.countedQty,
        new Prisma.Decimal(stock).toFixed(3),
      );
      const created = await tx.constructionProcurementStockMovement.create({
        data: {
          id,
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          kind: "adjustment",
          movementDate: calendarDateToDb(input.date),
          materialId: input.materialId,
          quantity: new Prisma.Decimal(difference),
          remark: reason,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      const written = await ledger.post(
        tx,
        { workspaceId, by: actor.userId },
        [
          {
            location,
            materialId: input.materialId,
            entryDate: input.date,
            type: "adjustment",
            quantity: difference,
            source: { type: "stock_movement", id },
            remark: reason,
          },
        ],
        { materialNames: names },
      );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "stock_movement.created",
        entityType: "stock_movement",
        entityId: id,
        after: {
          ...snapshot(toMovement(created)),
          countedQty: input.countedQty,
        },
      });
      return { row: created, events: written.events };
    });
    await this.dispatch(events);
    return toMovement(row);
  }

  private async load(workspaceId: string, id: string): Promise<StockMovement> {
    const row = await this.db.constructionProcurementStockMovement.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null)
      throw notFound(
        "STOCK_MOVEMENT_NOT_FOUND",
        "This stock entry was not found.",
      );
    return toMovement(row);
  }

  /** One live movement, for the routes to check its location first. */
  async get(workspaceId: string, id: string): Promise<StockMovement> {
    return this.load(workspaceId, id);
  }

  /**
   * Edit a Consumed, Missing or Opening movement: its entries are reversed
   * and the new ones posted, checked together.
   */
  async edit(
    caller: InventoryCaller,
    id: string,
    input: {
      date: CalendarDate;
      quantity: string;
      siteLocation?: LocationRefInput | null;
      remark?: string | null;
      expectedUpdatedAt: Date;
    },
  ): Promise<StockMovement> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const before = await this.load(workspaceId, id);
    assertCanAtLocation(access, before.location, "update");
    if (!isEditableMovement(before.kind))
      throw conflict(
        "STOCK_MOVEMENT_NOT_EDITABLE",
        "An adjustment is not edited. Delete it and adjust stock again.",
      );
    if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw changed();
    const [check, today, materials] = await Promise.all([
      loadBackdatedCheck(this.db, actor),
      companyToday(this.db, workspaceId),
      this.deps.directory.materials(this.db, workspaceId, [before.materialId]),
    ]);
    const backdatedModule = movementBackdatedModule(before.kind);
    assertMovementDate(input.date, today);
    check(backdatedModule, "edit", before.date);
    if (input.date !== before.date) check(backdatedModule, "edit", input.date);
    const quantity = movementQuantity(input.quantity);
    const siteLocation = await this.siteLocation(
      workspaceId,
      before.location,
      before.kind,
      input.siteLocation,
      "siteLocation",
    );
    const remark = optionalText(input.remark, "remark");
    const names = new Map(
      [...materials.values()].map((material) => [material.id, material.name]),
    );
    const { row, events } = await this.db.$transaction(async (tx) => {
      const updated = await tx.constructionProcurementStockMovement.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          movementDate: calendarDateToDb(input.date),
          quantity: new Prisma.Decimal(quantity),
          siteLocationType: siteLocation?.type ?? null,
          siteLocation:
            siteLocation == null
              ? Prisma.DbNull
              : (siteLocation as Prisma.InputJsonValue),
          remark,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      const written = await stockLedger().replaceSource(
        tx,
        { workspaceId, by: actor.userId },
        { type: "stock_movement", id },
        [
          {
            location: before.location,
            materialId: before.materialId,
            entryDate: input.date,
            type: before.kind,
            quantity,
            source: { type: "stock_movement", id },
            siteLocation,
            remark,
          },
        ],
        { materialNames: names },
      );
      const after =
        await tx.constructionProcurementStockMovement.findUniqueOrThrow({
          where: { id },
        });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "stock_movement.updated",
        entityType: "stock_movement",
        entityId: id,
        before: snapshot(before),
        after: snapshot(toMovement(after)),
      });
      return { row: after, events: written.events };
    });
    await this.dispatch(events);
    return toMovement(row);
  }

  /** Delete a movement: a tombstone and a reversal of its entries. */
  async remove(
    caller: InventoryCaller,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const before = await this.load(workspaceId, id);
    assertCanAtLocation(access, before.location, "delete");
    if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw changed();
    const [check, materials] = await Promise.all([
      loadBackdatedCheck(this.db, actor),
      this.deps.directory.materials(this.db, workspaceId, [before.materialId]),
    ]);
    check(movementBackdatedModule(before.kind), "edit", before.date);
    const names = new Map(
      [...materials.values()].map((material) => [material.id, material.name]),
    );
    const events = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.constructionProcurementStockMovement.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          deletedAt: now,
          deletedBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      const written = await stockLedger().reverseSource(
        tx,
        { workspaceId, by: actor.userId },
        { type: "stock_movement", id },
        { materialNames: names },
      );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "stock_movement.deleted",
        entityType: "stock_movement",
        entityId: id,
        before: snapshot(before),
      });
      return written.events;
    });
    await this.dispatch(events);
  }

  /**
   * Import Inventory Stock: checks every row; on a dry run returns the
   * plan, otherwise posts Opening entries dated `openingDate` and sets
   * Estimated Qty, all or nothing — any row in error is 400
   * `IMPORT_HAS_ERRORS` with the plan in `details`.
   */
  async import(
    caller: InventoryCaller,
    input: {
      location: StockLocation;
      sheet: readonly InventorySheetRow[];
      openingDate: CalendarDate | null;
      dryRun: boolean;
    },
  ): Promise<ImportResult> {
    const { actor, access } = caller;
    const { workspaceId } = actor;
    const location = await requireStockLocation(
      this.db,
      this.deps.directory,
      workspaceId,
      input.location,
    );
    assertCanAtLocation(access, location, "create");
    const today = await companyToday(this.db, workspaceId);
    const openingDate = input.openingDate ?? today;
    assertMovementDate(openingDate, today, "openingDate");
    const names = input.sheet
      .map((row) => row.cells.material)
      .filter((cell) => cell != null)
      .map((cell) => String(cell).trim().toLowerCase())
      .filter((name) => name !== "");
    const plan = await this.plan(
      this.db,
      workspaceId,
      location,
      input.sheet,
      names,
    );
    if (input.dryRun) return { ...plan, imported: 0, estimatesSet: 0 };
    if (plan.errorCount > 0)
      throw new DomainError(
        "IMPORT_HAS_ERRORS",
        plan.errorCount === 1
          ? "One row has an error; nothing was imported."
          : `${String(plan.errorCount)} rows have errors; nothing was imported.`,
        { details: plan },
      );
    const check = await loadBackdatedCheck(this.db, actor);
    check("current_inventory", "create", openingDate);
    const ledger = stockLedger();
    const { result, events } = await this.db.$transaction(async (tx) => {
      const openings = plan.rows.filter(
        (row): row is typeof row & { materialId: string; quantity: string } =>
          row.materialId != null && row.quantity != null,
      );
      await ledger.lock(
        tx,
        workspaceId,
        openings.map((row) => ({ location, materialId: row.materialId })),
      );
      // Checked again under the lock: another write may have landed.
      const fresh = await this.plan(
        tx,
        workspaceId,
        location,
        input.sheet,
        names,
      );
      if (fresh.errorCount > 0)
        throw new DomainError(
          "IMPORT_HAS_ERRORS",
          "Stock changed while importing; nothing was imported. Check the rows and try again.",
          { details: fresh },
        );
      const now = new Date();
      const movements = openings.map((row) => ({ id: newId(), row }));
      await tx.constructionProcurementStockMovement.createMany({
        data: movements.map(({ id, row }) => ({
          id,
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          kind: "opening" as const,
          movementDate: calendarDateToDb(openingDate),
          materialId: row.materialId,
          quantity: new Prisma.Decimal(row.quantity),
          remark: "Imported opening stock",
          createdAt: now,
          updatedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })),
      });
      const written = await ledger.post(
        tx,
        { workspaceId, by: actor.userId },
        movements.map(({ id, row }): StockPosting => ({
          location,
          materialId: row.materialId,
          entryDate: openingDate,
          type: "opening",
          quantity: row.quantity,
          source: { type: "stock_movement", id },
          remark: "Imported opening stock",
        })),
      );
      const estimates = fresh.rows.filter(
        (
          row,
        ): row is typeof row & { materialId: string; estimatedQty: string } =>
          row.materialId != null && row.estimatedQty != null,
      );
      for (const row of estimates)
        await upsertSetting(
          tx,
          workspaceId,
          location,
          row.materialId,
          actor.userId,
          {
            estimatedQty: new Prisma.Decimal(row.estimatedQty),
          },
        );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "inventory.imported",
        entityType: "stock_location",
        entityId: location.id,
        after: {
          location: { kind: location.kind, id: location.id },
          openingDate,
          openings: movements.map(({ id, row }) => ({
            movementId: id,
            materialId: row.materialId,
            quantity: row.quantity,
          })),
          estimates: estimates.map((row) => ({
            materialId: row.materialId,
            estimatedQty: row.estimatedQty,
          })),
        },
      });
      return {
        result: {
          ...fresh,
          imported: movements.length,
          estimatesSet: estimates.length,
        },
        events: written.events,
      };
    });
    await this.dispatch(events);
    return result;
  }

  private async plan(
    db: Tx,
    workspaceId: string,
    location: StockLocation,
    sheet: readonly InventorySheetRow[],
    names: readonly string[],
  ): Promise<InventoryImportPlan> {
    const [materials, moved] = await Promise.all([
      materialsByName(db, workspaceId, names),
      db.$queryRaw<{ materialId: string }[]>`
        SELECT DISTINCT material_id::text AS "materialId"
        FROM construction_procurement.stock_entries
        WHERE workspace_id = ${workspaceId}
          AND location_kind = ${location.kind}::construction_procurement.location_kind
          AND location_id = ${location.id}::uuid`,
    ]);
    return planInventoryImport(
      sheet,
      materials,
      new Set(moved.map((row) => row.materialId)),
    );
  }
}

function changed(): DomainError {
  return conflict(
    "STOCK_MOVEMENT_CHANGED",
    "Someone changed this entry. Reload it and try again.",
  );
}

/**
 * Live, enabled Materials by lower-cased name with their unit, a plain
 * read of the masters tables (the masters context is referred to by id
 * only; the directory reads by id, the import matches by name).
 */
async function materialsByName(
  db: Tx,
  workspaceId: string,
  names: readonly string[],
): Promise<Map<string, { id: string; name: string; uomName: string }>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();
  const rows = await db.$queryRaw<
    { id: string; name: string; uomName: string }[]
  >`
    SELECT m.id::text AS id, m.name, u.name AS "uomName"
    FROM construction_masters.materials m
    JOIN construction_masters.measurement_units u ON u.id = m.uom_id
    WHERE m.workspace_id = ${workspaceId}
      AND m.deleted_at IS NULL
      AND m.disabled_at IS NULL
      AND lower(m.name) = ANY(${unique}::text[])
    ORDER BY m.created_at ASC`;
  const byName = new Map<
    string,
    { id: string; name: string; uomName: string }
  >();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, row);
  }
  return byName;
}

/** Inserts or updates a stock setting's given fields. */
export async function upsertSetting(
  tx: Tx,
  workspaceId: string,
  location: StockLocation,
  materialId: string,
  by: string,
  data: {
    estimatedQty?: Prisma.Decimal | null;
    minStockQty?: Prisma.Decimal | null;
    minAlertEnabled?: boolean;
  },
): Promise<void> {
  const now = new Date();
  await tx.constructionProcurementStockSetting.upsert({
    where: {
      workspaceId_locationKind_locationId_materialId: {
        workspaceId,
        locationKind: location.kind,
        locationId: location.id,
        materialId,
      },
    },
    create: {
      id: newId(),
      workspaceId,
      locationKind: location.kind,
      locationId: location.id,
      materialId,
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    },
    update: { ...data, updatedAt: now, updatedBy: by },
  });
}
