import { Prisma, type PrismaClient } from "@repo/construction-db";

import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { Quantity } from "@/src/shared-kernel/quantity";

import type {
  CentralInventory,
  CentralInventoryFilter,
  CentralInventoryReader,
  InventoryLocation,
  InventoryMaterial,
  InventoryPosition,
  StockLedgerFilter,
  StockLedgerReport,
  StockLedgerRow,
} from "../application/central-inventory-queries";
import type { MaterialFacts, ProcurementDirectory } from "../application/ports";
import {
  stockLedgerLine,
  stockState,
  sumQuantities,
} from "../domain/central-inventory";
import type { StockEntryType } from "../domain/stock-ledger";
import {
  stockLocationKey,
  type StockLocation,
  type StockLocationKind,
} from "../domain/stock-location";

type Named = { id: string; name: string };

/** Live Projects by name (from the projects context, wired in composition). */
export type ProjectLister = (workspaceId: string) => Promise<Named[]>;

type PositionRow = {
  kind: StockLocationKind;
  locationId: string;
  materialId: string;
  quantity: string;
};

const KIND_ORDER: Record<StockLocationKind, number> = { project: 0, store: 1 };

function compareLocations(a: InventoryLocation, b: InventoryLocation): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.name.localeCompare(b.name, "en-IN") ||
    a.id.localeCompare(b.id)
  );
}

function locationFilter(
  locations: readonly StockLocation[] | undefined,
  kindColumn: Prisma.Sql,
  idColumn: Prisma.Sql,
): Prisma.Sql {
  if (locations == null || locations.length === 0) return Prisma.empty;
  return Prisma.sql`AND (${kindColumn}::text, ${idColumn}) IN (${Prisma.join(
    locations.map(
      (location) => Prisma.sql`(${location.kind}, ${location.id}::uuid)`,
    ),
  )})`;
}

const DELETED_MATERIAL = "Deleted material";

/**
 * Central Inventory over the stock ledger (CM-509): sums of
 * `stock_entries` per location and material, plus what approved Material
 * Transfers and Delivery Notes are carrying to each location. Read-only;
 * every write goes through the stock ledger.
 */
