import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { isUuid } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type { MaterialFacts, ProcurementDirectory } from "../application/ports";
import {
  effectiveMinimum,
  stockState,
  type StockState,
} from "../domain/inventory-stock-state";
import {
  STOCK_ENTRY_LABELS,
  type StockEntryType,
  type StockSourceType,
} from "../domain/stock-ledger";
import type { StockLocation } from "../domain/stock-location";
import {
  isEditableMovement,
  type StockMovementKind,
} from "../domain/stock-movement";
import {
  stockRegisterRow,
  type StockRegisterFigures,
} from "../domain/stock-register";
import { userNames } from "./inventory-locations";

type Db = Prisma.TransactionClient;

const LOCATION_KIND = Prisma.sql`construction_procurement.location_kind`;

/** Decimal strings from Postgres, with three decimals. */
function q3(value: string | Prisma.Decimal | null | undefined): string {
  return new Prisma.Decimal(value ?? 0).toFixed(3);
}

function q3OrNull(value: string | Prisma.Decimal | null): string | null {
  return value == null ? null : q3(value);
}

// ---------------------------------------------------------------------------
// In transit (CM-0015 §4)
// ---------------------------------------------------------------------------

export type InTransit = {
  /** Approved, undelivered transfers and Delivery Notes coming here. */
  inbound: Map<string, string>;
  /** Approved, undelivered transfers and Delivery Notes leaving here. */
  outbound: Map<string, string>;
};

/**
 * Quantities dispatched but not yet delivered, per material: transfers
 * (both directions) and Delivery Notes (into a Project, out of a Store).
 */
export async function inTransit(
  db: Db,
  workspaceId: string,
  location: StockLocation,
  materialIds?: readonly string[],
): Promise<InTransit> {
  const materials =
    materialIds == null
      ? Prisma.empty
      : Prisma.sql`AND i.material_id = ANY(${[...materialIds]}::uuid[])`;
  const transfers = await db.$queryRaw<
    { direction: "in" | "out"; materialId: string; quantity: string }[]
  >`
    SELECT CASE WHEN t.to_kind = ${location.kind}::${LOCATION_KIND}
                 AND t.to_id = ${location.id}::uuid THEN 'in' ELSE 'out' END AS direction,
           i.material_id::text AS "materialId",
           SUM(i.quantity)::text AS quantity
    FROM construction_procurement.material_transfers t
    JOIN construction_procurement.material_transfer_items i
      ON i.material_transfer_id = t.id
    WHERE t.workspace_id = ${workspaceId}
      AND t.deleted_at IS NULL
      AND t.approval_status = 'approved'
      AND t.delivered_on IS NULL
      AND ((t.to_kind = ${location.kind}::${LOCATION_KIND} AND t.to_id = ${location.id}::uuid)
        OR (t.from_kind = ${location.kind}::${LOCATION_KIND} AND t.from_id = ${location.id}::uuid))
      ${materials}
    GROUP BY 1, 2`;
  const notes = await db.$queryRaw<{ materialId: string; quantity: string }[]>`
    SELECT i.material_id::text AS "materialId", SUM(i.quantity)::text AS quantity
    FROM construction_procurement.delivery_notes d
    JOIN construction_procurement.delivery_note_items i ON i.delivery_note_id = d.id
    WHERE d.workspace_id = ${workspaceId}
      AND d.deleted_at IS NULL
      AND d.approval_status = 'approved'
      AND d.delivered_on IS NULL
      AND ${location.kind === "project" ? Prisma.sql`d.project_id` : Prisma.sql`d.store_id`} = ${location.id}::uuid
      ${materials}
    GROUP BY 1`;
  const inbound = new Map<string, string>();
  const outbound = new Map<string, string>();
  const add = (map: Map<string, string>, id: string, quantity: string) => {
    map.set(id, new Prisma.Decimal(map.get(id) ?? 0).plus(quantity).toFixed(3));
  };
  for (const row of transfers)
    add(row.direction === "in" ? inbound : outbound, row.materialId, row.quantity);
  for (const row of notes)
    add(
      location.kind === "project" ? inbound : outbound,
      row.materialId,
      row.quantity,
    );
  return { inbound, outbound };
}

// ---------------------------------------------------------------------------
// Stock list (CM-506)
// ---------------------------------------------------------------------------

export type InventoryRow = {
  materialId: string;
  materialName: string;
  categoryId: string | null;
  categoryName: string | null;
  uomId: string;
  uomName: string;
  estimatedQty: string | null;
  inStock: string;
  inTransitIn: string;
  inTransitOut: string;
  /** What applies: the override, else the Material's. */
  minimum: string | null;
  minimumOverride: string | null;
  materialMinimum: string | null;
  alertEnabled: boolean;
  state: StockState;
};

