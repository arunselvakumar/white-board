import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type { Project } from "./project";

/**
 * A logo change written with the Project (CM-401): the new file's
 * `stored_files` row, and the replaced or removed file to mark deleted.
 */
export type ProjectFileChange = {
  added?: NewStoredFile;
  removedKey?: string | null;
};

export type ProjectRepository = {
  /** A live Project of the Company, or null. */
  findById(workspaceId: string, id: string): Promise<Project | null>;
  /** Live Projects of the Company; only `ids` when given (a Member's). */
  list(
    workspaceId: string,
    ids: ReadonlySet<string> | null,
  ): Promise<Project[]>;
  /**
   * Inserts with its audit row and the seed drawing albums and testing
   * items every Project starts with (`project-seeds.ts`), in one
   * transaction; 409 `PROJECT_NAME_IN_USE`.
   */
  insert(project: Project, audit: AuditEvent): Promise<void>;
  /**
   * Writes the edit with its audit row (and a logo's `stored_files`
   * change); 409 `PROJECT_CHANGED` when the stored `updatedAt` is not
   * `expectedUpdatedAt`, 409 `PROJECT_NAME_IN_USE` for a live duplicate
   * name.
   */
  update(
    project: Project,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
    files?: ProjectFileChange,
  ): Promise<void>;
  /** Tombstones the (already deleted) Project with its audit row. */
  delete(project: Project, audit: AuditEvent): Promise<void>;
};

/**
 * Custom-field labels in use on the Company's live Projects (CM-413), for
 * the label picker: grouped ignoring case under the most-used spelling,
 * most used first, then by name.
 */
export type ProjectCustomFieldLabels = {
  list(workspaceId: string, limit: number): Promise<string[]>;
};

/**
 * Whether records still point at a Project: labours working there, vendors
 * assigned to it, attendance or wage payments on it (M2), its documents
 * (CM-414), Wings, Locations, drawings and testing reports (M4). The seed
 * albums and testing items alone do not count. A Project in use cannot be
 * deleted.
 */
export type ProjectUsage = {
  isInUse(workspaceId: string, projectId: string): Promise<boolean>;
};
