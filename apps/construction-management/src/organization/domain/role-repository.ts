import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { Role } from "./role";

export type RoleRepository = {
  /**
   * Writes the Role, its matrix and the audit event atomically. With
   * `expectedUpdatedAt`, 409 `STALE_ROLE` unless the stored Role still has
   * that `updatedAt` (someone else saved it meanwhile).
   */
  save(
    role: Role,
    options?: { audit?: AuditEvent; expectedUpdatedAt?: Date },
  ): Promise<void>;
  findById(workspaceId: string, id: string): Promise<Role | null>;
  /** Live Roles, by name. */
  listAll(workspaceId: string): Promise<Role[]>;
  /** Live non-Owner Team Members per Role id; Roles with none are absent. */
  userCounts(workspaceId: string): Promise<Map<string, number>>;
};