export type InventoryFilters = {
  categoryId?: string;
  state?: StockState;
  search?: string;
};

export type InventoryList = {
  items: InventoryRow[];
  /** Over every row at the location, before filters. */
  summary: Record<StockState, number> & { materials: number };
};

/** Live stock per material at a location (summed ledger entries). */
async function stockByMaterial(
  db: Db,
  workspaceId: string,
  location: StockLocation,
): Promise<Map<string, string>> {
  const rows = await db.$queryRaw<{ materialId: string; quantity: string }[]>`
    SELECT material_id::text AS "materialId", SUM(quantity)::text AS quantity
    FROM construction_procurement.stock_entries
    WHERE workspace_id = ${workspaceId}
      AND location_kind = ${location.kind}::${LOCATION_KIND}
      AND location_id = ${location.id}::uuid
    GROUP BY material_id`;
  return new Map(rows.map((row) => [row.materialId, q3(row.quantity)]));
}

function matches(row: InventoryRow, filters: InventoryFilters): boolean {
  if (filters.categoryId != null && row.categoryId !== filters.categoryId)
    return false;
  if (filters.state != null && row.state !== filters.state) return false;
  const search = filters.search?.trim().toLowerCase() ?? "";
  if (search !== "" && !row.materialName.toLowerCase().includes(search))
    return false;
  return true;
}

/**
 * Every material with a ledger entry, a stock setting or stock in transit
 * at the location, by name, with its state (ADR CM-0015 §10). A position,
 * not a document list: it is not paged.
 */
export async function inventoryList(
  db: Db,
  directory: ProcurementDirectory,
  workspaceId: string,
  location: StockLocation,
  filters: InventoryFilters = {},
): Promise<InventoryList> {
  const [stock, settings, transit] = await Promise.all([
    stockByMaterial(db, workspaceId, location),
    db.constructionProcurementStockSetting.findMany({
      where: {
        workspaceId,
        locationKind: location.kind,
        locationId: location.id,
      },
    }),
    inTransit(db, workspaceId, location),
  ]);
  const ids = new Set([
    ...stock.keys(),
    ...settings.map((row) => row.materialId),
    ...transit.inbound.keys(),
    ...transit.outbound.keys(),
  ]);
  const materials = await directory.materials(db, workspaceId, [...ids]);
  const settingOf = new Map(settings.map((row) => [row.materialId, row]));
  const rows: InventoryRow[] = [];
  for (const id of ids) {
    const material = materials.get(id);
    if (material == null) continue;
    rows.push(
      inventoryRow(material, stock.get(id) ?? "0.000", settingOf.get(id), {
        inbound: transit.inbound.get(id),
        outbound: transit.outbound.get(id),
      }),
    );
  }
  rows.sort((a, b) =>
    a.materialName.localeCompare(b.materialName, "en", { sensitivity: "base" }),
  );
  const summary = {
    materials: rows.length,
    in_stock: 0,
    low_stock: 0,
    out_of_stock: 0,
  };
  for (const row of rows) summary[row.state] += 1;
  return { items: rows.filter((row) => matches(row, filters)), summary };
}

function inventoryRow(
  material: MaterialFacts,
  inStock: string,
  setting:
    | {
        estimatedQty: Prisma.Decimal | null;
        minStockQty: Prisma.Decimal | null;
        minAlertEnabled: boolean;
      }
    | undefined,
  transit: { inbound?: string; outbound?: string },
): InventoryRow {
  const minimumOverride = q3OrNull(setting?.minStockQty ?? null);
  const materialMinimum =
    material.minStockQty == null ? null : q3(material.minStockQty);
  const minimum = effectiveMinimum(minimumOverride, materialMinimum);
  return {
    materialId: material.id,
    materialName: material.name,
    categoryId: material.categoryId,
    categoryName: material.categoryName,
    uomId: material.uomId,
    uomName: material.uomName,
    estimatedQty: q3OrNull(setting?.estimatedQty ?? null),
    inStock,
    inTransitIn: transit.inbound ?? "0.000",
    inTransitOut: transit.outbound ?? "0.000",
    minimum,
    minimumOverride,
    materialMinimum,
    alertEnabled: setting?.minAlertEnabled ?? false,
    state: stockState(inStock, minimum),
  };
}

