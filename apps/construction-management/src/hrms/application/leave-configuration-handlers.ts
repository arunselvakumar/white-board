import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { assertCalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  createLeaveStructure,
  type LeaveStructureInput,
} from "../domain/leave-structure";
import {
  ACCRUAL_FREQUENCIES,
  ACCRUAL_MODE_LABELS,
  ACCRUAL_MODES,
  createLeaveType,
  LEAVE_TYPE_LIMITS,
  type LeaveTypeInput,
} from "../domain/leave-type";
import type {
  LeaveStructureStore,
  LeaveTypeStore,
  StoredLeaveAssignment,
  StoredLeaveStructure,
  StoredLeaveType,
} from "./leave-ports";
import type { EmployeeDirectory } from "./ports";

const MENU = "hrms.leave_structures" as const;

export const leaveTypeNotFound = () =>
  notFound("LEAVE_TYPE_NOT_FOUND", "This leave type was not found.");

export const leaveStructureNotFound = () =>
  notFound("LEAVE_STRUCTURE_NOT_FOUND", "This leave structure was not found.");

export type LeaveTypeReadModel = StoredLeaveType & {
  /** A structure, a balance or a request uses it: deactivate instead of delete. */
  inUse: boolean;
};

export type LeaveStructureReadModel = Omit<StoredLeaveStructure, "lines"> & {
  lines: readonly {
    leaveTypeId: string;
    leaveTypeName: string;
    entitlementDays: number | null;
    /** The days a member gets: the line's own or the type's yearly limit. */
    effectiveDays: number;
  }[];
};

export type LeaveAssignmentReadModel = StoredLeaveAssignment & {
  memberName: string;
  structureName: string;
};

/**
 * Leave types, structures and assignments (CM-310, CM-311). Menu
 * `hrms.leave_structures`: read to see, create / update / delete to change.
 */
export class LeaveConfigurationHandlers {
  constructor(
    private readonly types: LeaveTypeStore,
    private readonly structures: LeaveStructureStore,
    private readonly employees: EmployeeDirectory,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // -------------------------------------------------------------------------
  // Leave types
  // -------------------------------------------------------------------------

  async listTypes(access: MemberAccess): Promise<LeaveTypeReadModel[]> {
    assertCan(access, MENU, "read");
    const types = await this.types.list(access.workspaceId);
    const used = await this.types.inUse(
      access.workspaceId,
      types.map((type) => type.id),
    );
    return types.map((type) => ({ ...type, inUse: used.has(type.id) }));
  }

  async getType(access: MemberAccess, id: string): Promise<LeaveTypeReadModel> {
    assertCan(access, MENU, "read");
    const type = await this.types.find(access.workspaceId, id);
    if (type == null) throw leaveTypeNotFound();
    const used = await this.types.inUse(access.workspaceId, [id]);
    return { ...type, inUse: used.has(id) };
  }

  /** The choices the leave type form offers (`modules/10` `accrual-options`). */
  accrualOptions(access: MemberAccess) {
    assertCan(access, MENU, "read");
    return {
      modes: ACCRUAL_MODES.map((mode) => ({
        value: mode,
        ...ACCRUAL_MODE_LABELS[mode],
      })),
      frequencies: ACCRUAL_FREQUENCIES.map((value) => ({
        value,
        label: "Monthly",
      })),
      maxAccrualDay: LEAVE_TYPE_LIMITS.maxAccrualDay,
      maxDays: LEAVE_TYPE_LIMITS.maxDays,
    };
  }

  async createType(
    access: MemberAccess,
    input: LeaveTypeInput,
  ): Promise<LeaveTypeReadModel> {
    assertCan(access, MENU, "create");
    const type = createLeaveType(input);
    const now = this.clock();
    const stored = await this.types.insert(
      access.workspaceId,
      newId(now.getTime()),
      type,
      { by: access.userId, now, action: "leave_type.created" },
    );
    return { ...stored, inUse: false };
  }

  async updateType(
    access: MemberAccess,
    id: string,
    input: LeaveTypeInput,
    expectedUpdatedAt: Date,
  ): Promise<LeaveTypeReadModel> {
    assertCan(access, MENU, "update");
    const current = await this.types.find(access.workspaceId, id);
    if (current == null) throw leaveTypeNotFound();
    const type = createLeaveType({ ...input, isActive: current.isActive });
    const stored = await this.types.update(
      access.workspaceId,
      id,
      type,
      expectedUpdatedAt,
      { by: access.userId, now: this.clock(), action: "leave_type.updated" },
    );
    const used = await this.types.inUse(access.workspaceId, [id]);
    return { ...stored, inUse: used.has(id) };
  }

  /** Deactivate (no new requests) or activate again; seeds too. */
  async setTypeActive(
    access: MemberAccess,
    id: string,
    active: boolean,
    expectedUpdatedAt: Date,
  ): Promise<LeaveTypeReadModel> {
    assertCan(access, MENU, "update");
    const current = await this.types.find(access.workspaceId, id);
    if (current == null) throw leaveTypeNotFound();
    const stored = await this.types.update(
      access.workspaceId,
      id,
      { ...current, isActive: active },
      expectedUpdatedAt,
      {
        by: access.userId,
        now: this.clock(),
        action: active ? "leave_type.activated" : "leave_type.deactivated",
      },
    );
    const used = await this.types.inUse(access.workspaceId, [id]);
    return { ...stored, inUse: used.has(id) };
  }

  /** A type nobody uses can be deleted; one in use is deactivated instead. */
  async deleteType(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, MENU, "delete");
    const current = await this.types.find(access.workspaceId, id);
    if (current == null) throw leaveTypeNotFound();
    await this.types.delete(access.workspaceId, id, expectedUpdatedAt, {
      by: access.userId,
      now: this.clock(),
      action: "leave_type.deleted",
    });
  }

