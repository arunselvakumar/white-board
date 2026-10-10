import { z } from "zod";

import {
  LEAVE_APPROVAL_TABS,
  type LeavePreview,
  type LeaveRequestReadModel,
} from "@/src/hrms/application/leave-request-handlers";
import {
  LEAVE_REQUEST_STATUSES,
  LEAVE_SESSIONS,
} from "@/src/hrms/domain/leave-request";

import { ConstructionHrmsLeaveBalanceRowResponseModel } from "../leave-balances/leave-balance-models";

export const LEAVES_PATH = "/api/construction/hrms/leaves";

const dayBreakdown = z
  .array(z.object({ date: z.iso.date(), session: z.enum(LEAVE_SESSIONS) }))
  .max(400)
  .optional()
  .describe(
    "Dates taken as a Morning or an Afternoon; every other working day in the range is a Full day. Holidays and week offs are skipped.",
  );

const applyFields = {
  memberId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Apply for another Team Member (needs View All and Add); yourself when left out.",
    ),
  leaveTypeId: z.uuid(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  days: dayBreakdown,
};

export const PreviewConstructionHrmsLeaveRequestModel = z.object(applyFields);

export type PreviewConstructionHrmsLeaveRequestModel = z.infer<
  typeof PreviewConstructionHrmsLeaveRequestModel
>;

export const ApplyConstructionHrmsLeaveRequestModel = z.object({
  ...applyFields,
  reason: z.string().max(5000).describe("At least 10 characters."),
});

export type ApplyConstructionHrmsLeaveRequestModel = z.infer<
  typeof ApplyConstructionHrmsLeaveRequestModel
>;

