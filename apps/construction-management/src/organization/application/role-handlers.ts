import {
  PermissionSet,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { Role, changedCells, copyName } from "../domain/role";
import type { RoleRepository } from "../domain/role-repository";
import { assertCanGrant, assertNotOwnRole } from "./grant-rules";
import { NO_ROLE_EMPLOYEES, type RoleEmployees } from "./role-employees";
import { toRoleReadModel, type RoleReadModel } from "./role-read-model";

type Grants = Readonly<Partial<Record<string, readonly Flag[]>>>;

function snapshot(role: Role) {
  return {
    name: role.name,
    description: role.description,
    departmentId: role.departmentId,
    permissions: role.permissions.toGrants(),
  };
}

/**
 * Role Management (ADR CM-0030). Routes check `organization.roles` before
 * calling these; `grantor` is who acts, and the Owner when omitted (seeds,
 * tests). A Member saves only cells they hold themselves and never the
 * Role they are on. A Role may be under a Department, or none (ADR CM-0050).
 */
export class RoleHandlers {
  constructor(
    private readonly roles: RoleRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly employees: RoleEmployees = NO_ROLE_EMPLOYEES,
  ) {}

  private async load(workspaceId: string, id: string): Promise<Role> {
    const role = await this.roles.findById(workspaceId, id);
    if (role == null)
      throw notFound("ROLE_NOT_FOUND", "This Role was not found.");
    return role;
  }

  /**
   * A Role just added (Add or Duplicate): nobody is on it yet. The
   * Department names are read before the save, so nothing is read after
   * the commit and a failed read cannot turn a saved Role into an error.
   */
  private async saveNew(role: Role, audit: AuditEvent): Promise<RoleReadModel> {
    const departments =
      role.departmentId == null
        ? new Map<string, string>()
        : await this.roles.departmentNames(role.workspaceId);
    await this.roles.save(role, { audit });
    return toRoleReadModel(role, { users: 0, employees: 0 }, departments);
  }

  private async view(role: Role): Promise<RoleReadModel> {
    const [counts, employees, departments] = await Promise.all([
      this.roles.userCounts(role.workspaceId),
      this.employees.counts(role.workspaceId),
      this.roles.departmentNames(role.workspaceId),
    ]);
    return toRoleReadModel(
      role,
      {
        users: counts.get(role.id) ?? 0,
        employees: employees.get(role.id) ?? 0,
      },
      departments,
    );
  }

  private audit(
    role: Role,
    by: string,
    action: string,
    before?: unknown,
  ): AuditEvent {
    return {
      workspaceId: role.workspaceId,
      actorUserId: by,
      action,
      entityType: "role",
      entityId: role.id,
      before,
      after: role.deletedAt == null ? snapshot(role) : undefined,
    };
  }

  /** Every live Role, by name, with how many Users and Employees are on each. */
  async list(workspaceId: string): Promise<RoleReadModel[]> {
    const [roles, counts, employees, departments] = await Promise.all([
      this.roles.listAll(workspaceId),
      this.roles.userCounts(workspaceId),
      this.employees.counts(workspaceId),
      this.roles.departmentNames(workspaceId),
    ]);
    return roles.map((role) =>
      toRoleReadModel(
        role,
        {
          users: counts.get(role.id) ?? 0,
          employees: employees.get(role.id) ?? 0,
        },
        departments,
      ),
    );
  }

  async get(workspaceId: string, id: string): Promise<RoleReadModel> {
    return this.view(await this.load(workspaceId, id));
  }

  /**
   * 409 `ROLE_NAME_TAKEN`; 403 `CANNOT_GRANT` for a cell the grantor lacks;
   * 400 `ROLE_DEPARTMENT_NOT_FOUND` for a Department not live in the Company.
   */
  async create(input: {
    workspaceId: string;
    by: string;
    grantor?: MemberAccess;
    name: string;
    description?: string | null;
    departmentId?: string | null;
    permissions: Grants;
  }): Promise<RoleReadModel> {
    const now = this.clock();
    const permissions = PermissionSet.fromGrants(input.permissions);
    if (input.grantor != null) assertCanGrant(input.grantor, permissions);
    const role = Role.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      departmentId: input.departmentId,
      permissions,
      by: input.by,
      now,
    });
    return this.saveNew(role, this.audit(role, input.by, "role.created"));
  }

  /**
   * Replaces name, description, Department and matrix. Everyone on the
   * Role has the new access from their next request. 409 `STALE_ROLE` when
   * `updatedAt` is not the stored one; 403 `OWN_ROLE` for the grantor's own
   * Role and `CANNOT_GRANT` for a changed cell they do not hold; 400
   * `ROLE_DEPARTMENT_NOT_FOUND`.
   */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
    name: string;
    description?: string | null;
    departmentId?: string | null;
    permissions: Grants;
    updatedAt: Date;
  }): Promise<RoleReadModel> {
    const role = await this.load(input.workspaceId, input.id);
    const expectedUpdatedAt = role.updatedAt;
    if (expectedUpdatedAt.getTime() !== input.updatedAt.getTime())
      throw conflict(
        "STALE_ROLE",
        "Someone else changed this Role after you opened it. Reload to see their changes.",
      );
    const permissions = PermissionSet.fromGrants(input.permissions);
    if (input.grantor != null) {
      assertNotOwnRole(input.grantor, { roleId: role.id });
      assertCanGrant(
        input.grantor,
        changedCells(role.permissions, permissions),
      );
    }
    const before = snapshot(role);
    role.update({
      name: input.name,
      description: input.description,
      departmentId: input.departmentId,
      permissions,
      by: input.by,
      now: this.clock(),
    });
    await this.roles.save(role, {
      audit: this.audit(role, input.by, "role.updated", before),
      expectedUpdatedAt,
    });
    return this.view(role);
  }

  /**
   * A copy named "<name> (copy)" (then "(copy 2)", …), under the same
   * Department, with nobody on it.
   */
  async duplicate(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
  }): Promise<RoleReadModel> {
    const now = this.clock();
    const [source, all] = await Promise.all([
      this.load(input.workspaceId, input.id),
      this.roles.listAll(input.workspaceId),
    ]);
    if (input.grantor != null)
      assertCanGrant(input.grantor, source.permissions);
    const copy = source.duplicate({
      id: newId(now.getTime()),
      name: copyName(
        source.name,
        new Set(all.map((role) => role.name.toLowerCase())),
      ),
      by: input.by,
      now,
    });
    return this.saveNew(
      copy,
      this.audit(copy, input.by, "role.duplicated", {
        sourceRoleId: source.id,
      }),
    );
  }

  /**
   * 409 `ROLE_IS_DEFAULT` for a default Role; 409 `ROLE_IN_USE` (details
   * `{ userCount, employeeCount }`) while Team Members or live Employees
   * are on it (ADR CM-0055 §2).
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const role = await this.load(input.workspaceId, input.id);
    role.assertDeletable();
    const [users, employees] = await Promise.all([
      this.roles.userCounts(input.workspaceId),
      this.employees.counts(input.workspaceId),
    ]);
    const userCount = users.get(role.id) ?? 0;
    const employeeCount = employees.get(role.id) ?? 0;
    if (userCount > 0 || employeeCount > 0)
      throw conflict(
        "ROLE_IN_USE",
        employeeCount > 0
          ? "Employees are on this Role. Give them another Role first."
          : "Staff are on this Role. Give them another Role first.",
        { userCount, employeeCount },
      );
    const before = snapshot(role);
    role.delete(input.by, this.clock());
    await this.roles.save(role, {
      audit: this.audit(role, input.by, "role.deleted", before),
    });
  }
}
