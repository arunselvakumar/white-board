import type { WorkType } from "../domain/work-type";
import type { MasterChange } from "./ports";

/** A Department or Material a Work Type form picks, as the checks need it. */
export type WorkTypePick = { id: string; name: string; disabled: boolean };

/** An assigned Material with what the screens show. */
export type WorkTypeMaterial = {
  id: string;
  name: string;
  unitName: string;
  disabled: boolean;
};

/** A Work Type with the names its screens show. */
export type WorkTypeRow = {
  workType: WorkType;
  departmentName: string;
  departmentDisabled: boolean;
  /** Live assigned Materials, by name. */
  materials: WorkTypeMaterial[];
};

/** Work Types in `construction_masters` (CM-601). */
export type WorkTypeStore = {
  /** Live rows (enabled and disabled), by name. */
  list(workspaceId: string): Promise<WorkTypeRow[]>;
  find(workspaceId: string, id: string): Promise<WorkTypeRow | null>;
  /** Inserts with its Materials and audits; 409 `WORK_TYPE_NAME_IN_USE`. */
  insert(workType: WorkType, change: MasterChange): Promise<void>;
  /**
   * Compare-and-set on `updatedAt`, replaces its Materials and audits;
   * 409 `WORK_TYPE_CHANGED` / `WORK_TYPE_NAME_IN_USE`.
   */
  update(
    workType: WorkType,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /** A live Department of the Company, or null. */
  department(workspaceId: string, id: string): Promise<WorkTypePick | null>;
  /** The live Materials of the Company among `ids`. */
  materials(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<WorkTypePick[]>;
};

/**
 * Whether live site-work rows (Daily Worksheets) name a Work Type. The
 * site-work context is not imported: `src/composition` implements it.
 */
export type WorkTypeUsage = (
  workspaceId: string,
  workTypeId: string,
) => Promise<boolean>;
