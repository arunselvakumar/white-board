import { z } from "zod";

import type {
  LeaveBalanceRow,
  LeaveCreditEntry,
  MemberLeaveBalances,
} from "@/src/hrms/application/leave-balance-handlers";
import { LEAVE_LEDGER_KINDS } from "@/src/hrms/domain/leave-balance";
import { ACCRUAL_MODES } from "@/src/hrms/domain/leave-type";

import { leaveYearQuery } from "../leave-route";

export const LEAVE_BALANCES_PATH = "/api/construction/hrms/leave-balances";

const leaveYear = z
  .string()
  .regex(/^(\d{4}|\d{2}-\d{2})$/)
  .nullable()
  .optional()
  .describe('"2026" or "26-27"; the current leave year when left out.');

export const GetConstructionHrmsLeaveBalancesRequestModel = z.object({
  memberId: z
    .uuid()
    .optional()
    .describe("Another Team Member (needs View All); yourself when left out."),
  leaveYear: leaveYearQuery,
});

export const GetConstructionHrmsTeamLeaveBalancesRequestModel = z.object({
  leaveYear: leaveYearQuery,
});

export const ConstructionHrmsLeaveBalanceRowResponseModel = z.object({
  leaveTypeId: z.uuid(),
  leaveTypeName: z.string(),
  isPaid: z.boolean(),
  accrualMode: z.enum(ACCRUAL_MODES),
  isActive: z.boolean(),
  allowAdvanceUse: z.boolean(),
  entitlement: z
    .number()
    .describe(
      "The year's entitlement: the structure's days or the yearly limit.",
    ),
  initialised: z.boolean(),
  opening: z.number(),
  accrued: z.number(),
  carriedForward: z.number(),
  adjusted: z.number(),
  used: z.number().describe("Days taken on approved requests."),
  pending: z.number().describe("Days held by pending requests."),
  available: z
    .number()
    .describe("The sum of the ledger entries: what can still be applied for."),
  lastAccrualPeriod: z.string().nullable(),
});

export const ConstructionHrmsMemberLeaveBalancesResponseModel = z.object({
  memberId: z.uuid(),
  memberName: z.string(),
  designationName: z.string().nullable(),
  leaveYear: z.string(),
  structureId: z.uuid().nullable(),
  rows: z.array(ConstructionHrmsLeaveBalanceRowResponseModel),
});

export type ConstructionHrmsMemberLeaveBalancesResponseModel = z.infer<
  typeof ConstructionHrmsMemberLeaveBalancesResponseModel
>;

export const GetConstructionHrmsTeamLeaveBalancesResponseModel = z.object({
  leaveYear: z.string(),
  members: z.array(ConstructionHrmsMemberLeaveBalancesResponseModel),
});

export type GetConstructionHrmsTeamLeaveBalancesResponseModel = z.infer<
  typeof GetConstructionHrmsTeamLeaveBalancesResponseModel
>;

