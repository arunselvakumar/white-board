import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { Department } from "../domain/department";
import type { DepartmentRepository } from "../domain/department-repository";

export type DepartmentReadModel = {
  id: string;
  name: string;
  /** Human Resources and Marketing: name fixed, never deleted. */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toReadModel(department: Department): DepartmentReadModel {
  return {
    id: department.id,
    name: department.name,
    isSystem: department.isSystem,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
  };
}

/**
 * Manage Departments (ADR CM-0049). Routes check `organization.departments`
 * before calling these. Roles may be under a department (ADR CM-0050):
 * a rename shows on them at once, and a delete waits until none is.
 */
export class DepartmentHandlers {
  constructor(
    private readonly departments: DepartmentRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Department> {
    const department = await this.departments.findById(workspaceId, id);
    if (department == null)
      throw notFound("DEPARTMENT_NOT_FOUND", "This Department was not found.");
    return department;
  }

  private audit(
    department: Department,
    by: string,
    action: string,
    before?: unknown,
  ): AuditEvent {
    return {
      workspaceId: department.workspaceId,
      actorUserId: by,
      action,
      entityType: "department",
      entityId: department.id,
      before,
      after:
        department.deletedAt == null ? { name: department.name } : undefined,
    };
  }

  /** Every live department, by name. */
  async list(workspaceId: string): Promise<DepartmentReadModel[]> {
    return (await this.departments.listAll(workspaceId)).map(toReadModel);
  }

  /** 409 `DEPARTMENT_NAME_TAKEN`. */
  async create(input: {
    workspaceId: string;
    by: string;
    name: string;
  }): Promise<DepartmentReadModel> {
    const now = this.clock();
    const department = Department.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      name: input.name,
      by: input.by,
      now,
    });
    await this.departments.save(department, {
      audit: this.audit(department, input.by, "department.created"),
    });
    return toReadModel(department);
  }

  /**
   * 400 `DEPARTMENT_SYSTEM_LOCKED`; 409 `STALE_DEPARTMENT` when
   * `expectedUpdatedAt` is not the stored one; 409 `DEPARTMENT_NAME_TAKEN`.
   */
  async rename(input: {
    workspaceId: string;
    id: string;
    by: string;
    name: string;
    expectedUpdatedAt: Date;
  }): Promise<DepartmentReadModel> {
    const department = await this.load(input.workspaceId, input.id);
    const expectedUpdatedAt = department.updatedAt;
    if (expectedUpdatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw conflict(
        "STALE_DEPARTMENT",
        "Someone else changed this Department after you opened it. Reload to see their changes.",
      );
    const before = { name: department.name };
    department.rename({ name: input.name, by: input.by, now: this.clock() });
    await this.departments.save(department, {
      audit: this.audit(department, input.by, "department.renamed", before),
      expectedUpdatedAt,
    });
    return toReadModel(department);
  }

  /**
   * 409 `DEPARTMENT_IS_SYSTEM` for Human Resources and Marketing; 409
   * `DEPARTMENT_IN_USE` while live Roles are under it.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const department = await this.load(input.workspaceId, input.id);
    const expectedUpdatedAt = department.updatedAt;
    const before = { name: department.name };
    department.delete(input.by, this.clock());
    await this.departments.save(department, {
      audit: this.audit(department, input.by, "department.deleted", before),
      expectedUpdatedAt,
    });
  }
}
