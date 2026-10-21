import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";

import {
  boqAmount,
  boqItemChanged,
  boqItemFields,
  boqItemLocationInvalid,
  boqItemMeasured,
  boqItemNotFound,
  boqItemNoTaken,
  boqItemUomInvalid,
  boqItemWingInvalid,
  boqLibraryItemNotFound,
  boqSectionChanged,
  boqSectionNotEmpty,
  boqSectionNotFound,
  boqSectionTitleTaken,
  boqTotals,
  movedOrder,
  orderValueDifference,
  sectionTitle,
  type BoqItemFields,
  type BoqItemInput,
} from "../domain/boq";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import { deviationLimit, isDeviation, percentOver } from "../domain/deviation";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import { variationPending, type VariationKind } from "../domain/variation";
import {
  boqItemSnapshot,
  importBoq,
  type BoqImportResult,
  type BoqSheetRow,
} from "./boq-import";
import {
  BOQ_MENU,
  type BoqDeps,
  type LibraryItemFacts,
  type StoredBoqItem,
  type StoredBoqSection,
  type StoredVariation,
} from "./boq-ports";
import type {
  ContractsLocationFacts,
  ContractsProjectFacts,
  ContractsTx,
  ContractsUomFacts,
  ContractsWingFacts,
} from "./ports";

export { BOQ_MENU } from "./boq-ports";

/** At most this many library Items in the BOQ's picker at a time. */
export const BOQ_LIBRARY_OPTIONS_MAX = 25;

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type PendingVariationRef = {
  id: string;
  number: string;
  kind: VariationKind;
};

export type BoqItemView = StoredBoqItem & {
  uomName: string;
  /** The Wing's or Location's name. */
  placeName: string | null;
  /** The library Item's code, when copied from one. */
  libraryCode: string | null;
  /** Paise: round(quantity × rate). */
  amount: bigint;
  /** A checked measurement names it: quantity and rate change only by Variation. */
  measured: boolean;
  /** Ten-thousandths: what checked measurements add up to; null when none. */
  measuredQuantity: bigint | null;
  /** A pending quantity or rate change, if one waits. */
  pendingVariation: PendingVariationRef | null;
};

export type BoqSectionView = StoredBoqSection & {
  items: BoqItemView[];
  /** Paise. */
  subtotal: bigint;
};

export type BoqView = {
  project: ContractsProjectFacts;
  sections: BoqSectionView[];
  /** Paise. */
  total: bigint;
  /** Paise, the Project's Order Value excluding GST. */
  orderValue: bigint | null;
  /** Paise: total − Order Value. */
  difference: bigint | null;
  /** Hundredths of a percent. */
  deviationLimit: bigint;
  /** The caller holds BOQ Financial: rates and amounts may be shown. */
  financial: boolean;
  /** The BOQ flags the caller holds on the Project. */
  viewerFlags: Flag[];
};

export type BoqFormOptions = {
  structure: "wings" | "locations";
  uoms: ContractsUomFacts[];
  wings: ContractsWingFacts[];
  locations: ContractsLocationFacts[];
  sections: { id: string; title: string }[];
};

export type BoqLibraryOption = LibraryItemFacts & { uomName: string };

export type BoqDeviation = {
  item: BoqItemView;
  sectionTitle: string;
  /** Ten-thousandths. */
  measuredQuantity: bigint;
  /** Hundredths of a percent over the current quantity. */
  percentOver: bigint | null;
};

export type BoqSettings = {
  /** Hundredths of a percent. */
  deviationLimit: bigint;
  updatedAt: Date | null;
  canUpdate: boolean;
};