export const ListConstructionHrmsLeaveCreditsResponseModel = z.object({
  memberId: z.uuid(),
  leaveYear: z.string(),
  items: z.array(
    z.object({
      id: z.uuid(),
      leaveTypeId: z.uuid(),
      leaveTypeName: z.string(),
      kind: z.enum(LEAVE_LEDGER_KINDS),
      days: z.number(),
      entryDate: z.iso.date(),
      periodKey: z.string().nullable(),
      reason: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

export type ListConstructionHrmsLeaveCreditsResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveCreditsResponseModel
>;

export const InitializeConstructionHrmsLeaveBalancesRequestModel = z.object({
  memberIds: z.array(z.uuid()).max(1000),
  leaveYear,
});

export type InitializeConstructionHrmsLeaveBalancesRequestModel = z.infer<
  typeof InitializeConstructionHrmsLeaveBalancesRequestModel
>;

export const InitializeConstructionHrmsLeaveBalancesByStructureRequestModel =
  z.object({ structureId: z.uuid(), leaveYear });

export type InitializeConstructionHrmsLeaveBalancesByStructureRequestModel =
  z.infer<
    typeof InitializeConstructionHrmsLeaveBalancesByStructureRequestModel
  >;

export const InitializeConstructionHrmsLeaveBalancesResponseModel = z.object({
  leaveYear: z.string(),
  members: z.number().int(),
  initialised: z
    .number()
    .int()
    .describe(
      "Balances (member × leave type) opened by this call; 0 when all were open.",
    ),
  carriedForward: z.number().int(),
});

export type InitializeConstructionHrmsLeaveBalancesResponseModel = z.infer<
  typeof InitializeConstructionHrmsLeaveBalancesResponseModel
>;

export const AccrueConstructionHrmsLeaveBalancesRequestModel = z.object({
  leaveYear,
});

export type AccrueConstructionHrmsLeaveBalancesRequestModel = z.infer<
  typeof AccrueConstructionHrmsLeaveBalancesRequestModel
>;

export const AccrueConstructionHrmsLeaveBalancesResponseModel = z.object({
  leaveYear: z.string(),
  members: z.number().int(),
  credits: z
    .number()
    .int()
    .describe(
      "Monthly credits posted by this call; 0 when every period due was credited.",
    ),
});

export type AccrueConstructionHrmsLeaveBalancesResponseModel = z.infer<
  typeof AccrueConstructionHrmsLeaveBalancesResponseModel
>;

export const RunConstructionHrmsScheduledLeaveAccrualResponseModel = z.object({
  companies: z.number().int(),
  credits: z.number().int(),
});

export type RunConstructionHrmsScheduledLeaveAccrualResponseModel = z.infer<
  typeof RunConstructionHrmsScheduledLeaveAccrualResponseModel
>;

export const AdjustConstructionHrmsLeaveBalanceRequestModel = z.object({
  memberId: z.uuid(),
  leaveTypeId: z.uuid(),
  leaveYear,
  days: z
    .number()
    .describe(
      "Days to credit (Comp Off) or, negative, to take away; two decimals.",
    ),
  reason: z.string().max(2000),
});

export type AdjustConstructionHrmsLeaveBalanceRequestModel = z.infer<
  typeof AdjustConstructionHrmsLeaveBalanceRequestModel
>;

export function toBalanceRow(
  row: LeaveBalanceRow,
): z.infer<typeof ConstructionHrmsLeaveBalanceRowResponseModel> {
  return {
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveTypeName,
    isPaid: row.isPaid,
    accrualMode: row.accrualMode,
    isActive: row.isActive,
    allowAdvanceUse: row.allowAdvanceUse,
    entitlement: row.entitlement,
    initialised: row.initialised,
    opening: row.opening,
    accrued: row.accrued,
    carriedForward: row.carriedForward,
    adjusted: row.adjusted,
    used: row.used,
    pending: row.pending,
    available: row.available,
    lastAccrualPeriod: row.lastAccrualPeriod,
  };
}

export function toMemberBalances(
  balances: MemberLeaveBalances,
): ConstructionHrmsMemberLeaveBalancesResponseModel {
  return {
    memberId: balances.memberId,
    memberName: balances.memberName,
    designationName: balances.designationName,
    leaveYear: balances.leaveYear,
    structureId: balances.structureId,
    rows: balances.rows.map(toBalanceRow),
  };
}

export function toCreditEntry(
  entry: LeaveCreditEntry,
): ListConstructionHrmsLeaveCreditsResponseModel["items"][number] {
  return {
    id: entry.id,
    leaveTypeId: entry.leaveTypeId,
    leaveTypeName: entry.leaveTypeName,
    kind: entry.kind,
    days: entry.days,
    entryDate: entry.entryDate,
    periodKey: entry.periodKey,
    reason: entry.reason,
    createdAt: entry.createdAt.toISOString(),
  };
}
