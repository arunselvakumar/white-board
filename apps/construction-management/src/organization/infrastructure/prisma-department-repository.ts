import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import { Department } from "../domain/department";
import type { DepartmentRepository } from "../domain/department-repository";

type Row = Prisma.ConstructionOrganizationDepartmentGetPayload<object>;

function toDepartment(row: Row): Department {
  return Department.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    isSystem: row.isSystem,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  });
}

function columns(department: Department) {
  return {
    workspaceId: department.workspaceId,
    name: department.name,
    isSystem: department.isSystem,
    updatedAt: department.updatedAt,
    updatedBy: department.updatedBy,
    deletedAt: department.deletedAt,
    deletedBy: department.deletedBy,
  };
}

function mapWriteError(error: unknown): unknown {
  if (isUniqueViolation(error))
    return conflict(
      "DEPARTMENT_NAME_TAKEN",
      "A Department with this name already exists.",
    );
  return error;
}

/** Inserts a new Company's system departments inside `tx` (ADR CM-0049 §3). */
export async function insertDepartments(
  tx: Prisma.TransactionClient,
  departments: readonly Department[],
): Promise<void> {
  if (departments.length === 0) return;
  await tx.constructionOrganizationDepartment.createMany({
    data: departments.map((department) => ({
      id: department.id,
      createdAt: department.createdAt,
      createdBy: department.createdBy,
      ...columns(department),
    })),
  });
}

/**
 * 409 `DEPARTMENT_IN_USE` (details `{ roleCount }`) while live Roles are
 * under the Department (ADR CM-0050). Runs after the delete's update, which
 * locks the row: a Role save holding it `FOR SHARE` finishes first and is
 * counted, and a later one finds the Department deleted.
 */
async function assertNoRoles(
  tx: Prisma.TransactionClient,
  department: Department,
): Promise<void> {
  const roleCount = await tx.constructionOrganizationRole.count({
    where: {
      workspaceId: department.workspaceId,
      departmentId: department.id,
      deletedAt: null,
    },
  });
  if (roleCount > 0)
    throw conflict(
      "DEPARTMENT_IN_USE",
      roleCount === 1
        ? "A Role is under this Department. Move it to another Department, or to none, first."
        : `${String(roleCount)} Roles are under this Department. Move them to another Department, or to none, first.`,
      { roleCount },
    );
}

export class PrismaDepartmentRepository implements DepartmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(
    department: Department,
    options: { audit?: AuditEvent; expectedUpdatedAt?: Date } = {},
  ): Promise<void> {
    const data = columns(department);
    try {
      await this.db.$transaction(async (tx) => {
        if (options.expectedUpdatedAt == null)
          await tx.constructionOrganizationDepartment.upsert({
            where: { id: department.id },
            create: {
              id: department.id,
              createdAt: department.createdAt,
              createdBy: department.createdBy,
              ...data,
            },
            update: data,
          });
        else {
          const written =
            await tx.constructionOrganizationDepartment.updateMany({
              where: {
                id: department.id,
                workspaceId: department.workspaceId,
                updatedAt: options.expectedUpdatedAt,
                deletedAt: null,
              },
              data,
            });
          if (written.count === 0)
            throw conflict(
              "STALE_DEPARTMENT",
              "Someone else changed this Department after you opened it. Reload to see their changes.",
            );
        }
        if (department.deletedAt != null) await assertNoRoles(tx, department);
        if (options.audit != null) await recordAudit(tx, options.audit);
      });
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async findById(workspaceId: string, id: string): Promise<Department | null> {
    const row = await this.db.constructionOrganizationDepartment.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toDepartment(row);
  }

  async listAll(workspaceId: string): Promise<Department[]> {
    const rows = await this.db.constructionOrganizationDepartment.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDepartment);
  }
}
