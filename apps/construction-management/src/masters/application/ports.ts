import type { LookupEntry } from "../domain/lookup-entry";
import type { LookupKind, MasterKind } from "../domain/master-kind";
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
