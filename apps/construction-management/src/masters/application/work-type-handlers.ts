import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  masterChanged,
  masterInUse,
  masterNotFound,
} from "../domain/master-kind";
import { WorkType, type WorkTypeInput } from "../domain/work-type";
import type {
  WorkTypeMaterial,
  WorkTypeRow,
  WorkTypeStore,
  WorkTypeUsage,
} from "./work-type-ports";

type Clock = () => Date;
type Target = { workspaceId: string; id: string; by: string };

/** Which rows a list returns: every live row (default), or one state. */
export type WorkTypeStatusFilter = "all" | "enabled" | "disabled";

export type WorkTypeReadModel = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  departmentDisabled: boolean;
  materials: WorkTypeMaterial[];
  isSeed: boolean;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toReadModel(row: WorkTypeRow): WorkTypeReadModel {
  const { workType } = row;
  return {
    id: workType.id,
    name: workType.name,
    departmentId: workType.departmentId,
    departmentName: row.departmentName,
    departmentDisabled: row.departmentDisabled,
    materials: row.materials,
    isSeed: workType.isSeed,
    disabled: workType.disabled,
    createdAt: workType.createdAt,
    updatedAt: workType.updatedAt,
  };
}

/**
 * Work Types (CM-601, menu `masters.work_types`): a name unique among live
 * rows (any case), a live Department, and assigned Materials. Access is
 * checked by the caller.
 */
export class WorkTypeHandlers {
  constructor(
    private readonly store: WorkTypeStore,
    private readonly clock: Clock = () => new Date(),
    /** Without it, delete does not look at worksheets (unit tests). */
    private readonly usage?: WorkTypeUsage,
  ) {}

  private async load(workspaceId: string, id: string): Promise<WorkTypeRow> {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("work_type");
    return found;
  }

  /**
   * 400 `DEPARTMENT_NOT_FOUND` / `DEPARTMENT_DISABLED` and
   * `MATERIAL_NOT_FOUND` / `MATERIAL_DISABLED`; a disabled pick the Work
   * Type already had is kept.
   */
  private async checkPicks(
    workspaceId: string,
    details: { departmentId: string; materialIds: readonly string[] },
    current: { departmentId: string; materialIds: readonly string[] } | null,
  ): Promise<void> {
    const [department, materials] = await Promise.all([
      this.store.department(workspaceId, details.departmentId),
      details.materialIds.length === 0
        ? []
        : this.store.materials(workspaceId, details.materialIds),
    ]);
    if (department == null)
      throw new DomainError(
        "DEPARTMENT_NOT_FOUND",
        "Choose the Department from the list. It was not found.",
        { details: { field: "departmentId", id: details.departmentId } },
      );
    if (department.disabled && current?.departmentId !== details.departmentId)
      throw new DomainError(
        "DEPARTMENT_DISABLED",
        `${department.name} is disabled in Masters, so it cannot be chosen.`,
        { details: { field: "departmentId", id: details.departmentId } },
      );
    const found = new Map(materials.map((item) => [item.id, item]));
    const missing = details.materialIds.filter((id) => !found.has(id));
    if (missing.length > 0)
      throw new DomainError(
        "MATERIAL_NOT_FOUND",
        "Some Materials were not found. Choose them from the list again.",
        { details: { field: "materialIds", ids: missing } },
      );
    const kept = new Set(current?.materialIds ?? []);
    const disabled = materials.filter(
      (item) => item.disabled && !kept.has(item.id),
    );
    if (disabled.length > 0)
      throw new DomainError(
        "MATERIAL_DISABLED",
        `${disabled.map((item) => item.name).join(", ")} ${disabled.length === 1 ? "is" : "are"} disabled in Masters, so ${disabled.length === 1 ? "it cannot" : "they cannot"} be assigned.`,
        {
          details: {
            field: "materialIds",
            ids: disabled.map((item) => item.id),
          },
        },
      );
  }

  async list(
    workspaceId: string,
    status: WorkTypeStatusFilter = "all",
  ): Promise<WorkTypeReadModel[]> {
    const rows = await this.store.list(workspaceId);
    return rows
      .filter(
        (row) =>
          status === "all" || row.workType.disabled === (status === "disabled"),
      )
      .map(toReadModel);
  }

  async get(workspaceId: string, id: string): Promise<WorkTypeReadModel> {
    return toReadModel(await this.load(workspaceId, id));
  }

  async create(input: {
    workspaceId: string;
    details: WorkTypeInput;
    by: string;
  }): Promise<WorkTypeReadModel> {
    const now = this.clock();
    const workType = WorkType.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details: input.details,
      by: input.by,
      now,
    });
    await this.checkPicks(input.workspaceId, workType, null);
    await this.store.insert(workType, {
      action: "work_type.created",
      before: null,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, workType.id);
  }

  /** 409 `WORK_TYPE_CHANGED` on a stale `expectedUpdatedAt`. */
  async update(
    input: Target & { details: WorkTypeInput; expectedUpdatedAt: Date },
  ): Promise<WorkTypeReadModel> {
    const { workType } = await this.load(input.workspaceId, input.id);
    if (workType.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw masterChanged("work_type");
    const before = workType.snapshot();
    const now = this.clock();
    workType.update(input.details, input.by, now);
    await this.checkPicks(input.workspaceId, workType, before);
    await this.store.update(workType, input.expectedUpdatedAt, {
      action: "work_type.updated",
      before,
      by: input.by,
      now,
    });
    return this.get(input.workspaceId, workType.id);
  }

  async setDisabled(
    input: Target & { disabled: boolean },
  ): Promise<WorkTypeReadModel> {
    const row = await this.load(input.workspaceId, input.id);
    const { workType } = row;
    const loadedAt = workType.updatedAt;
    const before = workType.snapshot();
    const now = this.clock();
    if (workType.setDisabled(input.disabled, input.by, now))
      await this.store.update(workType, loadedAt, {
        action: `work_type.${input.disabled ? "disabled" : "enabled"}`,
        before,
        by: input.by,
        now,
      });
    return toReadModel(row);
  }

  /**
   * Tombstones a Company-made Work Type. 409 `SEED_IS_READ_ONLY` for the
   * seed, `WORK_TYPE_IN_USE` while a live Daily Worksheet names it.
   */
  async delete(input: Target): Promise<void> {
    const { workType } = await this.load(input.workspaceId, input.id);
    const loadedAt = workType.updatedAt;
    const before = workType.snapshot();
    const now = this.clock();
    workType.delete(input.by, now);
    if (this.usage != null && (await this.usage(input.workspaceId, input.id)))
      throw masterInUse("work_type");
    await this.store.update(workType, loadedAt, {
      action: "work_type.deleted",
      before,
      by: input.by,
      now,
    });
  }
}
