import { z } from "zod";

import type {
  StoredRotationTemplate,
  StoredShiftTemplate,
} from "@/src/hrms/application/shift-template-handlers";
import {
  CUSTOM_CYCLE_LIMITS,
  ROTATION_TYPES,
  SHIFT_LIMITS,
} from "@/src/hrms/domain/shift";

export const SHIFT_TEMPLATES_PATH = "/api/construction/hrms/shift-templates";
export const ROTATION_TEMPLATES_PATH =
  "/api/construction/hrms/rotation-templates";

export const HrmsTemplateIdParamsModel = z.object({ id: z.uuid() });

const expectedUpdatedAt = z.iso
  .datetime()
  .describe("The `updatedAt` you loaded; a mismatch is 409.");

const shiftFields = {
  name: z.string().describe("Shift Name, ≤ 60 characters; unique."),
  startTime: z.string().describe("HH:MM, 24-hour, Company time."),
  endTime: z
    .string()
    .describe("HH:MM; at or before the start crosses midnight."),
  workingDays: z
    .array(z.number())
    .max(7)
    .describe("ISO weekdays, 1 = Monday … 7 = Sunday."),
  workingHours: z
    .number()
    .describe("More than 0, at most the shift's length, two decimals."),
  halfDayHours: z.number().describe("More than 0 and below the working hours."),
  graceMinutes: z
    .number()
    .describe(
      `0–${String(SHIFT_LIMITS.maxGraceMinutes)}; replaces the Settings grace.`,
    ),
  overtimeAllowed: z
    .boolean()
    .describe("Overtime is paid only on such a shift (ADR CM-0012 §14)."),
  isActive: z.boolean().describe("Inactive shifts are not offered."),
};

export const CreateConstructionHrmsShiftTemplateRequestModel =
  z.object(shiftFields);

export type CreateConstructionHrmsShiftTemplateRequestModel = z.input<
  typeof CreateConstructionHrmsShiftTemplateRequestModel
>;

export const UpdateConstructionHrmsShiftTemplateRequestModel = z.object({
  ...shiftFields,
  expectedUpdatedAt,
});

export type UpdateConstructionHrmsShiftTemplateRequestModel = z.input<
  typeof UpdateConstructionHrmsShiftTemplateRequestModel
>;

export const ConstructionHrmsShiftTemplateResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workingDays: z.array(z.int()),
  workingHours: z.number(),
  halfDayHours: z.number(),
  graceMinutes: z.int(),
  overtimeAllowed: z.boolean(),
  isActive: z.boolean(),
  /** Named by a rotation or an assignment: deactivate instead of deleting. */
  inUse: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsShiftTemplateResponseModel = z.infer<
  typeof ConstructionHrmsShiftTemplateResponseModel
>;

export const ListConstructionHrmsShiftTemplatesResponseModel = z.object({
  items: z.array(ConstructionHrmsShiftTemplateResponseModel),
});

export type ListConstructionHrmsShiftTemplatesResponseModel = z.infer<
  typeof ListConstructionHrmsShiftTemplatesResponseModel
>;

const rotationFields = {
  name: z.string().describe("Rotation Name, ≤ 60 characters; unique."),
  type: z
    .enum(ROTATION_TYPES)
    .describe(
      "`week` (7 slots, Monday first), `month` (31 slots, day 1 first) or `custom_cycle`.",
    ),
  daysPerCycle: z
    .number()
    .nullable()
    .optional()
    .describe(
      `Custom Cycle only: ${String(CUSTOM_CYCLE_LIMITS.minDays)}–${String(CUSTOM_CYCLE_LIMITS.maxDays)} days.`,
    ),
  slots: z
    .array(z.uuid().nullable())
    .max(31)
    .describe(
      "One per day of the cycle, in order: an active shift template id, or null for a Week Off.",
    ),
  isActive: z.boolean(),
};

export const CreateConstructionHrmsRotationTemplateRequestModel =
  z.object(rotationFields);

export type CreateConstructionHrmsRotationTemplateRequestModel = z.input<
  typeof CreateConstructionHrmsRotationTemplateRequestModel
>;

export const UpdateConstructionHrmsRotationTemplateRequestModel = z.object({
  ...rotationFields,
  expectedUpdatedAt,
});

export type UpdateConstructionHrmsRotationTemplateRequestModel = z.input<
  typeof UpdateConstructionHrmsRotationTemplateRequestModel
>;

export const ConstructionHrmsRotationTemplateResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(ROTATION_TYPES),
  daysPerCycle: z.int(),
  /** A shift template id, or null for a Week Off. */
  slots: z.array(z.uuid().nullable()),
  isActive: z.boolean(),
  /** Assigned to a member: deactivate instead of deleting. */
  inUse: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsRotationTemplateResponseModel = z.infer<
  typeof ConstructionHrmsRotationTemplateResponseModel
>;

export const ListConstructionHrmsRotationTemplatesResponseModel = z.object({
  items: z.array(ConstructionHrmsRotationTemplateResponseModel),
});

export type ListConstructionHrmsRotationTemplatesResponseModel = z.infer<
  typeof ListConstructionHrmsRotationTemplatesResponseModel
>;

export function toShiftResponse(
  shift: StoredShiftTemplate,
): ConstructionHrmsShiftTemplateResponseModel {
  return {
    id: shift.id,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    workingDays: [...shift.workingDays],
    workingHours: shift.workingHours,
    halfDayHours: shift.halfDayHours,
    graceMinutes: shift.graceMinutes,
    overtimeAllowed: shift.overtimeAllowed,
    isActive: shift.isActive,
    inUse: shift.inUse,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
  };
}

export function toRotationResponse(
  rotation: StoredRotationTemplate,
): ConstructionHrmsRotationTemplateResponseModel {
  return {
    id: rotation.id,
    name: rotation.name,
    type: rotation.type,
    daysPerCycle: rotation.daysPerCycle,
    slots: rotation.slots.map((slot) =>
      slot.kind === "shift" ? slot.shiftTemplateId : null,
    ),
    isActive: rotation.isActive,
    inUse: rotation.inUse,
    createdAt: rotation.createdAt.toISOString(),
    updatedAt: rotation.updatedAt.toISOString(),
  };
}
