import type { MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  boqItemFields,
  boqKey,
  quantityText,
  sectionTitle,
  type BoqItemFields,
} from "../domain/boq";
import { sheetRupees } from "./item-import";
import type {
  BoqDeps,
  LibraryItemFacts,
  StoredBoqItem,
  StoredBoqSection,
} from "./boq-ports";
import type { ContractsProjectFacts } from "./ports";

/**
 * BOQ import (CM-1103, ADR CM-0023 §4): sections and items in one sheet.
 * Sections are matched by title ignoring case, and new ones are added in
 * the order the sheet first names them. Rows are matched to the BOQ by
 * Item no ignoring case: a new number adds an item, an existing one has
 * its fields replaced. A measured item's quantity and rate cannot change
 * here (a row error). A Library code links the Item Library Item and fills
 * the blank Description, UoM, SAC/HSN and Rate from it. All rows or none;
 * at most 5,000.
 */

export const BOQ_IMPORT_COLUMNS = [
  { key: "section", header: "Section", width: 26 },
  { key: "itemNo", header: "Item no", width: 10 },
  { key: "description", header: "Description", width: 60 },
  { key: "uom", header: "UoM", width: 10 },
  { key: "sacHsn", header: "SAC/HSN", width: 11 },
  { key: "quantity", header: "Quantity", width: 13 },
  { key: "rate", header: "Rate (₹)", width: 14 },
  { key: "place", header: "Wing / Location", width: 18 },
  { key: "libraryCode", header: "Library code", width: 14 },
] as const;

export type BoqImportColumnKey = (typeof BOQ_IMPORT_COLUMNS)[number]["key"];

export const BOQ_IMPORT_ROWS_MAX = 5000;

export type BoqImportCell = string | number | Date | null;

export type BoqSheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<BoqImportColumnKey, BoqImportCell>>;
};

export type BoqImportRowError = {
  row: number;
  column: string;
  message: string;
};

export type BoqImportResult = {
  sectionsCreated: number;
  created: number;
  updated: number;
  /** Rows whose item already had exactly these fields. */
  unchanged: number;
};

