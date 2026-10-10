import type { LookupEntry } from "../domain/lookup-entry";
import type {
  DevelopmentKind,
  LookupKind,
  MasterKind,
} from "../domain/master-kind";
import type { Supervisor } from "../domain/supervisor";

/** How a write is recorded in the audit log, in the same transaction. */
export type MasterChange = {
  /** Past tense: `labour_category.updated`. */
  action: string;
  /** The snapshot before the change; null for a new row. */
  before: unknown;
  by: string;
  now: Date;
};

export type LookupStore = {
  /** Live rows (enabled and disabled), by name. */
  list(kind: LookupKind, workspaceId: string): Promise<LookupEntry[]>;
  find(
    kind: LookupKind,
    workspaceId: string,
    id: string,
  ): Promise<LookupEntry | null>;
  /** Inserts and audits; 409 `<ENTITY>_NAME_IN_USE` for a live name. */
  insert(entry: LookupEntry, change: MasterChange): Promise<void>;
  /**
   * Writes the entry when its stored `updatedAt` is still `expectedUpdatedAt`
   * and audits; 409 `<ENTITY>_CHANGED` otherwise, `<ENTITY>_NAME_IN_USE` for
   * a live name.
   */
  update(
    entry: LookupEntry,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
};

export type SupervisorStore = {
  list(workspaceId: string): Promise<Supervisor[]>;
  find(workspaceId: string, id: string): Promise<Supervisor | null>;
  insert(supervisor: Supervisor, change: MasterChange): Promise<void>;
  update(
    supervisor: Supervisor,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
};

/**
 * Whether another context still points at a masters row (labourers, vendor
 * rate cards, attendance). Implemented with plain reads of those tables.
 */
export type MasterUsage = (
  kind: MasterKind,
  workspaceId: string,
  id: string,
) => Promise<boolean>;

/** Live Team Members of a Company, read from the organization context by id. */
export type TeamMemberDirectory = {
  /** Names of the ids that are live Team Members of the Company. */
  namesOf(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
};

/** An Amenity or Common Development with the live Projects it is assigned to. */
export type DevelopmentRow = {
  entry: LookupEntry<DevelopmentKind>;
  /** Live Projects only; links to deleted Projects are left out. */
  projectIds: string[];
};

/**
 * Amenities and Common Developments in `construction_masters` (CM-404):
 * the rows, and the Projects each is assigned to (`development_projects`).
 */
export type DevelopmentStore = {
  /** Live rows of a kind (enabled and disabled), by name. */
  list(kind: DevelopmentKind, workspaceId: string): Promise<DevelopmentRow[]>;
  find(
    kind: DevelopmentKind,
    workspaceId: string,
    id: string,
  ): Promise<DevelopmentRow | null>;
  /** Inserts with its Projects and audits; 409 `<KIND>_NAME_IN_USE`. */
  insert(
    entry: LookupEntry<DevelopmentKind>,
    projectIds: readonly string[],
    change: MasterChange,
  ): Promise<void>;
  /** As `LookupStore.update`. */
  update(
    entry: LookupEntry<DevelopmentKind>,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /** Replaces the row's Projects and audits. */
  setProjects(
    entry: LookupEntry<DevelopmentKind>,
    projectIds: readonly string[],
    change: MasterChange,
  ): Promise<void>;
  /** Live rows of any kind assigned to the Project, by name. */
  listForProject(
    workspaceId: string,
    projectId: string,
  ): Promise<LookupEntry<DevelopmentKind>[]>;
  /**
   * Replaces the rows of one kind assigned to the Project and audits it on
   * the Project (`project.<kind>_assigned`).
   */
  setForProject(input: {
    workspaceId: string;
    projectId: string;
    kind: DevelopmentKind;
    ids: readonly string[];
    before: readonly string[];
    by: string;
    now: Date;
  }): Promise<void>;
};

/**
 * The Company's live Projects, by id. The projects context is referenced
 * by id only; infrastructure reads its table without importing it.
 */
export type ProjectDirectory = {
  /** The ids in `ids` that are not live Projects of the Company. */
  unknownIds(workspaceId: string, ids: readonly string[]): Promise<string[]>;
};
