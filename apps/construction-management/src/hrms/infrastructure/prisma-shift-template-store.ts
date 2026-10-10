import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  RotationTemplateStore,
  ShiftTemplateStore,
  StoredRotationTemplate,
  StoredShiftTemplate,
} from "../application/shift-template-handlers";
import type { IsoWeekday } from "../domain/calendar";
import {
  slotShiftIds,
  templateInUse,
  type RotationSlot,
  type RotationTemplateDetails,
  type ShiftTemplateDetails,
} from "../domain/shift";
import {
  isUniqueViolation,
  lockKey,
  staleOrMissing,
  type Tx,
} from "./prisma-calendar-support";

type ShiftRow = Prisma.ConstructionHrmsShiftTemplateGetPayload<object>;

const ROTATION_INCLUDE = {
  slots: { orderBy: { position: "asc" } },
} as const;

type RotationRow = Prisma.ConstructionHrmsRotationTemplateGetPayload<{
  include: typeof ROTATION_INCLUDE;
}>;

export function shiftFromRow(
  row: ShiftRow,
): Omit<StoredShiftTemplate, "inUse"> {
  return {
    id: row.id,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    workingDays: [...row.workingDays].sort((a, b) => a - b) as IsoWeekday[],
    workingHours: row.workingHours.toNumber(),
    halfDayHours: row.halfDayHours.toNumber(),
    graceMinutes: row.graceMinutes,
    overtimeAllowed: row.overtimeAllowed,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rotationFromRow(
  row: RotationRow,
): Omit<StoredRotationTemplate, "inUse"> {
  return {
    id: row.id,
    name: row.name,
    type: row.rotationType,
    daysPerCycle: row.daysPerCycle ?? row.slots.length,
    slots: row.slots.map((slot): RotationSlot =>
      slot.isWeekOff || slot.shiftTemplateId == null
        ? { kind: "week_off" }
        : { kind: "shift", shiftTemplateId: slot.shiftTemplateId },
    ),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function shiftColumns(template: ShiftTemplateDetails) {
  return {
    name: template.name,
    startTime: template.startTime,
    endTime: template.endTime,
    workingDays: [...template.workingDays],
    workingHours: template.workingHours.toFixed(2),
    halfDayHours: template.halfDayHours.toFixed(2),
    graceMinutes: template.graceMinutes,
    overtimeAllowed: template.overtimeAllowed,
    isActive: template.isActive,
  };
}

function strip<T extends { createdAt: Date; updatedAt: Date }>(value: T) {
  const { createdAt: _created, updatedAt: _updated, ...rest } = value;
  return rest;
}

function nameTaken(kind: "shift" | "rotation", name: string) {
  return conflict(
    kind === "shift" ? "SHIFT_NAME_TAKEN" : "ROTATION_NAME_TAKEN",
    `A ${kind} is already called “${name}”.`,
    { field: "name" },
  );
}

const SHIFT_MISSING = {
  code: "SHIFT_TEMPLATE_NOT_FOUND",
  message: "This shift was deleted.",
};
const SHIFT_STALE = {
  code: "SHIFT_TEMPLATE_CHANGED",
  message:
    "Someone else changed this shift after you opened it. Reload to see their changes.",
};
const ROTATION_MISSING = {
  code: "ROTATION_TEMPLATE_NOT_FOUND",
  message: "This rotation was deleted.",
};
const ROTATION_STALE = {
  code: "ROTATION_TEMPLATE_CHANGED",
  message:
    "Someone else changed this rotation after you opened it. Reload to see their changes.",
};

/** Serialises "is this shift in use" against rotations naming it. */
function lockShift(tx: Tx, id: string) {
  return lockKey(tx, `hrms-shift:${id}`);
}

async function shiftInUse(
  tx: Pick<
    PrismaClient,
    "constructionHrmsRotationSlot" | "constructionHrmsShiftAssignment"
  >,
  workspaceId: string,
  ids: string[],
) {
  const [slots, assignments] = await Promise.all([
    tx.constructionHrmsRotationSlot.findMany({
      where: {
        shiftTemplateId: { in: ids },
        rotation: { workspaceId, deletedAt: null },
      },
      select: { shiftTemplateId: true },
      distinct: ["shiftTemplateId"],
    }),
    tx.constructionHrmsShiftAssignment.findMany({
      where: { workspaceId, deletedAt: null, shiftTemplateId: { in: ids } },
      select: { shiftTemplateId: true },
      distinct: ["shiftTemplateId"],
    }),
  ]);
  return new Set(
    [...slots, ...assignments].flatMap((row) =>
      row.shiftTemplateId == null ? [] : [row.shiftTemplateId],
    ),
  );
}

/** `construction_hrms.shift_templates` (CM-306). */
export class PrismaShiftTemplateStore implements ShiftTemplateStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<StoredShiftTemplate[]> {
    const rows = await this.db.constructionHrmsShiftTemplate.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const used = await shiftInUse(
      this.db,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      ...shiftFromRow(row),
      inUse: used.has(row.id),
    }));
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredShiftTemplate | null> {
    const row = await this.db.constructionHrmsShiftTemplate.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) return null;
    const used = await shiftInUse(this.db, workspaceId, [id]);
    return { ...shiftFromRow(row), inUse: used.has(id) };
  }

  async create(input: {
    workspaceId: string;
    template: ShiftTemplateDetails;
    by: string;
    now: Date;
  }): Promise<StoredShiftTemplate> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.constructionHrmsShiftTemplate.create({
          data: {
            id: newId(input.now.getTime()),
            workspaceId: input.workspaceId,
            ...shiftColumns(input.template),
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
        });
        const stored = { ...shiftFromRow(row), inUse: false };
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_shift_template.created",
          entityType: "hrms_shift_template",
          entityId: row.id,
          after: strip(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw nameTaken("shift", input.template.name);
      throw error;
    }
  }

  async update(input: {
    workspaceId: string;
    id: string;
    template: ShiftTemplateDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredShiftTemplate> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.constructionHrmsShiftTemplate.findFirst({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
          },
        });
        if (before == null) staleOrMissing(false, SHIFT_MISSING, SHIFT_STALE);
        const { count } = await tx.constructionHrmsShiftTemplate.updateMany({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            ...shiftColumns(input.template),
            updatedAt: input.now,
            updatedBy: input.by,
          },
        });
        if (count !== 1) staleOrMissing(true, SHIFT_MISSING, SHIFT_STALE);
        const row = await tx.constructionHrmsShiftTemplate.findUniqueOrThrow({
          where: { id: input.id },
        });
        const used = await shiftInUse(tx, input.workspaceId, [input.id]);
        const stored = { ...shiftFromRow(row), inUse: used.has(input.id) };
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_shift_template.updated",
          entityType: "hrms_shift_template",
          entityId: input.id,
          before: strip(shiftFromRow(before)),
          after: strip(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw nameTaken("shift", input.template.name);
      throw error;
    }
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockShift(tx, input.id);
      const before = await tx.constructionHrmsShiftTemplate.findFirst({
        where: {
          id: input.id,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
      });
      if (before == null) staleOrMissing(false, SHIFT_MISSING, SHIFT_STALE);
      if ((await shiftInUse(tx, input.workspaceId, [input.id])).size > 0)
        throw templateInUse("shift");
      await tx.constructionHrmsShiftTemplate.updateMany({
        where: { id: input.id, workspaceId: input.workspaceId },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "hrms_shift_template.deleted",
        entityType: "hrms_shift_template",
        entityId: input.id,
        before: strip(shiftFromRow(before)),
        occurredAt: input.now,
      });
    });
  }
}

