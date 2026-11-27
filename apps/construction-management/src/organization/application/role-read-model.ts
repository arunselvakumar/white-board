import type { PermissionGrants } from "@/src/shared-kernel/access";

import type { Role } from "../domain/role";

export type RoleReadModel = {
  id: string;
  name: string;
  description: string | null;
  isSeed: boolean;
  /** The Department the Role is under, or none (ADR CM-0050). */
  department: { id: string; name: string } | null;
  permissions: PermissionGrants;
  /** Live non-Owner Team Members on the Role, Employees' sign-ins left out. */
  userCount: number;
  /** Live Employees on the Role (ADR CM-0055 §2). */
  employeeCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** `departmentNames` holds the Company's live Departments by id. */
export function toRoleReadModel(
  role: Role,
  counts: { users: number; employees: number },
  departmentNames: ReadonlyMap<string, string>,
): RoleReadModel {
  const departmentName =
    role.departmentId == null
      ? undefined
      : departmentNames.get(role.departmentId);
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSeed: role.isSeed,
    department:
      role.departmentId == null || departmentName == null
        ? null
        : { id: role.departmentId, name: departmentName },
    permissions: role.permissions.toGrants(),
    userCount: counts.users,
    employeeCount: counts.employees,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
