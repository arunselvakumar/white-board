import { z } from "zod";

import type { LeaveTypeReadModel } from "@/src/hrms/application/leave-configuration-handlers";
import { ACCRUAL_MODES } from "@/src/hrms/domain/leave-type";

export const LEAVE_TYPES_PATH = "/api/construction/hrms/leave-types";

/**
 * Leave type fields (CM-310). Shapes only: the hrms domain checks every
 * rule and names the field at fault (`details.field`).
 */
const leaveTypeFields = {
  name: z.string().max(200),
  yearlyLimit: z
    .number()
    .describe(
      "Days a year, 0–366, up to two decimals; 0 for Comp Off and Loss of Pay.",
    ),
  isPaid: z.boolean(),
  requiresApproval: z.boolean(),
  approvalLevels: z
    .number()
    .nullable()
    .optional()
    .describe(
      "1 or 2; null uses the HRMS Settings' levels. Ignored without approval.",
    ),
  maxConsecutiveDays: z
    .number()
    .nullable()
    .optional()
    .describe("The most leave days in one request; null for no cap."),
  carryForward: z.boolean(),
  maxCarryForward: z
    .number()
    .nullable()
    .optional()
    .describe("Days; required when carrying forward."),
  accrualMode: z
    .enum(ACCRUAL_MODES)
    .describe(
      "`none` (adjustments only), `upfront` (whole entitlement on initialise) or `periodic` (monthly credit) — ADR CM-0012 §7.",
    ),
  accrualFrequency: z.enum(["monthly"]).nullable().optional(),
  accrualDay: z
    .number()
    .nullable()
    .optional()
    .describe("Day of the month the credit is posted, 1–28; periodic only."),
  creditPerPeriod: z
    .number()
    .nullable()
    .optional()
    .describe("Days credited each month, e.g. 1.25; periodic only."),
  allowAdvanceUse: z
    .boolean()
    .describe("May be taken before it is credited, up to the yearly limit."),
};

export const CreateConstructionHrmsLeaveTypeRequestModel =
  z.object(leaveTypeFields);

export type CreateConstructionHrmsLeaveTypeRequestModel = z.input<
  typeof CreateConstructionHrmsLeaveTypeRequestModel
>;

export const UpdateConstructionHrmsLeaveTypeRequestModel = z.object({
  ...leaveTypeFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; a mismatch is 409 LEAVE_TYPE_CHANGED.",
    ),
});

export type UpdateConstructionHrmsLeaveTypeRequestModel = z.input<
  typeof UpdateConstructionHrmsLeaveTypeRequestModel
>;

export const ConstructionHrmsLeaveTypeResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  yearlyLimit: z.number(),
  isPaid: z.boolean(),
  requiresApproval: z.boolean(),
  approvalLevels: z.number().int().nullable(),
  maxConsecutiveDays: z.number().int().nullable(),
  carryForward: z.boolean(),
  maxCarryForward: z.number().nullable(),
  accrualMode: z.enum(ACCRUAL_MODES),
  accrualFrequency: z.enum(["monthly"]).nullable(),
  accrualDay: z.number().int().nullable(),
  creditPerPeriod: z.number().nullable(),
  allowAdvanceUse: z.boolean(),
  isActive: z.boolean(),
  isSeed: z
    .boolean()
    .describe("One of the six types every Company starts with."),
  inUse: z
    .boolean()
    .describe(
      "A structure, a balance or a request uses it: it can be deactivated, not deleted.",
    ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsLeaveTypeResponseModel = z.infer<
  typeof ConstructionHrmsLeaveTypeResponseModel
>;

export const ListConstructionHrmsLeaveTypesResponseModel = z.object({
  items: z.array(ConstructionHrmsLeaveTypeResponseModel),
});

export type ListConstructionHrmsLeaveTypesResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveTypesResponseModel
>;

export const GetConstructionHrmsLeaveAccrualOptionsResponseModel = z.object({
  modes: z.array(
    z.object({
      value: z.enum(ACCRUAL_MODES),
      label: z.string(),
      hint: z.string(),
    }),
  ),
  frequencies: z.array(
    z.object({ value: z.enum(["monthly"]), label: z.string() }),
  ),
  maxAccrualDay: z.number().int(),
  maxDays: z.number().int(),
});

export type GetConstructionHrmsLeaveAccrualOptionsResponseModel = z.infer<
  typeof GetConstructionHrmsLeaveAccrualOptionsResponseModel
>;

export function toLeaveTypeResponse(
  type: LeaveTypeReadModel,
): ConstructionHrmsLeaveTypeResponseModel {
  return {
    id: type.id,
    name: type.name,
    yearlyLimit: type.yearlyLimit,
    isPaid: type.isPaid,
    requiresApproval: type.requiresApproval,
    approvalLevels: type.approvalLevels,
    maxConsecutiveDays: type.maxConsecutiveDays,
    carryForward: type.carryForward,
    maxCarryForward: type.maxCarryForward,
    accrualMode: type.accrualMode,
    accrualFrequency: type.accrualFrequency,
    accrualDay: type.accrualDay,
    creditPerPeriod: type.creditPerPeriod,
    allowAdvanceUse: type.allowAdvanceUse,
    isActive: type.isActive,
    isSeed: type.isSeed,
    inUse: type.inUse,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  };
}