/** `construction_hrms.rotation_templates` and `rotation_slots` (CM-306). */
export class PrismaRotationTemplateStore implements RotationTemplateStore {
  constructor(private readonly db: PrismaClient) {}

  private async used(
    db: Pick<PrismaClient, "constructionHrmsShiftAssignment">,
    workspaceId: string,
    ids: string[],
  ): Promise<Set<string>> {
    const rows = await db.constructionHrmsShiftAssignment.findMany({
      where: { workspaceId, deletedAt: null, rotationTemplateId: { in: ids } },
      select: { rotationTemplateId: true },
      distinct: ["rotationTemplateId"],
    });
    return new Set(
      rows.flatMap((row) =>
        row.rotationTemplateId == null ? [] : [row.rotationTemplateId],
      ),
    );
  }

  async list(workspaceId: string): Promise<StoredRotationTemplate[]> {
    const rows = await this.db.constructionHrmsRotationTemplate.findMany({
      where: { workspaceId, deletedAt: null },
      include: ROTATION_INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const used = await this.used(
      this.db,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      ...rotationFromRow(row),
      inUse: used.has(row.id),
    }));
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredRotationTemplate | null> {
    const row = await this.db.constructionHrmsRotationTemplate.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: ROTATION_INCLUDE,
    });
    if (row == null) return null;
    const used = await this.used(this.db, workspaceId, [id]);
    return { ...rotationFromRow(row), inUse: used.has(id) };
  }

  /** The slots' shifts are still live, checked under their locks. */
  private async assertShiftsLive(
    tx: Tx,
    workspaceId: string,
    template: RotationTemplateDetails,
  ): Promise<void> {
    const ids = slotShiftIds(template.slots).sort();
    for (const id of ids) await lockShift(tx, id);
    const live = await tx.constructionHrmsShiftTemplate.count({
      where: { workspaceId, deletedAt: null, id: { in: ids } },
    });
    if (live !== ids.length)
      throw new DomainError(
        "ROTATION_SHIFT_NOT_FOUND",
        "A day of the cycle names a shift that was deleted.",
        { details: { field: "slots" } },
      );
  }

  private async writeSlots(
    tx: Tx,
    rotationId: string,
    template: RotationTemplateDetails,
    now: Date,
  ): Promise<void> {
    await tx.constructionHrmsRotationSlot.deleteMany({ where: { rotationId } });
    await tx.constructionHrmsRotationSlot.createMany({
      data: template.slots.map((slot, position) => ({
        id: newId(now.getTime()),
        rotationId,
        position,
        shiftTemplateId: slot.kind === "shift" ? slot.shiftTemplateId : null,
        isWeekOff: slot.kind === "week_off",
      })),
    });
  }

  private columns(template: RotationTemplateDetails) {
    return {
      name: template.name,
      rotationType: template.type,
      daysPerCycle: template.daysPerCycle,
      isActive: template.isActive,
    };
  }

  async create(input: {
    workspaceId: string;
    template: RotationTemplateDetails;
    by: string;
    now: Date;
  }): Promise<StoredRotationTemplate> {
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assertShiftsLive(tx, input.workspaceId, input.template);
        const id = newId(input.now.getTime());
        await tx.constructionHrmsRotationTemplate.create({
          data: {
            id,
            workspaceId: input.workspaceId,
            ...this.columns(input.template),
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
        });
        await this.writeSlots(tx, id, input.template, input.now);
        const row = await tx.constructionHrmsRotationTemplate.findUniqueOrThrow(
          {
            where: { id },
            include: ROTATION_INCLUDE,
          },
        );
        const stored = { ...rotationFromRow(row), inUse: false };
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_rotation_template.created",
          entityType: "hrms_rotation_template",
          entityId: id,
          after: strip(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw nameTaken("rotation", input.template.name);
      throw error;
    }
  }

  async update(input: {
    workspaceId: string;
    id: string;
    template: RotationTemplateDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredRotationTemplate> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.constructionHrmsRotationTemplate.findFirst({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
          },
          include: ROTATION_INCLUDE,
        });
        if (before == null)
          staleOrMissing(false, ROTATION_MISSING, ROTATION_STALE);
        await this.assertShiftsLive(tx, input.workspaceId, input.template);
        const { count } = await tx.constructionHrmsRotationTemplate.updateMany({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            ...this.columns(input.template),
            updatedAt: input.now,
            updatedBy: input.by,
          },
        });
        if (count !== 1) staleOrMissing(true, ROTATION_MISSING, ROTATION_STALE);
        await this.writeSlots(tx, input.id, input.template, input.now);
        const row = await tx.constructionHrmsRotationTemplate.findUniqueOrThrow(
          {
            where: { id: input.id },
            include: ROTATION_INCLUDE,
          },
        );
        const used = await this.used(tx, input.workspaceId, [input.id]);
        const stored = { ...rotationFromRow(row), inUse: used.has(input.id) };
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_rotation_template.updated",
          entityType: "hrms_rotation_template",
          entityId: input.id,
          before: strip(rotationFromRow(before)),
          after: strip(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw nameTaken("rotation", input.template.name);
      throw error;
    }
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockKey(tx, `hrms-rotation:${input.id}`);
      const before = await tx.constructionHrmsRotationTemplate.findFirst({
        where: {
          id: input.id,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        include: ROTATION_INCLUDE,
      });
      if (before == null)
        staleOrMissing(false, ROTATION_MISSING, ROTATION_STALE);
      if ((await this.used(tx, input.workspaceId, [input.id])).size > 0)
        throw templateInUse("rotation");
      await tx.constructionHrmsRotationTemplate.updateMany({
        where: { id: input.id, workspaceId: input.workspaceId },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "hrms_rotation_template.deleted",
        entityType: "hrms_rotation_template",
        entityId: input.id,
        before: strip(rotationFromRow(before)),
        occurredAt: input.now,
      });
    });
  }
}