export class PrismaCentralInventory implements CentralInventoryReader {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: ProcurementDirectory,
    private readonly projects: ProjectLister,
  ) {}

  /** Every live Project and Store, Projects first, by name. */
  async locations(workspaceId: string): Promise<InventoryLocation[]> {
    const [projects, stores] = await Promise.all([
      this.projects(workspaceId),
      this.db.constructionProcurementStore.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    return [
      ...projects.map((row) => ({ kind: "project" as const, ...row })),
      ...stores.map((row) => ({ kind: "store" as const, ...row })),
    ].sort(compareLocations);
  }

  async inventory(filter: CentralInventoryFilter): Promise<CentralInventory> {
    const { workspaceId } = filter;
    const [locations, stockRows, transitRows] = await Promise.all([
      this.locations(workspaceId),
      this.db.$queryRaw<PositionRow[]>`
        SELECT location_kind::text AS kind, location_id::text AS "locationId",
               material_id::text AS "materialId", SUM(quantity)::text AS quantity
        FROM "construction_procurement"."stock_entries"
        WHERE workspace_id = ${workspaceId}
          ${locationFilter(filter.locations, Prisma.sql`location_kind`, Prisma.sql`location_id`)}
        GROUP BY 1, 2, 3`,
      this.inTransit(workspaceId, filter.locations),
    ]);

    const positions = new Map<
      string,
      { location: StockLocation; materialId: string; stock: string; inTransit: string }
    >();
    const at = (kind: StockLocationKind, id: string, materialId: string) => {
      const key = `${kind}:${id}:${materialId}`;
      let position = positions.get(key);
      if (position == null) {
        position = {
          location: { kind, id },
          materialId,
          stock: "0.000",
          inTransit: "0.000",
        };
        positions.set(key, position);
      }
      return position;
    };
    for (const row of stockRows)
      at(row.kind, row.locationId, row.materialId).stock = Quantity.of(
        row.quantity,
        "unit",
      ).toDecimalString();
    for (const row of transitRows)
      at(row.kind, row.locationId, row.materialId).inTransit = Quantity.of(
        row.quantity,
        "unit",
      ).toDecimalString();

    const materialIds = [
      ...new Set([...positions.values()].map((row) => row.materialId)),
    ];
    const [materials, minimums] = await Promise.all([
      this.directory.materials(this.db, workspaceId, materialIds),
      this.minimums(workspaceId, materialIds),
    ]);
    const names = this.locationNames(locations);
    await this.addMissingNames(workspaceId, names, [...positions.values()]);

    const search = filter.search?.trim().toLowerCase() ?? "";
    const grouped = new Map<string, InventoryMaterial>();
    for (const position of positions.values()) {
      const material = materials.get(position.materialId);
      if (filter.categoryId != null && material?.categoryId !== filter.categoryId)
        continue;
      const materialName = material?.name ?? DELETED_MATERIAL;
      if (search !== "" && !materialName.toLowerCase().includes(search))
        continue;
      const minimum =
        minimums.get(`${stockLocationKey(position.location)}:${position.materialId}`) ??
        material?.minStockQty ??
        null;
      const state = stockState(position.stock, minimum);
      if (filter.state != null && filter.state !== state) continue;
      const location = names.get(stockLocationKey(position.location)) ?? {
        ...position.location,
        name: position.location.kind === "project" ? "Deleted Project" : "Deleted store",
      };
      const entry: InventoryPosition = {
        location,
        stock: position.stock,
        inTransit: position.inTransit,
        minimum,
        state,
      };
      const group = grouped.get(position.materialId) ?? {
        ...materialHeader(position.materialId, material),
        totalStock: "0.000",
        totalInTransit: "0.000",
        positions: [],
      };
      group.positions.push(entry);
      grouped.set(position.materialId, group);
    }
    const list = [...grouped.values()].map((group) => {
      group.positions.sort((a, b) => compareLocations(a.location, b.location));
      group.totalStock = sumQuantities(group.positions.map((row) => row.stock));
      group.totalInTransit = sumQuantities(
        group.positions.map((row) => row.inTransit),
      );
      return group;
    });
    list.sort(
      (a, b) =>
        a.materialName.localeCompare(b.materialName, "en-IN") ||
        a.materialId.localeCompare(b.materialId),
    );
    return { locations, materials: list };
  }

  async stockLedger(filter: StockLedgerFilter): Promise<StockLedgerReport> {
    const { workspaceId } = filter;
    const from = calendarDateToDb(filter.from);
    const to = calendarDateToDb(filter.to);
    const where = Prisma.sql`workspace_id = ${workspaceId}
      ${locationFilter(filter.locations, Prisma.sql`location_kind`, Prisma.sql`location_id`)}`;
    const [openings, movements, locations] = await Promise.all([
      this.db.$queryRaw<PositionRow[]>`
        SELECT location_kind::text AS kind, location_id::text AS "locationId",
               material_id::text AS "materialId", SUM(quantity)::text AS quantity
        FROM "construction_procurement"."stock_entries"
        WHERE ${where} AND entry_date < ${from}::date
        GROUP BY 1, 2, 3`,
      this.db.$queryRaw<(PositionRow & { type: StockEntryType })[]>`
        SELECT location_kind::text AS kind, location_id::text AS "locationId",
               material_id::text AS "materialId", type::text AS type,
               SUM(quantity)::text AS quantity
        FROM "construction_procurement"."stock_entries"
        WHERE ${where} AND entry_date >= ${from}::date AND entry_date <= ${to}::date
        GROUP BY 1, 2, 3, 4`,
      this.locations(workspaceId),
    ]);

    const pairs = new Map<
      string,
      {
        location: StockLocation;
        materialId: string;
        opening: string;
        byType: Map<StockEntryType, string>;
      }
    >();
    const pair = (row: PositionRow) => {
      const key = `${row.kind}:${row.locationId}:${row.materialId}`;
      let found = pairs.get(key);
      if (found == null) {
        found = {
          location: { kind: row.kind, id: row.locationId },
          materialId: row.materialId,
          opening: "0",
          byType: new Map(),
        };
        pairs.set(key, found);
      }
      return found;
    };
    for (const row of openings) pair(row).opening = row.quantity;
    for (const row of movements) pair(row).byType.set(row.type, row.quantity);

    const materialIds = [...new Set([...pairs.values()].map((p) => p.materialId))];
    const materials = await this.directory.materials(
      this.db,
      workspaceId,
      materialIds,
    );
    const names = this.locationNames(locations);
    await this.addMissingNames(workspaceId, names, [...pairs.values()]);
    const search = filter.search?.trim().toLowerCase() ?? "";

    const rows: StockLedgerRow[] = [];
    for (const entry of pairs.values()) {
      const material = materials.get(entry.materialId);
      if (filter.categoryId != null && material?.categoryId !== filter.categoryId)
        continue;
      const header = materialHeader(entry.materialId, material);
      if (search !== "" && !header.materialName.toLowerCase().includes(search))
        continue;
      const line = stockLedgerLine(entry.opening, entry.byType);
      const quiet =
        Quantity.of(line.opening, "unit").isZero() &&
        Object.values(line.movements).every((value) =>
          Quantity.of(value, "unit").isZero(),
        ) &&
        entry.byType.size === 0;
      if (quiet) continue;
      rows.push({
        ...line,
        location: names.get(stockLocationKey(entry.location)) ?? {
          ...entry.location,
          name: entry.location.kind === "project" ? "Deleted Project" : "Deleted store",
        },
        materialId: entry.materialId,
        materialName: header.materialName,
        uomName: header.uomName,
        categoryName: header.categoryName,
      });
    }
    rows.sort(
      (a, b) =>
        compareLocations(a.location, b.location) ||
        a.materialName.localeCompare(b.materialName, "en-IN") ||
        a.materialId.localeCompare(b.materialId),
    );
    return { from: filter.from, to: filter.to, rows };
  }

  /** What approved, undelivered transfers and Delivery Notes carry to each location. */
  private async inTransit(
    workspaceId: string,
    locations: readonly StockLocation[] | undefined,
  ): Promise<PositionRow[]> {
    return this.db.$queryRaw<PositionRow[]>`
      SELECT kind, "locationId", "materialId", SUM(quantity)::text AS quantity
      FROM (
        SELECT t.to_kind::text AS kind, t.to_id AS "locationId",
               i.material_id AS "materialId", i.quantity
        FROM "construction_procurement"."material_transfers" t
        JOIN "construction_procurement"."material_transfer_items" i
          ON i.material_transfer_id = t.id
        WHERE t.workspace_id = ${workspaceId}
          AND t.deleted_at IS NULL AND t.approval_status = 'approved'
          AND t.delivered_at IS NULL
          ${locationFilter(locations, Prisma.sql`t.to_kind`, Prisma.sql`t.to_id`)}
        UNION ALL
        SELECT 'project' AS kind, d.project_id AS "locationId",
               i.material_id AS "materialId", i.quantity
        FROM "construction_procurement"."delivery_notes" d
        JOIN "construction_procurement"."delivery_note_items" i
          ON i.delivery_note_id = d.id
        WHERE d.workspace_id = ${workspaceId}
          AND d.deleted_at IS NULL AND d.approval_status = 'approved'
          AND d.delivered_at IS NULL
          ${locationFilter(locations, Prisma.sql`'project'`, Prisma.sql`d.project_id`)}
      ) moving
      GROUP BY kind, "locationId", "materialId"`.then((rows) =>
      rows.map((row) => ({
        ...row,
        locationId: String(row.locationId),
        materialId: String(row.materialId),
      })),
    );
  }

  /** Per-location minimum overrides, keyed `kind:locationId:materialId`. */
  private async minimums(
    workspaceId: string,
    materialIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (materialIds.length === 0) return new Map();
    const rows = await this.db.constructionProcurementStockSetting.findMany({
      where: {
        workspaceId,
        materialId: { in: [...materialIds] },
        minStockQty: { not: null },
      },
      select: {
        locationKind: true,
        locationId: true,
        materialId: true,
        minStockQty: true,
      },
    });
    return new Map(
      rows.map((row) => [
        `${row.locationKind}:${row.locationId}:${row.materialId}`,
        row.minStockQty?.toFixed(3) ?? "0.000",
      ]),
    );
  }

  private locationNames(
    locations: readonly InventoryLocation[],
  ): Map<string, InventoryLocation> {
    return new Map(
      locations.map((location) => [stockLocationKey(location), location]),
    );
  }

  /** Names of Projects the lister left out (e.g. one it does not return). */
  private async addMissingNames(
    workspaceId: string,
    names: Map<string, InventoryLocation>,
    rows: readonly { location: StockLocation }[],
  ): Promise<void> {
    const missing = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.location.kind === "project" &&
              !names.has(stockLocationKey(row.location)),
          )
          .map((row) => row.location.id),
      ),
    ];
    if (missing.length === 0) return;
    const projects = await this.directory.projects(this.db, workspaceId, missing);
    for (const project of projects.values())
      names.set(`project:${project.id}`, {
        kind: "project",
        id: project.id,
        name: project.name,
      });
  }
}

function materialHeader(materialId: string, material: MaterialFacts | undefined) {
  return {
    materialId,
    materialName: material?.name ?? DELETED_MATERIAL,
    uomName: material?.uomName ?? "",
    categoryId: material?.categoryId ?? null,
    categoryName: material?.categoryName ?? null,
  };
}
