import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  AccrueConstructionHrmsLeaveBalancesResponseModel,
  AdjustConstructionHrmsLeaveBalanceRequestModel,
  ConstructionHrmsMemberLeaveBalancesResponseModel,
  GetConstructionHrmsTeamLeaveBalancesResponseModel,
  InitializeConstructionHrmsLeaveBalancesResponseModel,
  ListConstructionHrmsLeaveCreditsResponseModel,
} from "@/app/api/construction/hrms/leave-balances/leave-balance-models";
import type {
  ConstructionHrmsLeaveAssignmentResponseModel,
  ConstructionHrmsLeaveStructureResponseModel,
  CreateConstructionHrmsLeaveStructureRequestModel,
  ListConstructionHrmsLeaveAssignmentsResponseModel,
  ListConstructionHrmsLeaveStructuresResponseModel,
} from "@/app/api/construction/hrms/leave-structures/leave-structure-models";
import type {
  ConstructionHrmsLeaveTypeResponseModel,
  CreateConstructionHrmsLeaveTypeRequestModel,
  ListConstructionHrmsLeaveTypesResponseModel,
} from "@/app/api/construction/hrms/leave-types/leave-type-models";
import type {
  ApplyConstructionHrmsLeaveRequestModel,
  ConstructionHrmsLeaveRequestResponseModel,
  GetConstructionHrmsLeaveOptionsResponseModel,
  GetConstructionHrmsTeamLeaveReportResponseModel,
  ListConstructionHrmsLeaveApprovalsResponseModel,
  ListConstructionHrmsLeaveRequestsResponseModel,
  PreviewConstructionHrmsLeaveRequestModel,
  PreviewConstructionHrmsLeaveResponseModel,
} from "@/app/api/construction/hrms/leaves/leave-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

/**
 * Leave reads and writes (CM-310 … CM-313). Every key is under
 * `[...HRMS_KEY, "leave"]`, so one invalidation after a write refreshes
 * balances, lists and approvals together.
 */
export const LEAVE_KEY = [...HRMS_KEY, "leave"] as const;

const BASE = "/api/construction/hrms";

export type LeaveTypeModel = ConstructionHrmsLeaveTypeResponseModel;
export type LeaveTypeInput = CreateConstructionHrmsLeaveTypeRequestModel;
export type LeaveStructureModel = ConstructionHrmsLeaveStructureResponseModel;
export type LeaveStructureInput =
  CreateConstructionHrmsLeaveStructureRequestModel;
export type LeaveAssignmentModel = ConstructionHrmsLeaveAssignmentResponseModel;
export type MemberLeaveBalances =
  ConstructionHrmsMemberLeaveBalancesResponseModel;
export type LeaveBalanceRowModel = MemberLeaveBalances["rows"][number];
export type TeamLeaveBalances =
  GetConstructionHrmsTeamLeaveBalancesResponseModel;
export type LeaveCredits = ListConstructionHrmsLeaveCreditsResponseModel;
export type LeaveOptions = GetConstructionHrmsLeaveOptionsResponseModel;
export type LeaveRequestModel = ConstructionHrmsLeaveRequestResponseModel;
export type LeaveRequestList = ListConstructionHrmsLeaveRequestsResponseModel;
export type LeaveApprovalList = ListConstructionHrmsLeaveApprovalsResponseModel;
export type LeaveApprovalTab =
  "pending" | "approved" | "rejected" | "cancel_requests";
export type LeavePreview = PreviewConstructionHrmsLeaveResponseModel;
export type LeavePreviewInput = PreviewConstructionHrmsLeaveRequestModel;
export type LeaveApplyInput = ApplyConstructionHrmsLeaveRequestModel;
export type TeamLeaveReport = GetConstructionHrmsTeamLeaveReportResponseModel;

function postJson<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value != null && value !== "") search.set(key, value);
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

// Reads ---------------------------------------------------------------------

/** Your leave permissions, active leave types and the members you may act for. */
export const leaveOptionsQuery = queryOptions({
  queryKey: [...LEAVE_KEY, "options"],
  queryFn: () => apiJson<LeaveOptions>(`${BASE}/leaves/options`),
});

export const leaveTypesQuery = queryOptions({
  queryKey: [...LEAVE_KEY, "types"],
  queryFn: () =>
    apiJson<ListConstructionHrmsLeaveTypesResponseModel>(`${BASE}/leave-types`),
});

export const leaveStructuresQuery = queryOptions({
  queryKey: [...LEAVE_KEY, "structures"],
  queryFn: () =>
    apiJson<ListConstructionHrmsLeaveStructuresResponseModel>(
      `${BASE}/leave-structures`,
    ),
});

export const leaveAssignmentsQuery = queryOptions({
  queryKey: [...LEAVE_KEY, "assignments"],
  queryFn: () =>
    apiJson<ListConstructionHrmsLeaveAssignmentsResponseModel>(
      `${BASE}/leave-structures/assignments`,
    ),
});

/** A member's balances; yourself when `memberId` is left out. */
export function leaveBalancesQuery(memberId?: string, leaveYear?: string) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "balances", memberId ?? "me", leaveYear ?? ""],
    queryFn: () =>
      apiJson<MemberLeaveBalances>(
        `${BASE}/leave-balances${query({ memberId, leaveYear })}`,
      ),
  });
}

export function teamLeaveBalancesQuery(leaveYear?: string) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "balances", "team", leaveYear ?? ""],
    queryFn: () =>
      apiJson<TeamLeaveBalances>(
        `${BASE}/leave-balances/team${query({ leaveYear })}`,
      ),
  });
}

