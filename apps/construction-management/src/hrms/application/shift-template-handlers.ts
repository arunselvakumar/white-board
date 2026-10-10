import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { notFound } from "@/src/shared-kernel/domain-error";

import {
  assertSlotShiftsUsable,
  createRotationTemplate,
  createShiftTemplate,
  slotShiftIds,
  type RotationTemplateDetails,
  type RotationTemplateInput,
  type ShiftTemplateDetails,
  type ShiftTemplateInput,
} from "../domain/shift";

export type StoredShiftTemplate = ShiftTemplateDetails & {
  id: string;
  /** Named by a rotation slot or a shift assignment: it cannot be deleted. */
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredRotationTemplate = RotationTemplateDetails & {
  id: string;
  /** Assigned to a member: it cannot be deleted. */
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Write<T> = { workspaceId: string; template: T; by: string; now: Date };
type Change<T> = Write<T> & { id: string; expectedUpdatedAt: Date };
type Delete = { workspaceId: string; id: string; by: string; now: Date };

/**
 * Shift templates in `construction_hrms.shift_templates`. Writes are
 * audited. 409 `SHIFT_NAME_TAKEN` for a live template of the same name;
 * 404 `SHIFT_TEMPLATE_NOT_FOUND`; 409 `SHIFT_TEMPLATE_CHANGED` for a stale
 * `expectedUpdatedAt`; delete is 409 `SHIFT_TEMPLATE_IN_USE` when a
 * rotation slot or any assignment (past ones too) names it.
 */
export type ShiftTemplateStore = {
  list(workspaceId: string): Promise<StoredShiftTemplate[]>;
  find(workspaceId: string, id: string): Promise<StoredShiftTemplate | null>;
  create(input: Write<ShiftTemplateDetails>): Promise<StoredShiftTemplate>;
  update(input: Change<ShiftTemplateDetails>): Promise<StoredShiftTemplate>;
  delete(input: Delete): Promise<void>;
};

/** Rotation templates and their slots; the same rules as `ShiftTemplateStore`, `ROTATION_*` codes. */
export type RotationTemplateStore = {
  list(workspaceId: string): Promise<StoredRotationTemplate[]>;
  find(workspaceId: string, id: string): Promise<StoredRotationTemplate | null>;
  create(
    input: Write<RotationTemplateDetails>,
  ): Promise<StoredRotationTemplate>;
  update(
    input: Change<RotationTemplateDetails>,
  ): Promise<StoredRotationTemplate>;
  delete(input: Delete): Promise<void>;
};

/**
 * Shift templates and rotation templates (CM-306). Menu `hrms.shifts`:
 * `read`, `create`, `update`, `delete`. A template in use is deactivated
 * (an update with `isActive` false), never deleted; deactivating keeps
 * existing rotations and assignments working and only hides it from the
 * pickers (`active*`).
 */
export class ShiftTemplateHandlers {
  constructor(
    private readonly shifts: ShiftTemplateStore,
    private readonly rotations: RotationTemplateStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async listShifts(input: {
    access: MemberAccess;
    activeOnly?: boolean;
  }): Promise<StoredShiftTemplate[]> {
    assertCan(input.access, "hrms.shifts", "read");
    const all = await this.shifts.list(input.access.workspaceId);
    return input.activeOnly === true
      ? all.filter((item) => item.isActive)
      : all;
  }

  async createShift(input: {
    access: MemberAccess;
    template: ShiftTemplateInput;
  }): Promise<StoredShiftTemplate> {
    assertCan(input.access, "hrms.shifts", "create");
    return this.shifts.create({
      workspaceId: input.access.workspaceId,
      template: createShiftTemplate(input.template),
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async updateShift(input: {
    access: MemberAccess;
    id: string;
    template: ShiftTemplateInput;
    expectedUpdatedAt: Date;
  }): Promise<StoredShiftTemplate> {
    assertCan(input.access, "hrms.shifts", "update");
    return this.shifts.update({
      workspaceId: input.access.workspaceId,
      id: input.id,
      template: createShiftTemplate(input.template),
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async deleteShift(input: { access: MemberAccess; id: string }) {
    assertCan(input.access, "hrms.shifts", "delete");
    await this.shifts.delete({
      workspaceId: input.access.workspaceId,
      id: input.id,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async listRotations(input: {
    access: MemberAccess;
    activeOnly?: boolean;
  }): Promise<StoredRotationTemplate[]> {
    assertCan(input.access, "hrms.shifts", "read");
    const all = await this.rotations.list(input.access.workspaceId);
    return input.activeOnly === true
      ? all.filter((item) => item.isActive)
      : all;
  }

  private async shiftStates(workspaceId: string) {
    const shifts = await this.shifts.list(workspaceId);
    return new Map(shifts.map((shift) => [shift.id, shift]));
  }

  async createRotation(input: {
    access: MemberAccess;
    template: RotationTemplateInput;
  }): Promise<StoredRotationTemplate> {
    assertCan(input.access, "hrms.shifts", "create");
    const template = createRotationTemplate(input.template);
    assertSlotShiftsUsable(
      template.slots,
      await this.shiftStates(input.access.workspaceId),
    );
    return this.rotations.create({
      workspaceId: input.access.workspaceId,
      template,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async updateRotation(input: {
    access: MemberAccess;
    id: string;
    template: RotationTemplateInput;
    expectedUpdatedAt: Date;
  }): Promise<StoredRotationTemplate> {
    assertCan(input.access, "hrms.shifts", "update");
    const { workspaceId } = input.access;
    const stored = await this.rotations.find(workspaceId, input.id);
    if (stored == null)
      throw notFound(
        "ROTATION_TEMPLATE_NOT_FOUND",
        "This rotation was deleted.",
      );
    const template = createRotationTemplate(input.template);
    assertSlotShiftsUsable(
      template.slots,
      await this.shiftStates(workspaceId),
      new Set(slotShiftIds(stored.slots)),
    );
    return this.rotations.update({
      workspaceId,
      id: input.id,
      template,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async deleteRotation(input: { access: MemberAccess; id: string }) {
    assertCan(input.access, "hrms.shifts", "delete");
    await this.rotations.delete({
      workspaceId: input.access.workspaceId,
      id: input.id,
      by: input.access.userId,
      now: this.clock(),
    });
  }
}
