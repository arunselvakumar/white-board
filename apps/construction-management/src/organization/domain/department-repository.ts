import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { Department } from "./department";

export type DepartmentRepository = {
  /**
   * Writes the department and its audit event atomically. 409
   * `DEPARTMENT_NAME_TAKEN` when a live one has the name (any case). With
   * `expectedUpdatedAt`, 409 `STALE_DEPARTMENT` unless the stored row still
   * has that `updatedAt`.
   */
  save(
    department: Department,
    options?: { audit?: AuditEvent; expectedUpdatedAt?: Date },
  ): Promise<void>;
  findById(workspaceId: string, id: string): Promise<Department | null>;
  /** Live departments, by name. */
  listAll(workspaceId: string): Promise<Department[]>;
};
