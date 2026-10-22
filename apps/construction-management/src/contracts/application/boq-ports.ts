import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import type { VariationKind, VariationStatus } from "../domain/variation";
import type { ContractsDirectory, ContractsTx } from "./ports";

/**
 * What the BOQ and its Variations keep (CM-1103), and the store that keeps
 * them (Prisma in `infrastructure/prisma-boq-store.ts`). Commands run in
 * one transaction that first takes the Project's BOQ lock (`lock`), so
 * positions, item numbers, the measured check and "one pending change per
 * item" are decided one writer at a time.
 */

export const BOQ_MENU = "contracts.boq";

export type StoredBoqSection = {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredBoqItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  sectionId: string;
  /** The Item Library Item it was copied from, or null when typed. */
  itemId: string | null;
  itemNo: string;
  description: string;
  uomId: string;
  sacHsn: string | null;
  /** Ten-thousandths of the UoM: what the contract said. */
  originalQuantity: bigint;
  /** Ten-thousandths of the UoM: after approved Variations. */
  quantity: bigint;
  /** Paise per UoM. */
  originalRate: bigint;
  rate: bigint;
  wingId: string | null;
  locationId: string | null;
  position: number;
  /** The Variation that added it (an extra item). */
  variationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredVariation = {
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  kind: VariationKind;
  status: VariationStatus;
  /** The item changed; an extra item's once approved. */
  boqItemId: string | null;
  sectionId: string | null;
  itemNo: string | null;
  description: string | null;
  uomId: string | null;
  sacHsn: string | null;
  previousQuantity: bigint | null;
  newQuantity: bigint | null;
  previousRate: bigint | null;
  newRate: bigint | null;
  reason: string;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** An Item of the library as the BOQ copies it. */
export type LibraryItemFacts = {
  id: string;
  code: string;
  shortDescription: string;
  description: string | null;
  uomId: string;
  sacHsn: string | null;
  /** Paise per UoM. */
  adoptedRate: bigint;
};

/** A variations list position: newest first (root ADR-0020). */
export type VariationCursor = { createdAt: Date; id: string };

export type VariationFilter = {
  workspaceId: string;
  projectId: string;
  status?: VariationStatus;
  boqItemId?: string;
};

export type BoqStore = {
  /** Takes the Project's BOQ lock until the transaction ends. */
  lock(tx: ContractsTx, workspaceId: string, projectId: string): Promise<void>;

  // Sections ---------------------------------------------------------------
  sections(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredBoqSection[]>;
  findSection(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBoqSection | null>;
  /** A live section of the Project with this title ignoring case, other than `exceptId`. */
  sectionTitleTaken(
    tx: ContractsTx,
    projectId: string,
    title: string,
    exceptId: string | null,
  ): Promise<boolean>;
  insertSections(tx: ContractsTx, sections: StoredBoqSection[]): Promise<void>;
  /** False when `updatedAt` is no longer `expectedUpdatedAt`. */
  renameSection(
    tx: ContractsTx,
    input: {
      section: StoredBoqSection;
      title: string;
      expectedUpdatedAt: Date;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  setSectionOrder(
    tx: ContractsTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ): Promise<void>;
  deleteSection(
    tx: ContractsTx,
    input: {
      section: StoredBoqSection;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  liveItemCount(tx: ContractsTx, sectionId: string): Promise<number>;
  /** Sections by id, removed ones included (for names). */
  sectionsById(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, StoredBoqSection>>;

  // Items ------------------------------------------------------------------
  items(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredBoqItem[]>;
  findItem(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBoqItem | null>;
  /** Items by id, removed ones included (for names). */
  itemsById(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, StoredBoqItem>>;
  /** Of `itemNos`, those a live item of the Project has (ignoring case), other than `exceptId`'s. */
  takenItemNos(
    tx: ContractsTx,
    projectId: string,
    itemNos: readonly string[],
    exceptId: string | null,
  ): Promise<string[]>;
  insertItems(tx: ContractsTx, items: StoredBoqItem[]): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt` (when given). */
  updateItem(
    tx: ContractsTx,
    after: StoredBoqItem,
    expectedUpdatedAt: Date | null,
  ): Promise<boolean>;
  setItemOrder(
    tx: ContractsTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ): Promise<void>;
  deleteItem(
    tx: ContractsTx,
    input: {
      item: StoredBoqItem;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  /**
   * Numbers of the live, non-cancelled Work Orders with a live line naming
   * the item (CM-1104), "Draft" for one never submitted; in number order.
   */
  workOrdersNaming(
    db: ContractsTx,
    workspaceId: string,
    boqItemId: string,
  ): Promise<string[]>;
  /**
   * Checked measured quantity by BOQ item (ten-thousandths): the sum of the
   * rows naming it on live sheets with status `checked`. An item in the map
   * is **measured**.
   */
  measured(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<Map<string, bigint>>;

  // The Item Library ---------------------------------------------------------
  /**
   * Live library Items by id, each row locked `FOR SHARE` until the
   * transaction ends, so an Item delete (which locks it `FOR UPDATE`, then
   * counts BOQ items) waits for the copy and then sees it.
   */
  lockLibraryItems(
    tx: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, LibraryItemFacts>>;
  /** Live library Items by code ignoring case, locked like `lockLibraryItems`. */
  lockLibraryItemsByCode(
    tx: ContractsTx,
    workspaceId: string,
    codes: readonly string[],
  ): Promise<LibraryItemFacts[]>;
  libraryOptions(
    db: ContractsTx,
    workspaceId: string,
    query: { search?: string; limit: number },
  ): Promise<LibraryItemFacts[]>;
  /** Codes of library Items by id, removed ones included. */
  libraryCodes(
    db: ContractsTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;

  // Settings ---------------------------------------------------------------
  settings(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<{
    deviationLimit: bigint;
    updatedAt: Date | null;
    updatedBy: string | null;
  }>;
  saveDeviationLimit(
    tx: ContractsTx,
    input: { workspaceId: string; limit: bigint; by: string; at: Date },
  ): Promise<void>;

  // Variations -------------------------------------------------------------
  variations(
    db: ContractsTx,
    params: VariationFilter & {
      limit: number;
      after?: VariationCursor;
      before?: VariationCursor;
    },
  ): Promise<{ items: StoredVariation[]; total: number; hasMore: boolean }>;
  /** Every live Variation naming one of these items, newest first. */
  variationsOfItems(
    db: ContractsTx,
    workspaceId: string,
    boqItemIds: readonly string[],
  ): Promise<StoredVariation[]>;
  /** Live pending Variations of the Project. */
  pendingVariations(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredVariation[]>;
  findVariation(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredVariation | null>;
  insertVariation(tx: ContractsTx, variation: StoredVariation): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt` (when given). */
  updateVariation(
    tx: ContractsTx,
    after: StoredVariation,
    expectedUpdatedAt: Date | null,
  ): Promise<boolean>;
  deleteVariation(
    tx: ContractsTx,
    input: {
      variation: StoredVariation;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;

  /** "Who did this" names by User id. */
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

export type BoqDb = ContractsTx & {
  $transaction<T>(
    fn: (tx: ContractsTx) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
};

export type BoqDeps = {
  db: BoqDb;
  store: BoqStore;
  directory: ContractsDirectory;
  /** The Company's today, for a Variation's number. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `document.submitted|approved|rejected` for Variations, after commit. */
  events: EventDispatcher;
  clock?: () => Date;
};
