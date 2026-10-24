import type { Prisma, PrismaClient } from "@repo/construction-db";

import { PermissionSet } from "@/src/shared-kernel/access";
import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import { Role } from "../domain/role";
import type { RoleRepository } from "../domain/role-repository";

const INCLUDE = {
  permissions: { select: { menu: true, flags: true } },
} satisfies Prisma.ConstructionOrganizationRoleInclude;

type Row = Prisma.ConstructionOrganizationRoleGetPayload<{
  include: typeof INCLUDE;
}>;

function toRole(row: Row): Role {
  const masks: Record<string, number> = {};
  for (const grant of row.permissions) masks[grant.menu] = grant.flags;
  return Role.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    isSeed: row.isSeed,
    permissions: PermissionSet.fromMasks(masks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function columns(role: Role) {
  return {
    workspaceId: role.workspaceId,
    name: role.name,
    description: role.description,
    isSeed: role.isSeed,
    updatedAt: role.updatedAt,
    updatedBy: role.updatedBy,
    deletedAt: role.deletedAt,
  };
}

function matrixRows(role: Role) {
  return Object.entries(role.permissions.toMasks()).map(([menu, flags]) => ({
    workspaceId: role.workspaceId,
    roleId: role.id,
    menu,
    flags,
    updatedAt: role.updatedAt,
    updatedBy: role.updatedBy,
  }));
}

function mapWriteError(error: unknown): unknown {
  if (isUniqueViolation(error))
    return conflict("ROLE_NAME_TAKEN", "A Role with this name already exists.");
  return error;
}

function stale() {
  return conflict(
    "STALE_ROLE",
    "Someone else changed this Role after you opened it. Reload to see their changes.",
  );
}

/** Inserts new Roles and their matrices (the seed copy) inside `tx`. */
export async function insertRoles(
  tx: Prisma.TransactionClient,
  roles: readonly Role[],
): Promise<void> {
  if (roles.length === 0) return;
  try {
    await tx.constructionOrganizationRole.createMany({
      data: roles.map((role) => ({
        id: role.id,
        createdAt: role.createdAt,
        createdBy: role.createdBy,
        ...columns(role),
      })),
    });
  } catch (error) {
    throw mapWriteError(error);
  }
  const rows = roles.flatMap(matrixRows);
  if (rows.length > 0)
    await tx.constructionOrganizationRoleMenuPermission.createMany({
      data: rows,
    });
}

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Writes the Role and replaces its matrix inside `tx`. */
  async write(
    tx: Prisma.TransactionClient,
    role: Role,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const data = columns(role);
    try {
      if (expectedUpdatedAt == null)
        await tx.constructionOrganizationRole.upsert({
          where: { id: role.id },
          create: {
            id: role.id,
            createdAt: role.createdAt,
            createdBy: role.createdBy,
            ...data,
          },
          update: data,
        });
      else {
        const written = await tx.constructionOrganizationRole.updateMany({
          where: {
            id: role.id,
            workspaceId: role.workspaceId,
            updatedAt: expectedUpdatedAt,
            deletedAt: null,
          },
          data,
        });
        if (written.count === 0) throw stale();
      }
    } catch (error) {
      throw mapWriteError(error);
    }
    await tx.constructionOrganizationRoleMenuPermission.deleteMany({
      where: { roleId: role.id },
    });
    const rows = matrixRows(role);
    if (rows.length > 0)
      await tx.constructionOrganizationRoleMenuPermission.createMany({
        data: rows,
      });
  }

  async save(
    role: Role,
    options: { audit?: AuditEvent; expectedUpdatedAt?: Date } = {},
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.write(tx, role, options.expectedUpdatedAt);
      if (options.audit != null) await recordAudit(tx, options.audit);
    });
  }

  async findById(workspaceId: string, id: string): Promise<Role | null> {
    const row = await this.db.constructionOrganizationRole.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toRole(row);
  }

  async listAll(workspaceId: string): Promise<Role[]> {
    const rows = await this.db.constructionOrganizationRole.findMany({
      where: { workspaceId, deletedAt: null },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toRole);
  }

  async userCounts(workspaceId: string): Promise<Map<string, number>> {
    const groups = await this.db.constructionOrganizationTeamMember.groupBy({
      by: ["roleId"],
      where: {
        workspaceId,
        deletedAt: null,
        isOwner: false,
        roleId: { not: null },
      },
      _count: { _all: true },
    });
    return new Map(
      groups.flatMap((group) =>
        group.roleId == null ? [] : [[group.roleId, group._count._all]],
      ),
    );
  }
}