/** One BOQ export row (CM-1103): original and current figures. */
export type BoqExportRow = {
  sectionTitle: string;
  item: BoqItemView;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type BoqItemCommand = Omit<BoqItemInput, "rate"> & {
  sectionId: string;
  /** Paise per UoM; ignored without BOQ Financial. */
  rate?: number | null;
  /** The library Item the form was filled from. */
  libraryItemId?: string | null;
};

function usable(
  facts: { active: boolean } | undefined,
  kept: boolean,
): boolean {
  return facts != null && (facts.active || kept);
}

function viewerFlags(access: MemberAccess, projectId: string): Flag[] {
  const supported = fromMask(menuByKey(BOQ_MENU)?.supported ?? 0);
  return supported.filter((flag) => can(access, BOQ_MENU, flag, { projectId }));
}

/**
 * A Project's BOQ (CM-1103, ADR CM-0023 §4; menu `contracts.boq`,
 * CRUDAJPNOFEI, Project-level): sections and items, totals beside the Order
 * Value, the deviation list, the Company's deviation limit and the Excel
 * import. Variations are in `variation-handlers.ts`. UoMs, Wings and
 * Locations come through the `ContractsDirectory`.
 */
export class BoqHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: BoqDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async project(
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsProjectFacts> {
    const project = await this.deps.directory.project(
      this.deps.db,
      workspaceId,
      projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return project;
  }

  async findSection(
    workspaceId: string,
    id: string,
  ): Promise<StoredBoqSection> {
    const section = await this.deps.store.findSection(
      this.deps.db,
      workspaceId,
      id,
    );
    if (section == null) throw boqSectionNotFound();
    return section;
  }

  async findItem(workspaceId: string, id: string): Promise<StoredBoqItem> {
    const item = await this.deps.store.findItem(this.deps.db, workspaceId, id);
    if (item == null) throw boqItemNotFound();
    return item;
  }

  /** The names and flags screens show beside each item. */
  private async itemViews(
    db: ContractsTx,
    project: ContractsProjectFacts,
    workspaceId: string,
    items: readonly StoredBoqItem[],
  ): Promise<BoqItemView[]> {
    const { directory, store } = this.deps;
    const wingIds = items.flatMap((item) =>
      item.wingId == null ? [] : [item.wingId],
    );
    const locationIds = items.flatMap((item) =>
      item.locationId == null ? [] : [item.locationId],
    );
    const libraryIds = items.flatMap((item) =>
      item.itemId == null ? [] : [item.itemId],
    );
    const [uoms, wings, locations, codes, measured, pending] =
      await Promise.all([
        directory.uoms(
          db,
          workspaceId,
          items.map((item) => item.uomId),
        ),
        directory.wingsById(db, workspaceId, project.id, wingIds),
        directory.locationsById(db, workspaceId, project.id, locationIds),
        store.libraryCodes(db, workspaceId, libraryIds),
        store.measured(db, workspaceId, project.id),
        store.pendingVariations(db, workspaceId, project.id),
      ]);
    const pendingByItem = new Map<string, StoredVariation>();
    for (const variation of pending)
      if (variation.boqItemId != null)
        pendingByItem.set(variation.boqItemId, variation);
    return items.map((item) => {
      const found = measured.get(item.id);
      const waiting = pendingByItem.get(item.id);
      return {
        ...item,
        uomName: uoms.get(item.uomId)?.name ?? "",
        placeName:
          item.wingId != null
            ? (wings.get(item.wingId)?.name ?? null)
            : item.locationId != null
              ? (locations.get(item.locationId)?.name ?? null)
              : null,
        libraryCode:
          item.itemId == null ? null : (codes.get(item.itemId) ?? null),
        amount: boqAmount(item.quantity, item.rate),
        measured: found != null,
        measuredQuantity: found ?? null,
        pendingVariation:
          waiting == null
            ? null
            : { id: waiting.id, number: waiting.number, kind: waiting.kind },
      };
    });
  }

  // Reads ---------------------------------------------------------------------

  /** The whole BOQ in section and item order, with its totals (BOQ read). */
  async boq(access: MemberAccess, projectId: string): Promise<BoqView> {
    assertCan(access, BOQ_MENU, "read", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(ws, projectId);
    const [sections, items, settings] = await Promise.all([
      store.sections(db, ws, projectId),
      store.items(db, ws, projectId),
      store.settings(db, ws),
    ]);
    const views = await this.itemViews(db, project, ws, items);
    const totals = boqTotals(views);
    const bySection = new Map<string, BoqItemView[]>();
    for (const view of views)
      bySection.set(view.sectionId, [
        ...(bySection.get(view.sectionId) ?? []),
        view,
      ]);
    return {
      project,
      sections: sections.map((section) => ({
        ...section,
        items: bySection.get(section.id) ?? [],
        subtotal: totals.sections.get(section.id) ?? 0n,
      })),
      total: totals.total,
      orderValue: project.orderValue,
      difference: orderValueDifference(totals.total, project.orderValue),
      deviationLimit: settings.deviationLimit,
      financial: can(access, BOQ_MENU, "financial", { projectId }),
      viewerFlags: viewerFlags(access, projectId),
    };
  }

  /** One item with every Variation naming it (BOQ read). */
  async item(
    access: MemberAccess,
    id: string,
  ): Promise<{ item: BoqItemView; variations: StoredVariation[] }> {
    const { db, store } = this.deps;
    const stored = await this.findItem(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "read", { projectId: stored.projectId });
    const project = await this.project(access.workspaceId, stored.projectId);
    const [[view], variations] = await Promise.all([
      this.itemViews(db, project, access.workspaceId, [stored]),
      store.variationsOfItems(db, access.workspaceId, [stored.id]),
    ]);
    if (view == null) throw boqItemNotFound();
    return { item: view, variations };
  }

  private assertEditor(access: MemberAccess, projectId: string): void {
    if (!can(access, BOQ_MENU, "create", { projectId }))
      assertCan(access, BOQ_MENU, "update", { projectId });
  }

  /** UoMs, the Project's Wings or Locations, and its sections (BOQ create or update). */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<BoqFormOptions> {
    this.assertEditor(access, projectId);
    const { db, directory, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(ws, projectId);
    const [uoms, wings, locations, sections] = await Promise.all([
      directory.uomOptions(db, ws),
      project.structure === "wings"
        ? directory.wings(db, ws, projectId)
        : Promise.resolve([]),
      project.structure === "locations"
        ? directory.locations(db, ws, projectId)
        : Promise.resolve([]),
      store.sections(db, ws, projectId),
    ]);
    return {
      structure: project.structure,
      uoms,
      wings,
      locations,
      sections: sections.map(({ id, title }) => ({ id, title })),
    };
  }

  /**
   * Library Items for the item form's picker, by code or description. The
   * adopted rate is the item's suggested rate; the route nulls it without
   * BOQ Financial. Needs BOQ create or update, not Item Library read.
   */
  async libraryOptions(
    access: MemberAccess,
    projectId: string,
    search: string | undefined,
  ): Promise<BoqLibraryOption[]> {
    this.assertEditor(access, projectId);
    const { db, directory, store } = this.deps;
    await this.project(access.workspaceId, projectId);
    const rows = await store.libraryOptions(db, access.workspaceId, {
      search,
      limit: BOQ_LIBRARY_OPTIONS_MAX,
    });
    const uoms = await directory.uoms(
      db,
      access.workspaceId,
      rows.map((row) => row.uomId),
    );
    return rows.map((row) => ({
      ...row,
      uomName: uoms.get(row.uomId)?.name ?? "",
    }));
  }

  /**
   * Items whose checked measured quantity is beyond the deviation limit
   * over their current quantity, in BOQ order (BOQ read).
   */
  async deviations(
    access: MemberAccess,
    projectId: string,
  ): Promise<{ limit: bigint; financial: boolean; items: BoqDeviation[] }> {
    const view = await this.boq(access, projectId);
    const items: BoqDeviation[] = [];
    for (const section of view.sections)
      for (const item of section.items)
        if (
          item.measuredQuantity != null &&
          isDeviation(item.measuredQuantity, item.quantity, view.deviationLimit)
        )
          items.push({
            item,
            sectionTitle: section.title,
            measuredQuantity: item.measuredQuantity,
            percentOver: percentOver(item.measuredQuantity, item.quantity),
          });
    return { limit: view.deviationLimit, financial: view.financial, items };
  }

  // Sections ------------------------------------------------------------------

  async createSection(
    access: MemberAccess,
    projectId: string,
    rawTitle: string,
  ): Promise<StoredBoqSection> {
    assertCan(access, BOQ_MENU, "create", { projectId });
    const title = sectionTitle(rawTitle);
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    await this.project(ws, projectId);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await store.lock(tx, ws, projectId);
      if (await store.sectionTitleTaken(tx, projectId, title, null))
        throw boqSectionTitleTaken(title);
      const existing = await store.sections(tx, ws, projectId);
      const section: StoredBoqSection = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        title,
        position: Math.max(-1, ...existing.map((row) => row.position)) + 1,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertSections(tx, [section]);
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "boq_section.created",
        entityType: "boq_section",
        entityId: section.id,
        after: { projectId, title, position: section.position },
        occurredAt: at,
      });
      return section;
    });
  }

  async renameSection(
    access: MemberAccess,
    id: string,
    rawTitle: string,
    expectedUpdatedAt: Date,
  ): Promise<StoredBoqSection> {
    const section = await this.findSection(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "update", { projectId: section.projectId });
    const title = sectionTitle(rawTitle);
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, access.workspaceId, section.projectId);
      if (await store.sectionTitleTaken(tx, section.projectId, title, id))
        throw boqSectionTitleTaken(title);
      const saved = await store.renameSection(tx, {
        section,
        title,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!saved) throw boqSectionChanged();
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "boq_section.renamed",
        entityType: "boq_section",
        entityId: id,
        before: { title: section.title },
        after: { title },
        occurredAt: at,
      });
    });
    return { ...section, title, updatedAt: at, updatedBy: access.userId };
  }

  /** One place up or down; nothing changes at either end (BOQ update). */
  async moveSection(
    access: MemberAccess,
    id: string,
    direction: "up" | "down",
  ): Promise<void> {
    const section = await this.findSection(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "update", { projectId: section.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, access.workspaceId, section.projectId);
      const order = (
        await store.sections(tx, access.workspaceId, section.projectId)
      ).map((row) => row.id);
      if (!order.includes(id)) throw boqSectionNotFound();
      const next = movedOrder(order, id, direction);
      if (next == null) return;
      await store.setSectionOrder(tx, next, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "boq_section.moved",
        entityType: "boq_section",
        entityId: id,
        before: { order },
        after: { order: next, direction },
        occurredAt: at,
      });
    });
  }

  /**
   * Deletes an empty section: 409 `BOQ_SECTION_NOT_EMPTY` while it has live
   * items, 409 `VARIATION_PENDING` while a pending extra item would join it.
   */
  async deleteSection(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const section = await this.findSection(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "delete", { projectId: section.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, access.workspaceId, section.projectId);
      const count = await store.liveItemCount(tx, id);
      if (count > 0) throw boqSectionNotEmpty(count);
      const waiting = (
        await store.pendingVariations(tx, access.workspaceId, section.projectId)
      ).find(
        (variation) =>
          variation.kind === "extra_item" && variation.sectionId === id,
      );
      if (waiting != null) throw variationPending(waiting.number);
      const deleted = await store.deleteSection(tx, {
        section,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw boqSectionChanged();
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "boq_section.deleted",
        entityType: "boq_section",
        entityId: id,
        before: { title: section.title, position: section.position },
        occurredAt: at,
      });
    });
  }

  // Items ---------------------------------------------------------------------

  /**
   * Checks the UoM and the Wing or Location against the Project's
   * structure. One the item already has may stay after it is disabled or
   * removed.
   */
  private async checkReferences(
    tx: ContractsTx,
    project: ContractsProjectFacts,
    workspaceId: string,
    fields: BoqItemFields,
    before: StoredBoqItem | null,
  ): Promise<void> {
    const { directory } = this.deps;
    const uoms = await directory.uoms(tx, workspaceId, [fields.uomId]);
    if (!usable(uoms.get(fields.uomId), before?.uomId === fields.uomId))
      throw boqItemUomInvalid();
    if (fields.wingId != null) {
      if (project.structure !== "wings") throw boqItemWingInvalid();
      const wings = await directory.wingsById(tx, workspaceId, project.id, [
        fields.wingId,
      ]);
      if (!usable(wings.get(fields.wingId), before?.wingId === fields.wingId))
        throw boqItemWingInvalid();
    }
    if (fields.locationId != null) {
      if (project.structure !== "locations") throw boqItemLocationInvalid();
      const locations = await directory.locationsById(
        tx,
        workspaceId,
        project.id,
        [fields.locationId],
      );
      if (
        !usable(
          locations.get(fields.locationId),
          before?.locationId === fields.locationId,
        )
      )
        throw boqItemLocationInvalid();
    }
  }

  private async liveSection(
    tx: ContractsTx,
    workspaceId: string,
    projectId: string,
    sectionId: string,
  ): Promise<StoredBoqSection> {
    const section = await this.deps.store.findSection(
      tx,
      workspaceId,
      sectionId,
    );
    if (section?.projectId !== projectId) throw boqSectionNotFound();
    return section;
  }

  /**
   * Adds an item, typed or filled from the Item Library (BOQ create). Its
   * original quantity and rate are the ones given. Copying locks the
   * library Item `FOR SHARE`, so it cannot be deleted in between. Without
   * BOQ Financial the rate is not taken: a copied item gets the library's
   * adopted rate, a typed one ₹0.
   */
  async createItem(
    access: MemberAccess,
    projectId: string,
    input: BoqItemCommand,
  ): Promise<BoqItemView> {
    assertCan(access, BOQ_MENU, "create", { projectId });
    const financial = can(access, BOQ_MENU, "financial", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(ws, projectId);
    const libraryItemId = input.libraryItemId?.trim() ?? null;
    const at = this.clock();
    const item = await db.$transaction(async (tx) => {
      await store.lock(tx, ws, projectId);
      let library: LibraryItemFacts | null = null;
      if (libraryItemId != null) {
        library =
          (await store.lockLibraryItems(tx, ws, [libraryItemId])).get(
            libraryItemId,
          ) ?? null;
        if (library == null) throw boqLibraryItemNotFound();
      }
      const rate = financial
        ? (input.rate ?? -1)
        : (library?.adoptedRate ?? 0n);
      const fields = boqItemFields({ ...input, rate });
      await this.liveSection(tx, ws, projectId, input.sectionId);
      await this.checkReferences(tx, project, ws, fields, null);
      if (
        (await store.takenItemNos(tx, projectId, [fields.itemNo], null))
          .length > 0
      )
        throw boqItemNoTaken(fields.itemNo);
      const siblings = (await store.items(tx, ws, projectId)).filter(
        (row) => row.sectionId === input.sectionId,
      );
      const stored: StoredBoqItem = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        sectionId: input.sectionId,
        itemId: library?.id ?? null,
        itemNo: fields.itemNo,
        description: fields.description,
        uomId: fields.uomId,
        sacHsn: fields.sacHsn,
        originalQuantity: fields.quantity,
        quantity: fields.quantity,
        originalRate: fields.rate,
        rate: fields.rate,
        wingId: fields.wingId,
        locationId: fields.locationId,
        position: Math.max(-1, ...siblings.map((row) => row.position)) + 1,
        variationId: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertItems(tx, [stored]);
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "boq_item.created",
        entityType: "boq_item",
        entityId: stored.id,
        after: boqItemSnapshot(stored),
        occurredAt: at,
      });
      return stored;
    });
    const [view] = await this.itemViews(db, project, ws, [item]);
    if (view == null) throw boqItemNotFound();
    return view;
  }

  /**
   * Saves the item form when it is still as loaded (409 `BOQ_ITEM_CHANGED`).
   * Changing the section moves it to the end of that section. Once a
   * checked measurement names it, a new quantity or rate is refused (409
   * `BOQ_ITEM_MEASURED`); the rest stays editable. Before that, the
   * original figure moves with the edit while it still equals the current
   * one (no Variation has changed it). Without Financial the rate is kept.
   */
  async updateItem(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: BoqItemCommand,
  ): Promise<BoqItemView> {
    const before = await this.findItem(access.workspaceId, id);
    const projectId = before.projectId;
    assertCan(access, BOQ_MENU, "update", { projectId });
    const financial = can(access, BOQ_MENU, "financial", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(ws, projectId);
    const at = this.clock();
    const after = await db.$transaction(async (tx) => {
      await store.lock(tx, ws, projectId);
      const current = await store.findItem(tx, ws, id);
      if (current == null) throw boqItemNotFound();
      if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw boqItemChanged();
      const fields = boqItemFields({
        ...input,
        rate: financial ? (input.rate ?? -1) : current.rate,
      });
      const measured = (await store.measured(tx, ws, projectId)).has(id);
      const changesFigures =
        fields.quantity !== current.quantity || fields.rate !== current.rate;
      if (measured && changesFigures) throw boqItemMeasured();
      const section = await this.liveSection(
        tx,
        ws,
        projectId,
        input.sectionId,
      );
      await this.checkReferences(tx, project, ws, fields, current);
      if (
        (await store.takenItemNos(tx, projectId, [fields.itemNo], id)).length >
        0
      )
        throw boqItemNoTaken(fields.itemNo);
      let position = current.position;
      if (section.id !== current.sectionId) {
        const siblings = (await store.items(tx, ws, projectId)).filter(
          (row) => row.sectionId === section.id,
        );
        position = Math.max(-1, ...siblings.map((row) => row.position)) + 1;
      }
      const next: StoredBoqItem = {
        ...current,
        sectionId: section.id,
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
        wingId: fields.wingId,
        locationId: fields.locationId,
        position,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.updateItem(tx, next, expectedUpdatedAt)))
        throw boqItemChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "boq_item.updated",
        entityType: "boq_item",
        entityId: id,
        before: boqItemSnapshot(current),
        after: boqItemSnapshot(next),
        occurredAt: at,
      });
      return next;
    });
    const [view] = await this.itemViews(db, project, ws, [after]);
    if (view == null) throw boqItemNotFound();
    return view;
  }

  /** One place up or down inside its section (BOQ update). */
  async moveItem(
    access: MemberAccess,
    id: string,
    direction: "up" | "down",
  ): Promise<void> {
    const item = await this.findItem(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "update", { projectId: item.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, access.workspaceId, item.projectId);
      const current = await store.findItem(tx, access.workspaceId, id);
      if (current == null) throw boqItemNotFound();
      const order = (await store.items(tx, access.workspaceId, item.projectId))
        .filter((row) => row.sectionId === current.sectionId)
        .map((row) => row.id);
      const next = movedOrder(order, id, direction);
      if (next == null) return;
      await store.setItemOrder(tx, next, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "boq_item.moved",
        entityType: "boq_item",
        entityId: id,
        before: { order },
        after: { order: next, direction },
        occurredAt: at,
      });
    });
  }

  /**
   * A tombstone. 409 `BOQ_ITEM_MEASURED` once a checked measurement names
   * it, 409 `VARIATION_PENDING` while a Variation of it waits.
   */
  async deleteItem(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const item = await this.findItem(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "delete", { projectId: item.projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, ws, item.projectId);
      if ((await store.measured(tx, ws, item.projectId)).has(id))
        throw boqItemMeasured();
      const waiting = (
        await store.pendingVariations(tx, ws, item.projectId)
      ).find((variation) => variation.boqItemId === id);
      if (waiting != null) throw variationPending(waiting.number);
      const deleted = await store.deleteItem(tx, {
        item,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) {
        if ((await store.findItem(tx, ws, id)) == null) throw boqItemNotFound();
        throw boqItemChanged();
      }
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "boq_item.deleted",
        entityType: "boq_item",
        entityId: id,
        before: boqItemSnapshot(item),
        occurredAt: at,
      });
    });
  }

  // Settings ------------------------------------------------------------------

  /**
   * The Company's deviation limit. Company-level: BOQ read held on any
   * Project reads it; BOQ update held anywhere changes it.
   */
  async settings(access: MemberAccess): Promise<BoqSettings> {
    assertCan(access, BOQ_MENU, "read");
    const found = await this.deps.store.settings(
      this.deps.db,
      access.workspaceId,
    );
    return {
      deviationLimit: found.deviationLimit,
      updatedAt: found.updatedAt,
      canUpdate: can(access, BOQ_MENU, "update"),
    };
  }

  async updateSettings(
    access: MemberAccess,
    input: { deviationLimitPercent: string | number },
  ): Promise<BoqSettings> {
    assertCan(access, BOQ_MENU, "update");
    const limit = deviationLimit(input.deviationLimitPercent);
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const before = await store.settings(tx, access.workspaceId);
      await store.saveDeviationLimit(tx, {
        workspaceId: access.workspaceId,
        limit,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "contracts_settings.updated",
        entityType: "contracts_settings",
        entityId: access.workspaceId,
        before: {
          deviationLimitPercent: fixedDecimal(
            before.deviationLimit,
            PERCENT_SCALE,
          ),
        },
        after: { deviationLimitPercent: fixedDecimal(limit, PERCENT_SCALE) },
        occurredAt: at,
      });
    });
    return { deviationLimit: limit, updatedAt: at, canUpdate: true };
  }

  // Excel ---------------------------------------------------------------------

  /** The sample and the import carry rates: Import and Financial. */
  assertCanImport(access: MemberAccess, projectId: string): void {
    assertCan(access, BOQ_MENU, "import", { projectId });
    assertCan(access, BOQ_MENU, "financial", { projectId });
  }

  /** The whole BOQ in order, for the export (Export and Financial). */
  async export(
    access: MemberAccess,
    projectId: string,
  ): Promise<{ project: ContractsProjectFacts; rows: BoqExportRow[] }> {
    assertCan(access, BOQ_MENU, "export", { projectId });
    assertCan(access, BOQ_MENU, "financial", { projectId });
    const view = await this.boq(access, projectId);
    return {
      project: view.project,
      rows: view.sections.flatMap((section) =>
        section.items.map((item) => ({ sectionTitle: section.title, item })),
      ),
    };
  }

  /** The Excel import (Import and Financial): every row or none. */
  async importSheet(
    access: MemberAccess,
    projectId: string,
    rows: readonly BoqSheetRow[],
  ): Promise<BoqImportResult> {
    this.assertCanImport(access, projectId);
    const project = await this.project(access.workspaceId, projectId);
    return importBoq(this.deps, access, project, rows, this.clock());
  }
}
