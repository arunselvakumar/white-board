import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { Project } from "./project";

export type ProjectRepository = {
  /** A live Project of the Company, or null. */
  findById(workspaceId: string, id: string): Promise<Project | null>;
  /** Live Projects of the Company; only `ids` when given (a Member's). */
  list(
    workspaceId: string,
    ids: ReadonlySet<string> | null,
  ): Promise<Project[]>;
  /** Inserts with its audit row; 409 `PROJECT_NAME_IN_USE`. */
  insert(project: Project, audit: AuditEvent): Promise<void>;
  /**
   * Writes the edit with its audit row; 409 `PROJECT_CHANGED` when the
   * stored `updatedAt` is not `expectedUpdatedAt`, 409
   * `PROJECT_NAME_IN_USE` for a live duplicate name.
   */
  update(
    project: Project,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void>;
  /** Tombstones the (already deleted) Project with its audit row. */
  delete(project: Project, audit: AuditEvent): Promise<void>;
};

/**
 * Whether site records still point at a Project: labours working there,
 * vendors assigned to it, attendance or wage payments on it (M2). A
 * Project in use cannot be deleted.
 */
export type ProjectUsage = {
  isInUse(workspaceId: string, projectId: string): Promise<boolean>;
};