const HEADER_OF = Object.fromEntries(
  BOQ_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<BoqImportColumnKey, string>;

/** Domain fields (`details.field`) to the sheet's columns. */
const COLUMN_OF_FIELD: Record<string, BoqImportColumnKey> = {
  title: "section",
  itemNo: "itemNo",
  description: "description",
  uomId: "uom",
  sacHsn: "sacHsn",
  quantity: "quantity",
  rate: "rate",
  wingId: "place",
  locationId: "place",
};

function text(cell: BoqImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** A quantity cell as text the domain reads: a number cell keeps four places. */
export function sheetQuantity(cell: BoqImportCell | undefined): string {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "x";
    const scaled = Math.round(cell * 10_000);
    // An Excel number is binary: 12.3456 may be 12.345599…, so allow that
    // slip; anything with more places is left for the domain to refuse.
    if (
      !Number.isSafeInteger(scaled) ||
      Math.abs(cell * 10_000 - scaled) > 1e-6
    )
      return String(cell);
    return quantityText(BigInt(scaled));
  }
  return text(cell).replace(/,/g, "");
}

function rowsError(errors: BoqImportRowError[]): DomainError {
  const order: string[] = BOQ_IMPORT_COLUMNS.map((column) => column.header);
  const sorted = [...errors].sort(
    (a, b) =>
      a.row - b.row || order.indexOf(a.column) - order.indexOf(b.column),
  );
  return new DomainError(
    "IMPORT_HAS_ERRORS",
    `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
    { details: { errors: sorted } },
  );
}

/** Names to ids, ignoring case; a name more than one row has is ambiguous. */
function byName(
  rows: readonly { id: string; name: string }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows)
    map.set(boqKey(row.name), [...(map.get(boqKey(row.name)) ?? []), row.id]);
  return map;
}

function sameItem(a: StoredBoqItem, b: StoredBoqItem): boolean {
  return (
    a.sectionId === b.sectionId &&
    a.itemId === b.itemId &&
    a.itemNo === b.itemNo &&
    a.description === b.description &&
    a.uomId === b.uomId &&
    a.sacHsn === b.sacHsn &&
    a.quantity === b.quantity &&
    a.rate === b.rate &&
    a.wingId === b.wingId &&
    a.locationId === b.locationId
  );
}

/** An audit snapshot: money as paise numbers, quantities as text. */
export function boqItemSnapshot(item: StoredBoqItem) {
  return {
    sectionId: item.sectionId,
    itemId: item.itemId,
    itemNo: item.itemNo,
    description: item.description,
    uomId: item.uomId,
    sacHsn: item.sacHsn,
    originalQuantity: quantityText(item.originalQuantity),
    quantity: quantityText(item.quantity),
    originalRate: Number(item.originalRate),
    rate: Number(item.rate),
    wingId: item.wingId,
    locationId: item.locationId,
  };
}

/**
 * Checks every row inside the Project's BOQ lock, then adds sections and
 * items and updates items in the same transaction. Any problem saves
 * nothing: 400 `IMPORT_HAS_ERRORS` with `details.errors` =
 * [{ row, column, message }]; 400 `IMPORT_EMPTY`, `IMPORT_TOO_MANY`.
 */
export async function importBoq(
  deps: BoqDeps,
  access: MemberAccess,
  project: ContractsProjectFacts,
  rows: readonly BoqSheetRow[],
  now: Date,
): Promise<BoqImportResult> {
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > BOQ_IMPORT_ROWS_MAX)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${BOQ_IMPORT_ROWS_MAX.toLocaleString("en-IN")} rows at a time.`,
    );
  const { store, directory } = deps;
  const ws = access.workspaceId;
  const projectId = project.id;
  const at = now.getTime();

  return deps.db.$transaction(
    async (tx) => {
      await store.lock(tx, ws, projectId);
      const codes = rows
        .map(({ cells }) => text(cells.libraryCode))
        .filter((code) => code !== "");
      const [sections, items, measured, uomOptions, wings, locations, library] =
        await Promise.all([
          store.sections(tx, ws, projectId),
          store.items(tx, ws, projectId),
          store.measured(tx, ws, projectId),
          directory.uomOptions(tx, ws),
          project.structure === "wings"
            ? directory.wings(tx, ws, projectId)
            : Promise.resolve([]),
          project.structure === "locations"
            ? directory.locations(tx, ws, projectId)
            : Promise.resolve([]),
          store.lockLibraryItemsByCode(tx, ws, codes),
        ]);
      // An existing item may keep a UoM that was disabled since.
      const keptUoms = await directory.uoms(
        tx,
        ws,
        items.map((item) => item.uomId),
      );
      const uomsById = new Map(uomOptions.map((uom) => [uom.id, uom.name]));
      const uomsByName = byName(uomOptions);
      const places = byName(project.structure === "wings" ? wings : locations);
      const libraryByCode = new Map<string, LibraryItemFacts>(
        library.map((item) => [boqKey(item.code), item]),
      );
      const sectionsByTitle = new Map(
        sections.map((section) => [boqKey(section.title), section]),
      );
      const itemsByNo = new Map(
        items.map((item) => [boqKey(item.itemNo), item]),
      );
      const nextPosition = new Map<string, number>();
      for (const item of items)
        nextPosition.set(
          item.sectionId,
          Math.max(nextPosition.get(item.sectionId) ?? 0, item.position + 1),
        );
      let sectionPosition =
        Math.max(-1, ...sections.map((section) => section.position)) + 1;

      const errors: BoqImportRowError[] = [];
      const seen = new Map<string, number>();
      const newSections: StoredBoqSection[] = [];
      const creates: StoredBoqItem[] = [];
      const updates: { before: StoredBoqItem; after: StoredBoqItem }[] = [];
      let unchanged = 0;

      for (const { row, cells } of rows) {
        const fail = (column: BoqImportColumnKey, message: string) => {
          errors.push({ row, column: HEADER_OF[column], message });
        };
        const before = errors.length;

        let title: string | null = null;
        try {
          title = sectionTitle(text(cells.section));
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          fail("section", error.message);
        }

        const itemNo = text(cells.itemNo);
        const noKey = boqKey(itemNo);
        if (itemNo !== "") {
          const first = seen.get(noKey);
          if (first != null)
            fail("itemNo", `This item number is also on row ${String(first)}.`);
          else seen.set(noKey, row);
        }
        const current = itemsByNo.get(noKey) ?? null;

        let libraryItem: LibraryItemFacts | null = null;
        const code = text(cells.libraryCode);
        if (code !== "") {
          libraryItem = libraryByCode.get(boqKey(code)) ?? null;
          if (libraryItem == null)
            fail(
              "libraryCode",
              `No Item in the Item Library has the code “${code}”.`,
            );
        }

        let uomId = "";
        const uomWord = text(cells.uom);
        if (uomWord === "" && libraryItem != null) uomId = libraryItem.uomId;
        else if (uomWord === "") fail("uom", "Write the UoM, like cum or sqm.");
        else {
          const found = uomsByName.get(boqKey(uomWord)) ?? [];
          const kept =
            current != null &&
            boqKey(keptUoms.get(current.uomId)?.name ?? "") === boqKey(uomWord);
          if (kept) uomId = current.uomId;
          else if (found.length === 1) uomId = found[0] ?? "";
          else if (found.length > 1)
            fail(
              "uom",
              `More than one Measurement Unit is named “${uomWord}”.`,
            );
          else
            fail(
              "uom",
              `No Measurement Unit is named “${uomWord}”. Add it in Master records → Measurement Units, or use one of yours.`,
            );
        }
        if (uomId !== "" && !uomsById.has(uomId) && current?.uomId !== uomId)
          fail("uom", "This UoM is disabled. Pick another one.");

        let rate: bigint | null = null;
        if (text(cells.rate) === "") {
          if (libraryItem != null) rate = libraryItem.adoptedRate;
          else fail("rate", "Write the rate in rupees.");
        } else {
          rate = sheetRupees(cells.rate);
          if (rate == null)
            fail("rate", "Write the rate in rupees, like 6123.45.");
        }

        let wingId: string | null = null;
        let locationId: string | null = null;
        const place = text(cells.place);
        if (place !== "") {
          const found = places.get(boqKey(place)) ?? [];
          const what = project.structure === "wings" ? "Wing" : "Location";
          if (found.length === 1) {
            if (project.structure === "wings") wingId = found[0] ?? null;
            else locationId = found[0] ?? null;
          } else if (found.length > 1)
            fail("place", `More than one ${what} is named “${place}”.`);
          else
            fail(
              "place",
              `This Project has no ${what} named “${place}”. Use one of its ${what}s.`,
            );
        }

        const description =
          text(cells.description) !== ""
            ? text(cells.description)
            : (libraryItem?.description ?? libraryItem?.shortDescription ?? "");
        const sacHsn =
          text(cells.sacHsn) !== ""
            ? text(cells.sacHsn)
            : (libraryItem?.sacHsn ?? null);

        // Checked even when an earlier column failed, so every column
        // reports; the stand-ins are never saved.
        let fields: BoqItemFields | null = null;
        try {
          fields = boqItemFields({
            itemNo,
            description,
            uomId: uomId === "" ? "-" : uomId,
            sacHsn,
            quantity: sheetQuantity(cells.quantity),
            rate: rate ?? 0n,
          });
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          const field = (error.details as { field?: string } | undefined)
            ?.field;
          fail(COLUMN_OF_FIELD[field ?? ""] ?? "itemNo", error.message);
        }
        if (fields == null || title == null || errors.length > before) continue;

        if (current != null && measured.has(current.id)) {
          if (fields.quantity !== current.quantity)
            fail(
              "quantity",
              "A checked measurement names this item, so its quantity changes only through a Variation.",
            );
          if (fields.rate !== current.rate)
            fail(
              "rate",
              "A checked measurement names this item, so its rate changes only through a Variation.",
            );
          if (errors.length > before) continue;
        }

        let section = sectionsByTitle.get(boqKey(title));
        if (section == null) {
          section = {
            id: newId(at),
            workspaceId: ws,
            projectId,
            title,
            position: sectionPosition,
            createdAt: now,
            updatedAt: now,
            createdBy: access.userId,
            updatedBy: access.userId,
          };
          sectionPosition += 1;
          sectionsByTitle.set(boqKey(title), section);
          newSections.push(section);
        }
        const position = (sectionId: string) => {
          const next = nextPosition.get(sectionId) ?? 0;
          nextPosition.set(sectionId, next + 1);
          return next;
        };

        if (current == null) {
          creates.push({
            id: newId(at),
            workspaceId: ws,
            projectId,
            sectionId: section.id,
            itemId: libraryItem?.id ?? null,
            itemNo: fields.itemNo,
            description: fields.description,
            uomId: fields.uomId,
            sacHsn: fields.sacHsn,
            originalQuantity: fields.quantity,
            quantity: fields.quantity,
            originalRate: fields.rate,
            rate: fields.rate,
            wingId,
            locationId,
            position: position(section.id),
            variationId: null,
            createdAt: now,
            updatedAt: now,
            createdBy: access.userId,
            updatedBy: access.userId,
          });
          continue;
        }
        const after: StoredBoqItem = {
          ...current,
          sectionId: section.id,
          itemId: libraryItem?.id ?? null,
          itemNo: fields.itemNo,
          description: fields.description,
          uomId: fields.uomId,
          sacHsn: fields.sacHsn,
          quantity: fields.quantity,
          rate: fields.rate,
          originalQuantity:
            current.originalQuantity === current.quantity
              ? fields.quantity
              : current.originalQuantity,
          originalRate:
            current.originalRate === current.rate
              ? fields.rate
              : current.originalRate,
          wingId,
          locationId,
          updatedAt: now,
          updatedBy: access.userId,
        };
        if (sameItem(current, after)) {
          unchanged += 1;
          continue;
        }
        if (after.sectionId !== current.sectionId)
          after.position = position(after.sectionId);
        updates.push({ before: current, after });
      }
      if (errors.length > 0) throw rowsError(errors);

      if (newSections.length > 0) await store.insertSections(tx, newSections);
      if (creates.length > 0) await store.insertItems(tx, creates);
      for (const { after } of updates) await store.updateItem(tx, after, null);
      await tx.constructionOrganizationAuditEvent.createMany({
        data: [
          ...newSections.map((section) => ({
            id: newId(at),
            workspaceId: ws,
            actorUserId: access.userId,
            action: "boq_section.created",
            entityType: "boq_section",
            entityId: section.id,
            after: {
              projectId,
              title: section.title,
              position: section.position,
              source: "import",
            },
            occurredAt: now,
          })),
          ...creates.map((item) => ({
            id: newId(at),
            workspaceId: ws,
            actorUserId: access.userId,
            action: "boq_item.created",
            entityType: "boq_item",
            entityId: item.id,
            after: { ...boqItemSnapshot(item), source: "import" },
            occurredAt: now,
          })),
          ...updates.map(({ before, after }) => ({
            id: newId(at),
            workspaceId: ws,
            actorUserId: access.userId,
            action: "boq_item.updated",
            entityType: "boq_item",
            entityId: before.id,
            before: boqItemSnapshot(before),
            after: { ...boqItemSnapshot(after), source: "import" },
            occurredAt: now,
          })),
        ],
      });
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "boq.imported",
        entityType: "project",
        entityId: projectId,
        after: {
          sectionsCreated: newSections.length,
          created: creates.length,
          updated: updates.length,
          unchanged,
        },
        occurredAt: now,
      });
      return {
        sectionsCreated: newSections.length,
        created: creates.length,
        updated: updates.length,
        unchanged,
      };
    },
    { timeout: 120_000 },
  );
}