  // -------------------------------------------------------------------------
  // Structures
  // -------------------------------------------------------------------------

  private async structureModels(
    workspaceId: string,
    structures: readonly StoredLeaveStructure[],
  ): Promise<LeaveStructureReadModel[]> {
    const types = new Map(
      (await this.types.list(workspaceId)).map((type) => [type.id, type]),
    );
    return structures.map((structure) => ({
      ...structure,
      lines: structure.lines
        .map((line) => {
          const type = types.get(line.leaveTypeId);
          return {
            leaveTypeId: line.leaveTypeId,
            leaveTypeName: type?.name ?? "—",
            entitlementDays: line.entitlementDays,
            effectiveDays: line.entitlementDays ?? type?.yearlyLimit ?? 0,
          };
        })
        .sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName)),
    }));
  }

  private async assertTypesExist(
    workspaceId: string,
    structure: { lines: readonly { leaveTypeId: string }[] },
  ): Promise<void> {
    const types = new Map(
      (await this.types.list(workspaceId)).map((type) => [type.id, type]),
    );
    structure.lines.forEach((line, index) => {
      if (!types.has(line.leaveTypeId))
        throw new DomainError(
          "LEAVE_TYPE_NOT_FOUND",
          "A leave type in this structure was not found.",
          { kind: "not_found", details: { field: "lines", index } },
        );
    });
  }

  async listStructures(
    access: MemberAccess,
  ): Promise<LeaveStructureReadModel[]> {
    assertCan(access, MENU, "read");
    return this.structureModels(
      access.workspaceId,
      await this.structures.list(access.workspaceId),
    );
  }

  async getStructure(
    access: MemberAccess,
    id: string,
  ): Promise<LeaveStructureReadModel> {
    assertCan(access, MENU, "read");
    const structure = await this.structures.find(access.workspaceId, id);
    if (structure == null) throw leaveStructureNotFound();
    const [model] = await this.structureModels(access.workspaceId, [structure]);
    if (model == null) throw leaveStructureNotFound();
    return model;
  }

  async createStructure(
    access: MemberAccess,
    input: LeaveStructureInput,
  ): Promise<LeaveStructureReadModel> {
    assertCan(access, MENU, "create");
    const structure = createLeaveStructure(input);
    await this.assertTypesExist(access.workspaceId, structure);
    const now = this.clock();
    const stored = await this.structures.insert(
      access.workspaceId,
      newId(now.getTime()),
      structure,
      { by: access.userId, now, action: "leave_structure.created" },
    );
    const [model] = await this.structureModels(access.workspaceId, [stored]);
    if (model == null) throw leaveStructureNotFound();
    return model;
  }

  async updateStructure(
    access: MemberAccess,
    id: string,
    input: LeaveStructureInput,
    expectedUpdatedAt: Date,
  ): Promise<LeaveStructureReadModel> {
    assertCan(access, MENU, "update");
    if ((await this.structures.find(access.workspaceId, id)) == null)
      throw leaveStructureNotFound();
    const structure = createLeaveStructure(input);
    await this.assertTypesExist(access.workspaceId, structure);
    const stored = await this.structures.update(
      access.workspaceId,
      id,
      structure,
      expectedUpdatedAt,
      {
        by: access.userId,
        now: this.clock(),
        action: "leave_structure.updated",
      },
    );
    const [model] = await this.structureModels(access.workspaceId, [stored]);
    if (model == null) throw leaveStructureNotFound();
    return model;
  }

  async deleteStructure(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, MENU, "delete");
    if ((await this.structures.find(access.workspaceId, id)) == null)
      throw leaveStructureNotFound();
    await this.structures.delete(access.workspaceId, id, expectedUpdatedAt, {
      by: access.userId,
      now: this.clock(),
      action: "leave_structure.deleted",
    });
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  async listAssignments(
    access: MemberAccess,
    filter: { memberId?: string; structureId?: string },
  ): Promise<LeaveAssignmentReadModel[]> {
    assertCan(access, MENU, "read");
    const [rows, structures, employees] = await Promise.all([
      this.structures.assignments(access.workspaceId, {
        memberIds: filter.memberId == null ? undefined : [filter.memberId],
        structureId: filter.structureId,
      }),
      this.structures.list(access.workspaceId),
      this.employees.list(access.workspaceId),
    ]);
    const structureNames = new Map(structures.map((s) => [s.id, s.name]));
    const memberNames = new Map(employees.map((e) => [e.memberId, e.name]));
    return rows
      .filter((row) => memberNames.has(row.memberId))
      .map((row) => ({
        ...row,
        memberName: memberNames.get(row.memberId) ?? "—",
        structureName: structureNames.get(row.structureId) ?? "—",
      }));
  }

  /** Assigns a structure to members from a date (CM-311). */
  async assign(
    access: MemberAccess,
    input: {
      structureId: string;
      memberIds: readonly string[];
      effectiveFrom: string;
    },
  ): Promise<LeaveAssignmentReadModel[]> {
    assertCan(access, MENU, "create");
    const effectiveFrom = assertCalendarDate(
      input.effectiveFrom,
      "LEAVE_ASSIGNMENT_DATE_INVALID",
    );
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length === 0)
      throw new DomainError(
        "LEAVE_ASSIGNMENT_MEMBERS_REQUIRED",
        "Choose at least one Team Member.",
        { details: { field: "memberIds" } },
      );
    const structure = await this.structures.find(
      access.workspaceId,
      input.structureId,
    );
    if (structure == null) throw leaveStructureNotFound();
    const members = await this.employees.find(access.workspaceId, memberIds);
    for (const memberId of memberIds)
      if (!members.has(memberId))
        throw new DomainError(
          "TEAM_MEMBER_NOT_FOUND",
          "A Team Member was not found.",
          { kind: "not_found", details: { field: "memberIds", memberId } },
        );
    const now = this.clock();
    const rows = memberIds.map((memberId) => ({
      id: newId(now.getTime()),
      memberId,
      structureId: structure.id,
      effectiveFrom,
      createdAt: now,
    }));
    await this.structures.assign(access.workspaceId, rows, {
      by: access.userId,
      now,
      action: "leave_structure.assigned",
    });
    return rows.map((row) => ({
      ...row,
      memberName: members.get(row.memberId)?.name ?? "—",
      structureName: structure.name,
    }));
  }

  async unassign(access: MemberAccess, id: string): Promise<void> {
    assertCan(access, MENU, "delete");
    await this.structures.unassign(access.workspaceId, id, {
      by: access.userId,
      now: this.clock(),
      action: "leave_structure.unassigned",
    });
  }
}
