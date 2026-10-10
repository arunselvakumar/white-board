import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { ShiftBookSource } from "../application/effective-shift-resolver";
import type { HrmsSettingsReader } from "../application/ports";
import type {
  ShiftAssignmentStore,
  StoredAssignment,
} from "../application/shift-assignment-handlers";
import {
  planAssignment,
  type AssignmentSpan,
  type RotationRule,
  type ShiftBook,
  type ShiftRule,
} from "../domain/effective-shift";
import { slotShiftIds } from "../domain/shift";
import { isUniqueViolation, lockKey } from "./prisma-calendar-support";
import { rotationFromRow, shiftFromRow } from "./prisma-shift-template-store";

const ASSIGNMENT_INCLUDE = {
  shiftTemplate: { select: { name: true } },
  rotationTemplate: { select: { name: true } },
} as const;

type AssignmentRow = Prisma.ConstructionHrmsShiftAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

function spanOf(row: {
  id: string;
  shiftTemplateId: string | null;
  rotationTemplateId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): AssignmentSpan {
  return {
    id: row.id,
    shiftTemplateId: row.shiftTemplateId,
    rotationTemplateId: row.rotationTemplateId,
    effectiveFrom: calendarDateFromDb(row.effectiveFrom),
    effectiveTo:
      row.effectiveTo == null ? null : calendarDateFromDb(row.effectiveTo),
  };
}

function toStored(row: AssignmentRow): StoredAssignment {
  return {
    ...spanOf(row),
    memberId: row.memberId,
    templateName:
      row.shiftTemplate?.name ?? row.rotationTemplate?.name ?? "Deleted",
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function audited(stored: StoredAssignment) {
  const { createdAt: _created, createdBy: _by, ...rest } = stored;
  return rest;
}

/** `construction_hrms.shift_assignments` (CM-307). */
export class PrismaShiftAssignmentStore implements ShiftAssignmentStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<StoredAssignment[]> {
    const rows = await this.db.constructionHrmsShiftAssignment.findMany({
      where: { workspaceId, deletedAt: null },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ memberId: "asc" }, { effectiveFrom: "desc" }],
    });
    return rows.map(toStored);
  }

  async assign(input: {
    workspaceId: string;
    memberIds: readonly string[];
    template: { kind: "shift" | "rotation"; id: string };
    effectiveFrom: CalendarDate;
    by: string;
    now: Date;
  }): Promise<StoredAssignment[]> {
    const { workspaceId, template, effectiveFrom, by, now } = input;
    const memberIds = [...new Set(input.memberIds)].sort();
    try {
      return await this.db.$transaction(async (tx) => {
        // The template cannot be deleted while it is being assigned.
        await lockKey(
          tx,
          template.kind === "shift"
            ? `hrms-shift:${template.id}`
            : `hrms-rotation:${template.id}`,
        );
        const live =
          template.kind === "shift"
            ? await tx.constructionHrmsShiftTemplate.count({
                where: { id: template.id, workspaceId, deletedAt: null },
              })
            : await tx.constructionHrmsRotationTemplate.count({
                where: { id: template.id, workspaceId, deletedAt: null },
              });
        if (live === 0)
          throw conflict(
            template.kind === "shift"
              ? "SHIFT_TEMPLATE_NOT_FOUND"
              : "ROTATION_TEMPLATE_NOT_FOUND",
            `That ${template.kind} was deleted. Choose another.`,
          );

        const late: string[] = [];
        const created: StoredAssignment[] = [];
        for (const memberId of memberIds) {
          await lockKey(tx, `hrms-shift-assignment:${workspaceId}:${memberId}`);
          const rows = await tx.constructionHrmsShiftAssignment.findMany({
            where: { workspaceId, memberId, deletedAt: null },
          });
          let plan;
          try {
            plan = planAssignment(rows.map(spanOf), effectiveFrom);
          } catch (error) {
            if (
              error instanceof DomainError &&
              error.code === "SHIFT_ASSIGNMENT_BEFORE_LATEST"
            ) {
              late.push(memberId);
              continue;
            }
            throw error;
          }
          if (plan.replace != null) {
            await tx.constructionHrmsShiftAssignment.update({
              where: { id: plan.replace },
              data: {
                deletedAt: now,
                deletedBy: by,
                updatedAt: now,
                updatedBy: by,
              },
            });
          }
          if (plan.close != null) {
            await tx.constructionHrmsShiftAssignment.update({
              where: { id: plan.close.id },
              data: {
                effectiveTo: calendarDateToDb(plan.close.closeOn),
                updatedAt: now,
                updatedBy: by,
              },
            });
          }
          const row = await tx.constructionHrmsShiftAssignment.create({
            data: {
              id: newId(now.getTime()),
              workspaceId,
              memberId,
              shiftTemplateId: template.kind === "shift" ? template.id : null,
              rotationTemplateId:
                template.kind === "rotation" ? template.id : null,
              effectiveFrom: calendarDateToDb(effectiveFrom),
              effectiveTo: null,
              createdAt: now,
              updatedAt: now,
              createdBy: by,
              updatedBy: by,
            },
            include: ASSIGNMENT_INCLUDE,
          });
          const stored = toStored(row);
          await recordAudit(tx, {
            workspaceId,
            actorUserId: by,
            action: "hrms_shift_assignment.assigned",
            entityType: "hrms_shift_assignment",
            entityId: row.id,
            before: {
              closed: plan.close,
              replaced: plan.replace,
            },
            after: audited(stored),
            occurredAt: now,
          });
          created.push(stored);
        }
        if (late.length > 0)
          throw new DomainError(
            "SHIFT_ASSIGNMENT_BEFORE_LATEST",
            late.length === 1
              ? "A chosen Team Member already has a shift from a later date. Choose that date or a later one."
              : `${String(late.length)} chosen Team Members already have a shift from a later date. Choose a later date.`,
            { details: { field: "effectiveFrom", memberIds: late } },
          );
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict(
          "SHIFT_ASSIGNMENT_CHANGED",
          "Someone else changed these shifts at the same time. Reload and try again.",
        );
      throw error;
    }
  }
}

/**
 * Reads what `resolveShift` needs for members over a date range
 * (CM-307): the Settings, their assignments touching the range, and the
 * shifts and rotations named, inactive or deleted ones included (history
 * keeps its shift).
 */
export class PrismaShiftBookSource implements ShiftBookSource {
  constructor(
    private readonly db: PrismaClient,
    private readonly settings: HrmsSettingsReader,
  ) {}

  async booksFor(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, ShiftBook>> {
    const ids = [...new Set(memberIds)];
    const [settings, rows] = await Promise.all([
      this.settings.settingsFor(workspaceId),
      ids.length === 0
        ? Promise.resolve([])
        : this.db.constructionHrmsShiftAssignment.findMany({
            where: {
              workspaceId,
              memberId: { in: ids },
              deletedAt: null,
              effectiveFrom: { lte: calendarDateToDb(to) },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: calendarDateToDb(from) } },
              ],
            },
          }),
    ]);
    const rotationIds = [
      ...new Set(rows.flatMap((row) => row.rotationTemplateId ?? [])),
    ];
    const rotationRows =
      rotationIds.length === 0
        ? []
        : await this.db.constructionHrmsRotationTemplate.findMany({
            where: { workspaceId, id: { in: rotationIds } },
            include: { slots: { orderBy: { position: "asc" } } },
          });
    const rotations = new Map<string, RotationRule>(
      rotationRows.map((row) => {
        const rotation = rotationFromRow(row);
        return [
          row.id,
          {
            id: row.id,
            name: rotation.name,
            type: rotation.type,
            slots: rotation.slots,
          },
        ];
      }),
    );
    const shiftIds = [
      ...new Set([
        ...rows.flatMap((row) => row.shiftTemplateId ?? []),
        ...[...rotations.values()].flatMap((rotation) =>
          slotShiftIds(rotation.slots),
        ),
      ]),
    ];
    const shiftRows =
      shiftIds.length === 0
        ? []
        : await this.db.constructionHrmsShiftTemplate.findMany({
            where: { workspaceId, id: { in: shiftIds } },
          });
    const shifts = new Map<string, ShiftRule>(
      shiftRows.map((row) => {
        const shift = shiftFromRow(row);
        return [
          row.id,
          {
            id: row.id,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            workingDays: shift.workingDays,
            workingHours: shift.workingHours,
            halfDayHours: shift.halfDayHours,
            graceMinutes: shift.graceMinutes,
            overtimeAllowed: shift.overtimeAllowed,
          },
        ];
      }),
    );
    const byMember = new Map<string, AssignmentSpan[]>(
      ids.map((id) => [id, []]),
    );
    for (const row of rows) byMember.get(row.memberId)?.push(spanOf(row));
    return new Map(
      ids.map((id) => [
        id,
        { settings, assignments: byMember.get(id) ?? [], shifts, rotations },
      ]),
    );
  }
}