export function leaveCreditsQuery(memberId?: string, leaveYear?: string) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "credits", memberId ?? "me", leaveYear ?? ""],
    queryFn: () =>
      apiJson<LeaveCredits>(
        `${BASE}/leave-balances/accruals${query({ memberId, leaveYear })}`,
      ),
  });
}

export const myLeavesQuery = queryOptions({
  queryKey: [...LEAVE_KEY, "requests", "mine"],
  queryFn: () => apiJson<LeaveRequestList>(`${BASE}/leaves`),
});

export function leaveApprovalsQuery(tab: LeaveApprovalTab) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "requests", "approvals", tab],
    queryFn: () =>
      apiJson<LeaveApprovalList>(`${BASE}/leaves/approvals${query({ tab })}`),
  });
}

export function teamLeavesQuery(from: string, to: string) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "requests", "team", from, to],
    queryFn: () =>
      apiJson<LeaveRequestList>(`${BASE}/leaves/team${query({ from, to })}`),
  });
}

export function teamLeaveReportQuery(from: string, to: string) {
  return queryOptions({
    queryKey: [...LEAVE_KEY, "report", from, to],
    queryFn: () =>
      apiJson<TeamLeaveReport>(
        `${BASE}/leaves/report/team${query({ from, to })}`,
      ),
  });
}

/** The live day breakdown and balance for Apply Leave; writes nothing. */
export function previewLeave(input: LeavePreviewInput): Promise<LeavePreview> {
  return postJson(`/leaves/preview`, input);
}

// Writes --------------------------------------------------------------------

export type LeaveCommand =
  | { kind: "create-type"; input: LeaveTypeInput }
  | {
      kind: "update-type";
      id: string;
      input: LeaveTypeInput;
      expectedUpdatedAt: string;
    }
  | {
      kind: "activate-type" | "deactivate-type" | "delete-type";
      id: string;
      expectedUpdatedAt: string;
    }
  | { kind: "create-structure"; input: LeaveStructureInput }
  | {
      kind: "update-structure";
      id: string;
      input: LeaveStructureInput;
      expectedUpdatedAt: string;
    }
  | { kind: "delete-structure"; id: string; expectedUpdatedAt: string }
  | {
      kind: "assign";
      structureId: string;
      memberIds: string[];
      effectiveFrom: string;
    }
  | { kind: "unassign"; id: string }
  | { kind: "initialise"; memberIds: string[]; leaveYear?: string }
  | { kind: "initialise-structure"; structureId: string; leaveYear?: string }
  | { kind: "accrue"; leaveYear?: string }
  | { kind: "adjust"; input: AdjustConstructionHrmsLeaveBalanceRequestModel }
  | { kind: "apply"; input: LeaveApplyInput }
  | {
      kind: "withdraw" | "approve" | "approve-cancellation";
      id: string;
      expectedUpdatedAt: string;
      remarks?: string | null;
    }
  | {
      kind: "reject" | "reject-cancellation" | "request-cancellation";
      id: string;
      expectedUpdatedAt: string;
      reason: string;
    };

export type LeaveCommandResult =
  | LeaveTypeModel
  | LeaveStructureModel
  | LeaveRequestModel
  | InitializeConstructionHrmsLeaveBalancesResponseModel
  | AccrueConstructionHrmsLeaveBalancesResponseModel
  | ListConstructionHrmsLeaveAssignmentsResponseModel
  | LeaveBalanceRowModel
  | undefined;

function item(path: string, id: string, verb: string): string {
  return `${path}/${encodeURIComponent(id)}/${verb}`;
}

export function runLeaveCommand(
  command: LeaveCommand,
): Promise<LeaveCommandResult> {
  switch (command.kind) {
    case "create-type":
      return postJson("/leave-types", command.input);
    case "update-type":
      return postJson(item("/leave-types", command.id, "update"), {
        ...command.input,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "activate-type":
    case "deactivate-type":
    case "delete-type":
      return postJson(
        item("/leave-types", command.id, command.kind.replace("-type", "")),
        { expectedUpdatedAt: command.expectedUpdatedAt },
      );
    case "create-structure":
      return postJson("/leave-structures", command.input);
    case "update-structure":
      return postJson(item("/leave-structures", command.id, "update"), {
        ...command.input,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "delete-structure":
      return postJson(item("/leave-structures", command.id, "delete"), {
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "assign":
      return postJson("/leave-structures/assignments", {
        structureId: command.structureId,
        memberIds: command.memberIds,
        effectiveFrom: command.effectiveFrom,
      });
    case "unassign":
      return postJson(
        item("/leave-structures/assignments", command.id, "delete"),
      );
    case "initialise":
      return postJson("/leave-balances/initialize", {
        memberIds: command.memberIds,
        leaveYear: command.leaveYear,
      });
    case "initialise-structure":
      return postJson("/leave-balances/initialize-by-structure", {
        structureId: command.structureId,
        leaveYear: command.leaveYear,
      });
    case "accrue":
      return postJson("/leave-balances/accrue", {
        leaveYear: command.leaveYear,
      });
    case "adjust":
      return postJson("/leave-balances/adjust", command.input);
    case "apply":
      return postJson("/leaves", command.input);
    case "withdraw":
      return postJson(item("/leaves", command.id, "withdraw"), {
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "approve":
    case "approve-cancellation":
      return postJson(item("/leaves", command.id, command.kind), {
        remarks: command.remarks ?? null,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "reject":
    case "reject-cancellation":
    case "request-cancellation":
      return postJson(item("/leaves", command.id, command.kind), {
        reason: command.reason,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
  }
}

/** Any leave write; every leave read is refreshed after it settles. */
export function useLeaveCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runLeaveCommand,
    onSettled: () => queryClient.invalidateQueries({ queryKey: LEAVE_KEY }),
  });
}
