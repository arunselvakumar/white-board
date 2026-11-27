import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { Role } from "./role";

export type RoleRepository = {
  /**
   * Writes the Role, its matrix and the audit event atomically. With
   * `expectedUpdatedAt`, 409 `STALE_ROLE` unless the stored Role still has
   * that `updatedAt` (someone else saved it meanwhile). A Role under a
   * Department is saved only while that Department is live in the same
   * Company (400 `ROLE_DEPARTMENT_NOT_FOUND`), checked under a lock so a
   * Department delete cannot slip in between (ADR CM-0050).
   */
  save(
    role: Role,
    options?: { audit?: AuditEvent; expectedUpdatedAt?: Date },
  ): Promise<void>;
  findById(workspaceId: string, id: string): Promise<Role | null>;
  /** Live Roles, by name. */
  listAll(workspaceId: string): Promise<Role[]>;
  /**
   * Live non-Owner Team Members per Role id, Employees' sign-ins left out;
   * Roles with none are absent.
   */
  userCounts(workspaceId: string): Promise<Map<string, number>>;
  /** Names of the Company's live Departments, by id (ADR CM-0050). */
  departmentNames(workspaceId: string): Promise<Map<string, string>>;
};