/** One material's row (after a settings change), or null when it has none here. */
export async function inventoryRowOf(
  db: Db,
  directory: ProcurementDirectory,
  workspaceId: string,
  location: StockLocation,
  materialId: string,
): Promise<InventoryRow | null> {
  const [materials, stock, setting, transit] = await Promise.all([
    directory.materials(db, workspaceId, [materialId]),
    db.$queryRaw<{ quantity: string | null }[]>`
      SELECT SUM(quantity)::text AS quantity
      FROM construction_procurement.stock_entries
      WHERE workspace_id = ${workspaceId}
        AND location_kind = ${location.kind}::${LOCATION_KIND}
        AND location_id = ${location.id}::uuid
        AND material_id = ${materialId}::uuid`,
    db.constructionProcurementStockSetting.findUnique({
      where: {
        workspaceId_locationKind_locationId_materialId: {
          workspaceId,
          locationKind: location.kind,
          locationId: location.id,
          materialId,
        },
      },
    }),
    inTransit(db, workspaceId, location, [materialId]),
  ]);
  const material = materials.get(materialId);
  if (material == null) return null;
  return inventoryRow(material, q3(stock[0]?.quantity), setting ?? undefined, {
    inbound: transit.inbound.get(materialId),
    outbound: transit.outbound.get(materialId),
  });
}

// ---------------------------------------------------------------------------
// History (CM-506)
// ---------------------------------------------------------------------------

/**
 * A history position: ledger order is entry date, then when recorded,
 * then a reversal before the entry posted with it (an edit writes both
 * at once), then id.
 */
