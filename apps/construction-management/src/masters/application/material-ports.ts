import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { LookupEntry } from "../domain/lookup-entry";
import type { Material, MaterialItemType } from "../domain/material";
import type { MaterialCategory } from "../domain/material-category";
import type { TermsCondition } from "../domain/terms-condition";
import type { MasterChange } from "./ports";

/** Which rows a list returns: every live row (default), or one state. */
export type MasterStatusFilter = "all" | "enabled" | "disabled";

/** A page of a procurement master list: newest first (root ADR-0020). */
export type MasterListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
  search?: string;
  status: MasterStatusFilter;
};

export type MasterPage<T> = { items: T[]; total: number; hasMore: boolean };

export type MeasurementUnit = LookupEntry<"measurement_unit">;

/** Measurement Units in `construction_masters` (CM-501). */
export type MeasurementUnitStore = {
  list(params: MasterListParams): Promise<MasterPage<MeasurementUnit>>;
  find(workspaceId: string, id: string): Promise<MeasurementUnit | null>;
  /** Inserts and audits; 409 `MEASUREMENT_UNIT_NAME_IN_USE`. */
  insert(unit: MeasurementUnit, change: MasterChange): Promise<void>;
  /** Compare-and-set on `updatedAt` and audits; 409 `_CHANGED` / `_NAME_IN_USE`. */
  update(
    unit: MeasurementUnit,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /** Whether a live Material is counted in it. */
  inUse(workspaceId: string, id: string): Promise<boolean>;
};

/** A category with what its screens show. */
export type MaterialCategoryRow = {
  category: MaterialCategory;
  parentName: string | null;
  /** Live sub-categories. */
  childCount: number;
};

export type MaterialCategoryListParams = MasterListParams & {
  /** Only top-level categories (the parent picker). */
  topLevel?: boolean;
  /** Only sub-categories of this one. */
  parentId?: string;
};

/** Material Categories in `construction_masters` (CM-501). */
export type MaterialCategoryStore = {
  list(
    params: MaterialCategoryListParams,
  ): Promise<MasterPage<MaterialCategoryRow>>;
  find(workspaceId: string, id: string): Promise<MaterialCategoryRow | null>;
  /**
   * Inserts and audits. Re-checks the parent inside the transaction (still
   * live and top-level), so two edits at once cannot nest three levels.
   */
  insert(category: MaterialCategory, change: MasterChange): Promise<void>;
  /** As `insert`, compare-and-set on `updatedAt`; also re-checks it has no children when it gets a parent. */
  update(
    category: MaterialCategory,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /** Whether a live Material or a live sub-category uses it. */
  inUse(workspaceId: string, id: string): Promise<boolean>;
};

/** A Material with the names its screens show. */
export type MaterialRow = {
  material: Material;
  uomName: string;
  categoryName: string | null;
};

export type MaterialListParams = MasterListParams & {
  categoryId?: string;
  itemType?: MaterialItemType;
  /**
   * Whether the search may match HSN codes: only for readers with
   * Materials Financial, who see the codes (a match would otherwise leak them).
   */
  searchHsn?: boolean;
};

/** A unit or category a Material form picks, as the check needs it. */
export type PickedMaster = { id: string; name: string; disabled: boolean };

/** Materials in `construction_masters` (CM-501). */
export type MaterialStore = {
  list(params: MaterialListParams): Promise<MasterPage<MaterialRow>>;
  find(workspaceId: string, id: string): Promise<MaterialRow | null>;
  /**
   * The picker's read: live Materials by name. Without `ids`, enabled
   * ones matching `search` (name or specification) and `categoryId`; with
   * `ids`, those live Materials whether enabled or not (a form reopening
   * its lines).
   */
  options(input: {
    workspaceId: string;
    search?: string;
    categoryId?: string;
    ids?: readonly string[];
    limit: number;
  }): Promise<MaterialRow[]>;
  insert(material: Material, change: MasterChange): Promise<void>;
  update(
    material: Material,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /** A live unit of the Company, or null. */
  unit(workspaceId: string, id: string): Promise<PickedMaster | null>;
  /** A live category of the Company, or null. */
  category(workspaceId: string, id: string): Promise<PickedMaster | null>;
};

/** Terms & Conditions in `construction_masters` (CM-501). */
export type TermsConditionStore = {
  list(params: MasterListParams): Promise<MasterPage<TermsCondition>>;
  find(workspaceId: string, id: string): Promise<TermsCondition | null>;
  /** 409 `TERMS_CONDITION_NAME_IN_USE` for a live title. */
  insert(terms: TermsCondition, change: MasterChange): Promise<void>;
  update(
    terms: TermsCondition,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
};

/**
 * Whether procurement documents or stock entries point at a Material
 * (CM-501). The procurement context is not imported: `src/composition`
 * implements this with reads of its tables.
 */
export type MaterialUsage = (
  workspaceId: string,
  materialId: string,
) => Promise<boolean>;
