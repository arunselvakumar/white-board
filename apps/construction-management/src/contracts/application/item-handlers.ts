import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  itemFields,
  itemNotFound,
  itemUomInvalid,
  type ItemFields,
  type ItemInput,
} from "../domain/item";
import {
  rateAnalysis,
  type AnalysisLine,
  type AnalysisLineInput,
} from "../domain/item-analysis";
import {
  importItems,
  type ItemImportResult,
  type ItemSheetRow,
} from "./item-import";
import type {
  ContractsDirectory,
  ContractsEquipmentFacts,
  ContractsLabourCategoryFacts,
  ContractsMaterialFacts,
  ContractsTx,
  ContractsUomFacts,
} from "./ports";

export const ITEMS_MENU = "contracts.items";

/** The Materials menu whose Financial flag shows a Material's unit rate. */
const MATERIAL_RATES_MENU = "masters.materials";

/** At most this many Items in one export (narrow it with search or schedule). */
export const ITEM_EXPORT_MAX = 10_000;

// ---------------------------------------------------------------------------
// What is stored (Prisma in `infrastructure/prisma-item-store`)
// ---------------------------------------------------------------------------

export type StoredItemLine = AnalysisLine & { id: string; position: number };

/** An Item without its analysis lines: a list row, an import match. */
export type ItemSummary = ItemFields & {
  id: string;
  workspaceId: string;
  /** Hundredths of a percent. */
  overheadPercent: bigint | null;
  /** Paise; null without an analysis. */
  analysedRate: bigint | null;
  lineCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredItem = ItemSummary & { lines: StoredItemLine[] };

/** A list position: code order, then id. */
export type ItemCursor = { code: string; id: string };

export type ItemFilter = {
  workspaceId: string;
  /** Part of the code, short description or description. */
  search?: string;
  /** Exactly this schedule label. */
  schedule?: string;
};

export type ItemListParams = ItemFilter & {
  limit: number;
  after?: ItemCursor;
  before?: ItemCursor;
};

/**
 * Where Items live. Every write runs in one transaction with its audit
 * events; the live code is unique ignoring case (409 `ITEM_CODE_TAKEN`).
 */
export type ItemStore = {
  find(workspaceId: string, id: string): Promise<StoredItem | null>;
  /** Code order (ADR-0020 cursors both ways) with the filter's total. */
  list(params: ItemListParams): Promise<{
    items: ItemSummary[];
    total: number;
    hasMore: boolean;
  }>;
  /** Every Item matching the filter in code order, at most `limit`, and the total. */
  all(
    filter: ItemFilter,
    limit: number,
  ): Promise<{ items: ItemSummary[]; total: number }>;
  /** Distinct schedules of live Items, A–Z. */
  schedules(workspaceId: string): Promise<string[]>;
  /** Live Items whose code is one of `codes`, ignoring case. */
  byCodes(
    workspaceId: string,
    codes: readonly string[],
  ): Promise<ItemSummary[]>;
  insert(item: StoredItem): Promise<void>;
  /**
   * Replaces the fields and the analysis lines when `updatedAt` is still
   * `expectedUpdatedAt` (else 409 `ITEM_CHANGED`).
   */
  update(input: {
    before: StoredItem;
    after: StoredItem;
    expectedUpdatedAt: Date;
  }): Promise<void>;
  /**
   * Tombstones it; 409 `ITEM_IN_USE` (`details.count`) while a live BOQ
   * item names it, 409 `ITEM_CHANGED` when `expectedUpdatedAt` is stale.
   */
  delete(input: {
    item: StoredItem;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
  /** An import: new Items and changed fields of existing ones, all or none. */
  importRows(input: {
    workspaceId: string;
    by: string;
    now: Date;
    creates: StoredItem[];
    updates: { before: ItemSummary; after: ItemSummary }[];
  }): Promise<void>;
};

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type ItemLineView = StoredItemLine & {
  materialName: string | null;
  labourCategoryName: string | null;
  equipmentName: string | null;
  resourceUomName: string | null;
};

export type ItemSummaryView = ItemSummary & { uomName: string };

export type ItemView = ItemSummaryView & { lines: ItemLineView[] };

/** A Material in the rate analysis picker; the rate needs Materials Financial. */
export type ItemMaterialOption = {
  id: string;
  name: string;
  specification: string | null;
  uomId: string;
  uomName: string;
  /** Paise per unit: the line's suggested rate. */
  unitRate: bigint | null;
};

export type ItemFormOptions = {
  uoms: ContractsUomFacts[];
  labourCategories: ContractsLabourCategoryFacts[];
  equipment: ContractsEquipmentFacts[];
};

export type ItemCommand = ItemInput & {
  overheadPercent?: string | number | null;
  lines?: readonly AnalysisLineInput[];
};

export type ItemDeps = {
  store: ItemStore;
  directory: ContractsDirectory;
  /** Reads through the directory (outside the store's transactions). */
  db: ContractsTx;
  clock?: () => Date;
};

function lineInvalid(
  code: string,
  message: string,
  line: number,
  field: string,
): DomainError {
  return new DomainError(code, message, {
    details: { line, field: `lines.${String(line)}.${field}` },
  });
}

/** A picked row must be live and enabled, unless the Item already had it. */
function usable(
  facts: { active: boolean } | undefined,
  kept: boolean,
): boolean {
  return facts != null && (facts.active || kept);
}

const ids = (values: (string | null)[]): string[] =>
  values.filter((value): value is string => value != null);

/**
 * Master records → Item Library (CM-1102, ADR CM-0023 §3; menu
 * `contracts.items`, C R U D E I, Company-level). Codes are unique among the
 * Company's live Items ignoring case. Materials, Labour Categories,
 * Equipment and UoMs are read through the `ContractsDirectory`.
 */
export class ItemHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: ItemDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async load(workspaceId: string, id: string): Promise<StoredItem> {
    const item = await this.deps.store.find(workspaceId, id);
    if (item == null) throw itemNotFound();
    return item;
  }

  /** The names screens show beside each id. */
  private async view(item: StoredItem): Promise<ItemView> {
    const { directory, db } = this.deps;
    const ws = item.workspaceId;
    const [uoms, materials, labourCategories, equipment] = await Promise.all([
      directory.uoms(db, ws, [
        item.uomId,
        ...ids(item.lines.map((line) => line.resourceUomId)),
      ]),
      directory.materials(db, ws, ids(item.lines.map((l) => l.materialId))),
      directory.labourCategories(
        db,
        ws,
        ids(item.lines.map((l) => l.labourCategoryId)),
      ),
      directory.equipment(db, ws, ids(item.lines.map((l) => l.equipmentId))),
    ]);
    const name = <T extends { name: string }>(
      map: ReadonlyMap<string, T>,
      id: string | null,
    ) => (id == null ? null : (map.get(id)?.name ?? null));
    return {
      ...item,
      uomName: uoms.get(item.uomId)?.name ?? "",
      lines: item.lines.map((line) => ({
        ...line,
        materialName: name(materials, line.materialId),
        labourCategoryName: name(labourCategories, line.labourCategoryId),
        equipmentName:
          line.equipmentId == null
            ? null
            : (() => {
                const found = equipment.get(line.equipmentId);
                return found == null
                  ? null
                  : `${found.name} (${found.equipmentNumber})`;
              })(),
        resourceUomName: name(uoms, line.resourceUomId),
      })),
    };
  }

  private async summaries(
    workspaceId: string,
    items: ItemSummary[],
  ): Promise<ItemSummaryView[]> {
    const uoms = await this.deps.directory.uoms(
      this.deps.db,
      workspaceId,
      items.map((item) => item.uomId),
    );
    return items.map((item) => ({
      ...item,
      uomName: uoms.get(item.uomId)?.name ?? "",
    }));
  }

  /**
   * Checks the UoM and every line's Material, Labour Category, Equipment
   * and resource UoM against the Company's masters. A material line
   * without a resource UoM takes the Material's.
   */
  private async checkReferences(
    workspaceId: string,
    fields: ItemFields,
    lines: AnalysisLine[],
    before: StoredItem | null,
  ): Promise<AnalysisLine[]> {
    const { directory, db } = this.deps;
    const keptUoms = new Set(
      before == null
        ? []
        : [before.uomId, ...ids(before.lines.map((l) => l.resourceUomId))],
    );
    const keptMaterials = new Set(
      ids(before?.lines.map((line) => line.materialId) ?? []),
    );
    const keptLabour = new Set(
      ids(before?.lines.map((line) => line.labourCategoryId) ?? []),
    );
    const keptEquipment = new Set(
      ids(before?.lines.map((line) => line.equipmentId) ?? []),
    );
    const [uoms, materials, labourCategories, equipment] = await Promise.all([
      directory.uoms(db, workspaceId, [
        fields.uomId,
        ...ids(lines.map((line) => line.resourceUomId)),
      ]),
      directory.materials(db, workspaceId, ids(lines.map((l) => l.materialId))),
      directory.labourCategories(
        db,
        workspaceId,
        ids(lines.map((l) => l.labourCategoryId)),
      ),
      directory.equipment(
        db,
        workspaceId,
        ids(lines.map((l) => l.equipmentId)),
      ),
    ]);
    if (!usable(uoms.get(fields.uomId), keptUoms.has(fields.uomId)))
      throw itemUomInvalid();
    return lines.map((line, index) => {
      let resourceUomId = line.resourceUomId;
      if (line.materialId != null) {
        const material = materials.get(line.materialId);
        if (!usable(material, keptMaterials.has(line.materialId)))
          throw lineInvalid(
            "ANALYSIS_MATERIAL_INVALID",
            "Pick a Material from Master records → Materials.",
            index,
            "materialId",
          );
        resourceUomId ??= material?.uomId ?? null;
      }
      if (
        line.labourCategoryId != null &&
        !usable(
          labourCategories.get(line.labourCategoryId),
          keptLabour.has(line.labourCategoryId),
        )
      )
        throw lineInvalid(
          "ANALYSIS_LABOUR_CATEGORY_INVALID",
          "Pick a Labour Category from Master records → Labour Categories.",
          index,
          "labourCategoryId",
        );
      if (
        line.equipmentId != null &&
        !usable(
          equipment.get(line.equipmentId),
          keptEquipment.has(line.equipmentId),
        )
      )
        throw lineInvalid(
          "ANALYSIS_EQUIPMENT_INVALID",
          "Pick an Equipment from Master records → Equipments.",
          index,
          "equipmentId",
        );
      if (
        line.resourceUomId != null &&
        !usable(uoms.get(line.resourceUomId), keptUoms.has(line.resourceUomId))
      )
        throw lineInvalid(
          "ANALYSIS_UOM_INVALID",
          "Pick a UoM from Master records → Measurement Units.",
          index,
          "resourceUomId",
        );
      return { ...line, resourceUomId };
    });
  }

  /** Every check of the form, references included. */
  private async content(
    workspaceId: string,
    input: ItemCommand,
    before: StoredItem | null,
  ) {
    const fields = itemFields(input);
    const analysis = rateAnalysis(input.lines ?? [], input.overheadPercent);
    const lines = await this.checkReferences(
      workspaceId,
      fields,
      analysis.lines,
      before,
    );
    return { fields, analysis, lines };
  }

  async get(access: MemberAccess, id: string): Promise<ItemView> {
    assertCan(access, ITEMS_MENU, "read");
    return this.view(await this.load(access.workspaceId, id));
  }

  async list(
    access: MemberAccess,
    params: Omit<ItemListParams, "workspaceId">,
  ) {
    assertCan(access, ITEMS_MENU, "read");
    const page = await this.deps.store.list({
      ...params,
      workspaceId: access.workspaceId,
    });
    return {
      ...page,
      items: await this.summaries(access.workspaceId, page.items),
    };
  }

  /** The schedule filter's choices. */
  async schedules(access: MemberAccess): Promise<string[]> {
    assertCan(access, ITEMS_MENU, "read");
    return this.deps.store.schedules(access.workspaceId);
  }

  /** The current filter in code order, for the Excel export (Export flag). */
  async export(
    access: MemberAccess,
    filter: Omit<ItemFilter, "workspaceId">,
  ): Promise<ItemSummaryView[]> {
    assertCan(access, ITEMS_MENU, "export");
    const found = await this.deps.store.all(
      { ...filter, workspaceId: access.workspaceId },
      ITEM_EXPORT_MAX,
    );
    if (found.total > ITEM_EXPORT_MAX)
      throw new DomainError(
        "EXPORT_TOO_MANY",
        `Export at most ${ITEM_EXPORT_MAX.toLocaleString("en-IN")} Items at a time. Narrow it with a search or a schedule.`,
      );
    return this.summaries(access.workspaceId, found.items);
  }

  /** The form's UoMs, Labour Categories and Equipment (Item Add or Edit). */
  async formOptions(access: MemberAccess): Promise<ItemFormOptions> {
    this.assertEditor(access);
    const { directory, db } = this.deps;
    const ws = access.workspaceId;
    const [uoms, labourCategories, equipment] = await Promise.all([
      directory.uomOptions(db, ws),
      directory.labourCategoryOptions(db, ws),
      directory.equipmentOptions(db, ws),
    ]);
    return { uoms, labourCategories, equipment };
  }

  /**
   * Materials for a material line, by name. The unit rate is the line's
   * suggested rate, shown only with Materials Financial.
   */
  async materialOptions(
    access: MemberAccess,
    query: { search?: string; limit: number },
  ): Promise<ItemMaterialOption[]> {
    this.assertEditor(access);
    const rates = can(access, MATERIAL_RATES_MENU, "financial");
    const rows = await this.deps.directory.materialOptions(
      this.deps.db,
      access.workspaceId,
      query,
    );
    return rows.map((row: ContractsMaterialFacts) => ({
      id: row.id,
      name: row.name,
      specification: row.specification,
      uomId: row.uomId,
      uomName: row.uomName,
      unitRate: rates ? row.unitRate : null,
    }));
  }

  private assertEditor(access: MemberAccess): void {
    if (!can(access, ITEMS_MENU, "create"))
      assertCan(access, ITEMS_MENU, "update");
  }

  async create(access: MemberAccess, input: ItemCommand): Promise<ItemView> {
    assertCan(access, ITEMS_MENU, "create");
    const { fields, analysis, lines } = await this.content(
      access.workspaceId,
      input,
      null,
    );
    const now = this.clock();
    const at = now.getTime();
    const item: StoredItem = {
      ...fields,
      id: newId(at),
      workspaceId: access.workspaceId,
      overheadPercent: analysis.overheadPercent,
      analysedRate: analysis.analysedRate,
      lineCount: lines.length,
      lines: lines.map((line, position) => ({
        ...line,
        id: newId(at),
        position,
      })),
      createdAt: now,
      updatedAt: now,
      createdBy: access.userId,
      updatedBy: access.userId,
    };
    await this.deps.store.insert(item);
    return this.view(item);
  }

  /** The whole form; the analysis lines are replaced. */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: ItemCommand,
  ): Promise<ItemView> {
    assertCan(access, ITEMS_MENU, "update");
    const before = await this.load(access.workspaceId, id);
    const { fields, analysis, lines } = await this.content(
      access.workspaceId,
      input,
      before,
    );
    const now = this.clock();
    const at = now.getTime();
    const after: StoredItem = {
      ...before,
      ...fields,
      overheadPercent: analysis.overheadPercent,
      analysedRate: analysis.analysedRate,
      lineCount: lines.length,
      lines: lines.map((line, position) => ({
        ...line,
        id: newId(at),
        position,
      })),
      updatedAt: now,
      updatedBy: access.userId,
    };
    await this.deps.store.update({ before, after, expectedUpdatedAt });
    return this.view(after);
  }

  /** 409 `ITEM_IN_USE` with `details.count` while a live BOQ item names it. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    assertCan(access, ITEMS_MENU, "delete");
    const item = await this.load(access.workspaceId, id);
    await this.deps.store.delete({
      item,
      expectedUpdatedAt,
      by: access.userId,
      now: this.clock(),
    });
  }

  /** The Excel import (Import flag): all rows or none. */
  async importSheet(
    access: MemberAccess,
    rows: readonly ItemSheetRow[],
  ): Promise<ItemImportResult> {
    assertCan(access, ITEMS_MENU, "import");
    return importItems(this.deps, access, rows, this.clock());
  }

  /** The import sample needs the Import flag too. */
  assertCanImport(access: MemberAccess): void {
    assertCan(access, ITEMS_MENU, "import");
  }
}