export const ListConstructionHrmsMyLeavesRequestModel = z.object({
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const ListConstructionHrmsLeaveApprovalsRequestModel = z.object({
  tab: z.enum(LEAVE_APPROVAL_TABS).default("pending"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const ListConstructionHrmsTeamLeavesRequestModel = z.object({
  from: z.iso.date(),
  to: z.iso.date().describe("At most 93 days after `from`."),
});

export const WithdrawConstructionHrmsLeaveRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const RequestConstructionHrmsLeaveCancellationRequestModel = z.object({
  reason: z
    .string()
    .max(5000)
    .describe("Required: why the leave is cancelled."),
  expectedUpdatedAt: z.iso.datetime(),
});

export type RequestConstructionHrmsLeaveCancellationRequestModel = z.infer<
  typeof RequestConstructionHrmsLeaveCancellationRequestModel
>;

export const ApproveConstructionHrmsLeaveRequestModel = z.object({
  remarks: z.string().max(5000).nullable().optional(),
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; a mismatch is 409 LEAVE_REQUEST_CHANGED.",
    ),
});

export type ApproveConstructionHrmsLeaveRequestModel = z.infer<
  typeof ApproveConstructionHrmsLeaveRequestModel
>;

export const RejectConstructionHrmsLeaveRequestModel = z.object({
  reason: z.string().max(5000).describe("Required: the rejection reason."),
  expectedUpdatedAt: z.iso.datetime(),
});

export type RejectConstructionHrmsLeaveRequestModel = z.infer<
  typeof RejectConstructionHrmsLeaveRequestModel
>;

const leaveDay = z.object({
  date: z.iso.date(),
  session: z.enum(LEAVE_SESSIONS),
});

export const ConstructionHrmsLeaveRequestResponseModel = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  memberName: z.string(),
  leaveTypeId: z.uuid(),
  leaveTypeName: z.string(),
  isPaid: z.boolean(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  totalDays: z.number(),
  leaveYear: z.string(),
  reason: z.string(),
  status: z.enum(LEAVE_REQUEST_STATUSES),
  approvalLevels: z.number().int(),
  currentLevel: z.number().int(),
  approvalRemarks: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  appliedByMemberId: z.uuid(),
  appliedByName: z.string().nullable(),
  days: z.array(leaveDay),
  decisions: z.array(
    z.object({
      stage: z.enum(["request", "cancellation"]),
      level: z.number().int(),
      outcome: z.enum(["approved", "rejected"]),
      remarks: z.string().nullable(),
      deciderMemberId: z.uuid().nullable(),
      deciderName: z.string().nullable(),
      decidedAt: z.iso.datetime(),
    }),
  ),
  canWithdraw: z.boolean(),
  canRequestCancellation: z.boolean(),
  canDecide: z
    .boolean()
    .describe(
      "You may approve or reject it now (never your own, unless Owner).",
    ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsLeaveRequestResponseModel = z.infer<
  typeof ConstructionHrmsLeaveRequestResponseModel
>;

export const ListConstructionHrmsLeaveRequestsResponseModel = z.object({
  items: z.array(ConstructionHrmsLeaveRequestResponseModel),
  total: z.number().int(),
});

export type ListConstructionHrmsLeaveRequestsResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveRequestsResponseModel
>;

export const ListConstructionHrmsLeaveApprovalsResponseModel =
  ListConstructionHrmsLeaveRequestsResponseModel.extend({
    counts: z.object(
      Object.fromEntries(
        LEAVE_APPROVAL_TABS.map((tab) => [tab, z.number().int()]),
      ) as Record<(typeof LEAVE_APPROVAL_TABS)[number], z.ZodNumber>,
    ),
  });

export type ListConstructionHrmsLeaveApprovalsResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveApprovalsResponseModel
>;

export const PreviewConstructionHrmsLeaveResponseModel = z.object({
  memberId: z.uuid(),
  leaveYear: z.string(),
  days: z.array(leaveDay),
  skipped: z.array(
    z.object({ date: z.iso.date(), kind: z.enum(["week_off", "holiday"]) }),
  ),
  total: z.number(),
  balance: ConstructionHrmsLeaveBalanceRowResponseModel.pick({
    entitlement: true,
    initialised: true,
    opening: true,
    accrued: true,
    carriedForward: true,
    adjusted: true,
    used: true,
    pending: true,
    available: true,
    lastAccrualPeriod: true,
  })
    .nullable()
    .describe("Null for unpaid leave, which needs no balance."),
  problem: z
    .object({ code: z.string(), message: z.string() })
    .nullable()
    .describe(
      "Why applying would be refused (balance, overlap); null when it fits.",
    ),
});

export type PreviewConstructionHrmsLeaveResponseModel = z.infer<
  typeof PreviewConstructionHrmsLeaveResponseModel
>;

export const GetConstructionHrmsLeaveOptionsResponseModel = z.object({
  me: z.object({ memberId: z.uuid(), name: z.string() }).nullable(),
  canApply: z.boolean(),
  canApplyForOthers: z.boolean(),
  members: z.array(
    z.object({
      memberId: z.uuid(),
      name: z.string(),
      designationName: z.string().nullable(),
    }),
  ),
  leaveTypes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      isPaid: z.boolean(),
      requiresApproval: z.boolean(),
      maxConsecutiveDays: z.number().int().nullable(),
      allowAdvanceUse: z.boolean(),
    }),
  ),
});

export type GetConstructionHrmsLeaveOptionsResponseModel = z.infer<
  typeof GetConstructionHrmsLeaveOptionsResponseModel
>;

export const GetConstructionHrmsTeamLeaveReportResponseModel = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  rows: z.array(
    z.object({
      memberId: z.uuid(),
      memberName: z.string(),
      byType: z.array(
        z.object({
          leaveTypeId: z.uuid(),
          leaveTypeName: z.string(),
          days: z.number(),
        }),
      ),
      paidDays: z.number(),
      unpaidDays: z.number(),
      pendingDays: z.number(),
    }),
  ),
});

export type GetConstructionHrmsTeamLeaveReportResponseModel = z.infer<
  typeof GetConstructionHrmsTeamLeaveReportResponseModel
>;

export function toLeaveRequestResponse(
  request: LeaveRequestReadModel,
): ConstructionHrmsLeaveRequestResponseModel {
  return {
    id: request.id,
    memberId: request.memberId,
    memberName: request.memberName,
    leaveTypeId: request.leaveTypeId,
    leaveTypeName: request.leaveTypeName,
    isPaid: request.isPaid,
    fromDate: request.fromDate,
    toDate: request.toDate,
    totalDays: request.totalDays,
    leaveYear: request.leaveYear,
    reason: request.reason,
    status: request.status,
    approvalLevels: request.approvalLevels,
    currentLevel: request.currentLevel,
    approvalRemarks: request.approvalRemarks,
    rejectionReason: request.rejectionReason,
    cancellationReason: request.cancellationReason,
    appliedByMemberId: request.appliedByMemberId,
    appliedByName: request.appliedByName,
    days: request.days.map((day) => ({ date: day.date, session: day.session })),
    decisions: request.decisions.map((decision) => ({
      stage: decision.stage,
      level: decision.level,
      outcome: decision.outcome,
      remarks: decision.remarks,
      deciderMemberId: decision.deciderMemberId,
      deciderName: decision.deciderName,
      decidedAt: decision.decidedAt.toISOString(),
    })),
    canWithdraw: request.canWithdraw,
    canRequestCancellation: request.canRequestCancellation,
    canDecide: request.canDecide,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function toLeavePreviewResponse(
  preview: LeavePreview,
): PreviewConstructionHrmsLeaveResponseModel {
  return {
    memberId: preview.memberId,
    leaveYear: preview.leaveYear,
    days: preview.days.map((day) => ({ date: day.date, session: day.session })),
    skipped: preview.skipped.map((day) => ({ date: day.date, kind: day.kind })),
    total: preview.total,
    balance:
      preview.balance == null
        ? null
        : {
            entitlement: preview.balance.entitlement,
            initialised: preview.balance.initialised,
            opening: preview.balance.opening,
            accrued: preview.balance.accrued,
            carriedForward: preview.balance.carriedForward,
            adjusted: preview.balance.adjusted,
            used: preview.balance.used,
            pending: preview.balance.pending,
            available: preview.balance.available,
            lastAccrualPeriod: preview.balance.lastAccrualPeriod,
          },
    problem: preview.problem,
  };
}
