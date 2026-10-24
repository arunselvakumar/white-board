import type { PermissionGrants } from "@/src/shared-kernel/access";

import type { Role } from "../domain/role";

export type RoleReadModel = {
  id: string;
  name: string;
  description: string | null;
  isSeed: boolean;
  permissions: PermissionGrants;
  /** Live non-Owner Team Members on the Role. */
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toRoleReadModel(role: Role, userCount: number): RoleReadModel {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSeed: role.isSeed,
    permissions: role.permissions.toGrants(),
    userCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