export type HistoryCursor = {
  entryDate: CalendarDate;
  createdAt: Date;
  /** `reverses_entry_id IS NULL`. */
  posted: boolean;
  id: string;
};

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(
    `${cursor.entryDate}|${cursor.createdAt.toISOString()}|${cursor.posted ? "1" : "0"}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeHistoryCursor(raw: string): HistoryCursor {
  const [entryDate = "", createdAt = "", posted = "", id = ""] = Buffer.from(
    raw,
    "base64url",
  )
    .toString("utf8")
    .split("|");
  const at = new Date(createdAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) ||
    Number.isNaN(at.getTime()) ||
    (posted !== "0" && posted !== "1") ||
    !isUuid(id)
  )
    throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  return { entryDate, createdAt: at, posted: posted === "1", id };
}

export type HistorySource = {
  type: StockSourceType;
  id: string;
  /** The document's number (GRN, transfer, Delivery Note); null for a movement. */
  number: string | null;
  /** In-app link to the document, when it has a page on this location. */
  href: string | null;
};

export type HistoryEntry = {
  id: string;
  entryDate: CalendarDate;
  type: StockEntryType;
  typeLabel: string;
  /** Signed. */
  quantity: string;
  /** Stock after this entry, in ledger order. */
  balance: string;
  source: HistorySource;
  counterpartyLabel: string | null;
  siteLocation: LocationRef | null;
  remark: string | null;
  createdBy: { userId: string; name: string | null };
  createdAt: Date;
  /** This entry undoes `reversesEntryId` (an edit or a delete). */
  reversesEntryId: string | null;
  /** A later entry undid this one. */
  reversed: boolean;
  /** The live hand-entered movement behind it, for Edit and Delete. */
  movement: {
    id: string;
    kind: StockMovementKind;
    editable: boolean;
    updatedAt: Date;
  } | null;
};

export type HistoryPage = {
  items: HistoryEntry[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type HistoryRow = {
  id: string;
  entryDate: Date;
  type: StockEntryType;
  quantity: string;
  balance: string;
  sourceType: StockSourceType;
  sourceId: string;
  counterpartyLabel: string | null;
  siteLocation: Prisma.JsonValue;
  remark: string | null;
  createdBy: string;
  createdAt: Date;
  reversesEntryId: string | null;
  reversed: boolean;
};

/**
 * Every entry of one material at a location, newest entry date first,
 * with the running balance in ledger order (entry date, then when it was
 * recorded). Paged by cursor both ways, with a total.
 */
export async function inventoryHistory(
  db: Db,
  workspaceId: string,
  location: StockLocation,
  materialId: string,
  page: { limit: number; after?: HistoryCursor; before?: HistoryCursor },
): Promise<HistoryPage> {
  const backwards = page.before != null;
  const cursor = page.after ?? page.before;
  const position =
    cursor == null
      ? Prisma.empty
      : backwards
        ? Prisma.sql`AND (h.entry_date, h.created_at, h.reverses_entry_id IS NULL, h.id) > (${calendarDateToDb(cursor.entryDate)}::date, ${cursor.createdAt}, ${cursor.posted}, ${cursor.id}::uuid)`
        : Prisma.sql`AND (h.entry_date, h.created_at, h.reverses_entry_id IS NULL, h.id) < (${calendarDateToDb(cursor.entryDate)}::date, ${cursor.createdAt}, ${cursor.posted}, ${cursor.id}::uuid)`;
  const order = backwards
    ? Prisma.sql`ORDER BY h.entry_date ASC, h.created_at ASC, (h.reverses_entry_id IS NULL) ASC, h.id ASC`
    : Prisma.sql`ORDER BY h.entry_date DESC, h.created_at DESC, (h.reverses_entry_id IS NULL) DESC, h.id DESC`;
  const rows = await db.$queryRaw<HistoryRow[]>`
    SELECT h.id::text AS id, h.entry_date AS "entryDate", h.type::text AS type,
           h.quantity::text AS quantity, h.balance::text AS balance,
           h.source_type::text AS "sourceType", h.source_id::text AS "sourceId",
           h.counterparty_label AS "counterpartyLabel", h.site_location AS "siteLocation",
           h.remark, h.created_by AS "createdBy", h.created_at AS "createdAt",
           h.reverses_entry_id::text AS "reversesEntryId",
           EXISTS (
             SELECT 1 FROM construction_procurement.stock_entries r
             WHERE r.reverses_entry_id = h.id
           ) AS reversed
    FROM (
      SELECT e.*, SUM(e.quantity) OVER (
               ORDER BY e.entry_date, e.created_at, (e.reverses_entry_id IS NULL), e.id
             ) AS balance
      FROM construction_procurement.stock_entries e
      WHERE e.workspace_id = ${workspaceId}
        AND e.location_kind = ${location.kind}::${LOCATION_KIND}
        AND e.location_id = ${location.id}::uuid
        AND e.material_id = ${materialId}::uuid
    ) h
    WHERE TRUE ${position}
    ${order}
    LIMIT ${page.limit + 1}`;
  const hasMore = rows.length > page.limit;
  const shown = rows.slice(0, page.limit);
  if (backwards) shown.reverse();
  const totalRows = await db.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM construction_procurement.stock_entries
    WHERE workspace_id = ${workspaceId}
      AND location_kind = ${location.kind}::${LOCATION_KIND}
      AND location_id = ${location.id}::uuid
      AND material_id = ${materialId}::uuid`;
  const items = await describeEntries(db, workspaceId, location, shown);
  const first = shown[0];
  const last = shown.at(-1);
  const toCursor = (row: HistoryRow) =>
    encodeHistoryCursor({
      entryDate: calendarDateFromDb(row.entryDate),
      createdAt: row.createdAt,
      posted: row.reversesEntryId == null,
      id: row.id,
    });
  const moreAfter = backwards || hasMore;
  const moreBefore = backwards ? hasMore : page.after != null;
  return {
    items,
    nextCursor: moreAfter && last != null ? toCursor(last) : null,
    prevCursor: moreBefore && first != null ? toCursor(first) : null,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Links to a document's page from a Project's Materials module. */
function documentHref(
  location: StockLocation,
  type: StockSourceType,
  id: string,
): string | null {
  if (location.kind !== "project") return null;
  const base = `/app/projects/${encodeURIComponent(location.id)}/materials`;
  if (type === "goods_receipt") return `${base}/goods-received/${id}`;
  if (type === "material_transfer") return `${base}/transfers/${id}`;
  return null;
}

async function describeEntries(
  db: Db,
  workspaceId: string,
  location: StockLocation,
  rows: readonly HistoryRow[],
): Promise<HistoryEntry[]> {
  const idsOf = (type: StockSourceType) => [
    ...new Set(
      rows.filter((row) => row.sourceType === type).map((row) => row.sourceId),
    ),
  ];
  const [receipts, transfers, notes, movements, names] = await Promise.all([
    db.constructionProcurementGoodsReceipt.findMany({
      where: { workspaceId, id: { in: idsOf("goods_receipt") } },
      select: { id: true, number: true, deletedAt: true },
    }),
    db.constructionProcurementMaterialTransfer.findMany({
      where: { workspaceId, id: { in: idsOf("material_transfer") } },
      select: { id: true, number: true, deletedAt: true },
    }),
    db.constructionProcurementDeliveryNote.findMany({
      where: { workspaceId, id: { in: idsOf("delivery_note") } },
      select: { id: true, number: true, deletedAt: true },
    }),
    db.constructionProcurementStockMovement.findMany({
      where: {
        workspaceId,
        id: { in: idsOf("stock_movement") },
        deletedAt: null,
      },
      select: { id: true, kind: true, updatedAt: true },
    }),
    userNames(
      db,
      workspaceId,
      rows.map((row) => row.createdBy),
    ),
  ]);
  const numbers = new Map<string, { number: string; live: boolean }>(
    [...receipts, ...transfers, ...notes].map((row) => [
      row.id,
      { number: row.number, live: row.deletedAt == null },
    ]),
  );
  const movementOf = new Map(movements.map((row) => [row.id, row]));
  return rows.map((row) => {
    const document = numbers.get(row.sourceId);
    const movement = movementOf.get(row.sourceId);
    const live = row.reversesEntryId == null && !row.reversed;
    return {
      id: row.id,
      entryDate: calendarDateFromDb(row.entryDate),
      type: row.type,
      typeLabel: STOCK_ENTRY_LABELS[row.type],
      quantity: q3(row.quantity),
      balance: q3(row.balance),
      source: {
        type: row.sourceType,
        id: row.sourceId,
        number: document?.number ?? null,
        href:
          document?.live === true
            ? documentHref(location, row.sourceType, row.sourceId)
            : null,
      },
      counterpartyLabel: row.counterpartyLabel,
      siteLocation: (row.siteLocation ?? null) as LocationRef | null,
      remark: row.remark,
      createdBy: {
        userId: row.createdBy,
        name: names.get(row.createdBy) ?? null,
      },
      createdAt: row.createdAt,
      reversesEntryId: row.reversesEntryId,
      reversed: row.reversed,
      movement:
        movement != null && live && row.sourceType === "stock_movement"
          ? {
              id: movement.id,
              kind: movement.kind,
              editable: isEditableMovement(movement.kind),
              updatedAt: movement.updatedAt,
            }
          : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Stock Register (CM-506)
// ---------------------------------------------------------------------------

export type StockRegisterRow = StockRegisterFigures & {
  materialId: string;
  materialName: string;
  categoryName: string | null;
  uomName: string;
};

/**
 * Per material with any entry on or before `to`: the stock before `from`,
 * the movements by type from `from` to `to`, and the stock at `to`.
 * Materials that never moved and held nothing in the range are left out.
 */
export async function stockRegister(
  db: Db,
  directory: ProcurementDirectory,
  workspaceId: string,
  location: StockLocation,
  range: { from: CalendarDate; to: CalendarDate },
): Promise<StockRegisterRow[]> {
  if (range.to < range.from)
    throw new DomainError(
      "DATE_RANGE_INVALID",
      "The end date cannot be before the start date.",
      { details: { field: "to" } },
    );
  const rows = await db.$queryRaw<
    { materialId: string; type: StockEntryType | null; quantity: string }[]
  >`
    SELECT material_id::text AS "materialId",
           CASE WHEN entry_date < ${calendarDateToDb(range.from)}::date THEN NULL ELSE type::text END AS type,
           SUM(quantity)::text AS quantity
    FROM construction_procurement.stock_entries
    WHERE workspace_id = ${workspaceId}
      AND location_kind = ${location.kind}::${LOCATION_KIND}
      AND location_id = ${location.id}::uuid
      AND entry_date <= ${calendarDateToDb(range.to)}::date
    GROUP BY 1, 2`;
  const byMaterial = new Map<
    string,
    { before: string; moved: Partial<Record<StockEntryType, string>> }
  >();
  for (const row of rows) {
    const entry = byMaterial.get(row.materialId) ?? { before: "0", moved: {} };
    if (row.type == null) entry.before = q3(row.quantity);
    else entry.moved[row.type] = q3(row.quantity);
    byMaterial.set(row.materialId, entry);
  }
  const materials = await directory.materials(db, workspaceId, [
    ...byMaterial.keys(),
  ]);
  const result: StockRegisterRow[] = [];
  for (const [materialId, figures] of byMaterial) {
    const material = materials.get(materialId);
    if (material == null) continue;
    const row = stockRegisterRow(figures.before, figures.moved);
    const moved = Object.values(figures.moved).some(
      (value) => !new Prisma.Decimal(value).isZero(),
    );
    if (!moved && new Prisma.Decimal(row.opening).isZero()) continue;
    result.push({
      materialId,
      materialName: material.name,
      categoryName: material.categoryName,
      uomName: material.uomName,
      ...row,
    });
  }
  return result.sort((a, b) =>
    a.materialName.localeCompare(b.materialName, "en", { sensitivity: "base" }),
  );
}
