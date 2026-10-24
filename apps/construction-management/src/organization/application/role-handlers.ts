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
import { toRoleReadModel, type RoleReadModel } from "./role-read-model";

type Grants = Readonly<Partial<Record<string, readonly Flag[]>>>;

function snapshot(role: Role) {
  return {
    name: role.name,
    description: role.description,
    permissions: role.permissions.toGrants(),
  };
}

/**
 * Role Management (ADR CM-0029). Routes check `organization.roles` before
 * calling these; `grantor` is who acts, and the Owner when omitted (seeds,
 * tests). A Member saves only cells they hold themselves and never the
 * Role they are on.
 */
export class RoleHandlers {
  constructor(
    private readonly roles: RoleRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Role> {
    const role = await this.roles.findById(workspaceId, id);
    if (role == null)
      throw notFound("ROLE_NOT_FOUND", "This Role was not found.");
    return role;
  }

  private async view(role: Role): Promise<RoleReadModel> {
    const counts = await this.roles.userCounts(role.workspaceId);
    return toRoleReadModel(role, counts.get(role.id) ?? 0);
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

  /** Every live Role, by name, with how many Users are on each. */
  async list(workspaceId: string): Promise<RoleReadModel[]> {
    const [roles, counts] = await Promise.all([
      this.roles.listAll(workspaceId),
      this.roles.userCounts(workspaceId),
    ]);
    return roles.map((role) => toRoleReadModel(role, counts.get(role.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<RoleReadModel> {
    return this.view(await this.load(workspaceId, id));
  }

  /** 409 `ROLE_NAME_TAKEN`; 403 `CANNOT_GRANT` for a cell the grantor lacks. */
  async create(input: {
    workspaceId: string;
    by: string;
    grantor?: MemberAccess;
    name: string;
    description?: string | null;
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
      permissions,
      by: input.by,
      now,
    });
    await this.roles.save(role, {
      audit: this.audit(role, input.by, "role.created"),
    });
    return toRoleReadModel(role, 0);
  }

  /**
   * Replaces name, description and matrix. Everyone on the Role has the
   * new access from their next request. 409 `STALE_ROLE` when `updatedAt`
   * is not the stored one; 403 `OWN_ROLE` for the grantor's own Role and
   * `CANNOT_GRANT` for a changed cell they do not hold.
   */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
    name: string;
    description?: string | null;
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

  /** A copy named "<name> (copy)" (then "(copy 2)", …), with nobody on it. */
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
    await this.roles.save(copy, {
      audit: this.audit(copy, input.by, "role.duplicated", {
        sourceRoleId: source.id,
      }),
    });
    return toRoleReadModel(copy, 0);
  }

  /** 409 `ROLE_IN_USE` (details `{ userCount }`) while anyone is on it. */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const role = await this.load(input.workspaceId, input.id);
    const userCount =
      (await this.roles.userCounts(input.workspaceId)).get(role.id) ?? 0;
    if (userCount > 0)
      throw conflict(
        "ROLE_IN_USE",
        "Users are on this Role. Give them another Role first.",
        { userCount },
      );
    const before = snapshot(role);
    role.delete(input.by, this.clock());
    await this.roles.save(role, {
      audit: this.audit(role, input.by, "role.deleted", before),
    });
  }
}
