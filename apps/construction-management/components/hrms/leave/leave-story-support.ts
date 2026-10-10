import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  LeaveApprovalTab,
  LeaveAssignmentModel,
  LeaveCredits,
  LeaveOptions,
  LeavePreview,
  LeaveRequestModel,
  LeaveStructureModel,
  LeaveTypeModel,
  MemberLeaveBalances,
  TeamLeaveBalances,
  TeamLeaveReport,
} from "@/src/queries/hrms-leave";

/** Fixtures and a mock leave API for the leave stories (CM-310 … CM-313). */

const AT = "2026-10-10T06:00:00.000Z";

export const ME = "0199c6a0-0000-7000-8000-000000000001";
export const PRIYA = "0199c6a0-0000-7000-8000-000000000002";
export const RAVI = "0199c6a0-0000-7000-8000-000000000003";

function type(
  id: string,
  name: string,
  overrides: Partial<LeaveTypeModel> = {},
): LeaveTypeModel {
  return {
    id,
    name,
    yearlyLimit: 0,
    isPaid: true,
    requiresApproval: true,
    approvalLevels: null,
    maxConsecutiveDays: null,
    carryForward: false,
    maxCarryForward: null,
    accrualMode: "none",
    accrualFrequency: null,
    accrualDay: null,
    creditPerPeriod: null,
    allowAdvanceUse: false,
    isActive: true,
    isSeed: true,
    inUse: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export const CASUAL_ID = "0199c6a1-0000-7000-8000-000000000001";
export const COMP_OFF_ID = "0199c6a1-0000-7000-8000-000000000002";
export const LOP_ID = "0199c6a1-0000-7000-8000-000000000003";
export const PRIVILEGE_ID = "0199c6a1-0000-7000-8000-000000000005";
export const SICK_ID = "0199c6a1-0000-7000-8000-000000000006";

export const STORY_LEAVE_TYPES: LeaveTypeModel[] = [
  type(CASUAL_ID, "Casual Leave", {
    yearlyLimit: 12,
    accrualMode: "upfront",
    inUse: true,
  }),
  type(COMP_OFF_ID, "Compensatory Off"),
  type(LOP_ID, "Loss of Pay", { isPaid: false }),
  type("0199c6a1-0000-7000-8000-000000000004", "Maternity", {
    yearlyLimit: 182,
    accrualMode: "periodic",
    accrualFrequency: "monthly",
    accrualDay: 1,
    creditPerPeriod: 15.17,
  }),
  type(PRIVILEGE_ID, "Privilege Leave", {
    yearlyLimit: 15,
    accrualMode: "periodic",
    accrualFrequency: "monthly",
    accrualDay: 1,
    creditPerPeriod: 1.25,
    carryForward: true,
    maxCarryForward: 15,
    inUse: true,
  }),
  type(SICK_ID, "Sick", {
    yearlyLimit: 7,
    accrualMode: "periodic",
    accrualFrequency: "monthly",
    accrualDay: 1,
    creditPerPeriod: 0.58,
    isActive: false,
  }),
];

export const STORY_STRUCTURE: LeaveStructureModel = {
  id: "0199c6a2-0000-7000-8000-000000000001",
  name: "Office staff",
  description: null,
  isActive: true,
  lines: [
    {
      leaveTypeId: CASUAL_ID,
      leaveTypeName: "Casual Leave",
      entitlementDays: 10,
      effectiveDays: 10,
    },
    {
      leaveTypeId: PRIVILEGE_ID,
      leaveTypeName: "Privilege Leave",
      entitlementDays: null,
      effectiveDays: 15,
    },
  ],
  assignmentCount: 1,
  createdAt: AT,
  updatedAt: AT,
};

export const STORY_ASSIGNMENT: LeaveAssignmentModel = {
  id: "0199c6a3-0000-7000-8000-000000000001",
  memberId: PRIYA,
  memberName: "Priya Raman",
  structureId: STORY_STRUCTURE.id,
  structureName: "Office staff",
  effectiveFrom: "2026-01-01",
  createdAt: AT,
};

const MEMBERS = [
  { memberId: ME, name: "Arun Selva Kumar", designationName: "Owner" },
  { memberId: PRIYA, name: "Priya Raman", designationName: "Site Engineer" },
  { memberId: RAVI, name: "Ravi Kumar", designationName: "Store Keeper" },
];

export function storyOptions(
  permissions: Partial<LeaveOptions["permissions"]> = {},
): LeaveOptions {
  return {
    me: { memberId: ME, name: "Arun Selva Kumar" },
    permissions: {
      read: true,
      apply: true,
      applyForOthers: false,
      approve: false,
      viewTeam: false,
      report: false,
      configure: false,
      manageBalances: false,
      ...permissions,
    },
    members: MEMBERS,
    leaveTypes: STORY_LEAVE_TYPES.filter((item) => item.isActive).map(
      (item) => ({
        id: item.id,
        name: item.name,
        isPaid: item.isPaid,
        requiresApproval: item.requiresApproval,
        maxConsecutiveDays: item.maxConsecutiveDays,
        allowAdvanceUse: item.allowAdvanceUse,
      }),
    ),
  };
}

function row(
  leaveTypeId: string,
  leaveTypeName: string,
  values: Partial<MemberLeaveBalances["rows"][number]> = {},
): MemberLeaveBalances["rows"][number] {
  return {
    leaveTypeId,
    leaveTypeName,
    isPaid: true,
    accrualMode: "upfront",
    isActive: true,
    allowAdvanceUse: false,
    entitlement: 12,
    initialised: true,
    opening: 12,
    accrued: 0,
    carriedForward: 0,
    adjusted: 0,
    used: 0,
    pending: 0,
    available: 12,
    lastAccrualPeriod: null,
    ...values,
  };
}

export function storyBalances(
  memberId = ME,
  memberName = "Arun Selva Kumar",
): MemberLeaveBalances {
  return {
    memberId,
    memberName,
    designationName: "Site Engineer",
    leaveYear: "2026",
    structureId: null,
    rows: [
      row(CASUAL_ID, "Casual Leave", { used: 2, pending: 1, available: 9 }),
      row(COMP_OFF_ID, "Compensatory Off", {
        accrualMode: "none",
        entitlement: 0,
        opening: 0,
        adjusted: 1,
        available: 1,
      }),
      row(LOP_ID, "Loss of Pay", {
        isPaid: false,
        accrualMode: "none",
        entitlement: 0,
        opening: 0,
        used: 1,
        available: -1,
      }),
      row(PRIVILEGE_ID, "Privilege Leave", {
        accrualMode: "periodic",
        entitlement: 15,
        opening: 0,
        accrued: 11.25,
        available: 11.25,
        lastAccrualPeriod: "2026-09",
      }),
    ],
  };
}

export function storyTeamBalances(): TeamLeaveBalances {
  return {
    leaveYear: "2026",
    members: [
      storyBalances(ME, "Arun Selva Kumar"),
      storyBalances(PRIYA, "Priya Raman"),
      {
        ...storyBalances(RAVI, "Ravi Kumar"),
        rows: storyBalances().rows.map((item) => ({
          ...item,
          initialised: false,
          opening: 0,
          available: 0,
          used: 0,
          pending: 0,
        })),
      },
    ],
  };
}

export const STORY_CREDITS: LeaveCredits = {
  memberId: ME,
  leaveYear: "2026",
  items: [
    {
      id: "0199c6a4-0000-7000-8000-000000000003",
      leaveTypeId: COMP_OFF_ID,
      leaveTypeName: "Compensatory Off",
      kind: "adjustment",
      days: 1,
      entryDate: "2026-10-05",
      periodKey: null,
      reason: "Worked on Sunday 4 Oct",
      createdAt: AT,
    },
    {
      id: "0199c6a4-0000-7000-8000-000000000002",
      leaveTypeId: PRIVILEGE_ID,
      leaveTypeName: "Privilege Leave",
      kind: "accrual",
      days: 1.25,
      entryDate: "2026-09-01",
      periodKey: "2026-09",
      reason: null,
      createdAt: AT,
    },
    {
      id: "0199c6a4-0000-7000-8000-000000000001",
      leaveTypeId: CASUAL_ID,
      leaveTypeName: "Casual Leave",
      kind: "initial",
      days: 12,
      entryDate: "2026-01-01",
      periodKey: null,
      reason: null,
      createdAt: AT,
    },
  ],
};

export function storyLeave(
  overrides: Partial<LeaveRequestModel> = {},
): LeaveRequestModel {
  return {
    id: "0199c6a5-0000-7000-8000-000000000001",
    memberId: PRIYA,
    memberName: "Priya Raman",
    leaveTypeId: CASUAL_ID,
    leaveTypeName: "Casual Leave",
    isPaid: true,
    fromDate: "2026-11-06",
    toDate: "2026-11-09",
    totalDays: 2,
    leaveYear: "2026",
    reason: "Family function in Madurai",
    status: "pending",
    approvalLevels: 1,
    currentLevel: 1,
    approvalRemarks: null,
    rejectionReason: null,
    cancellationReason: null,
    appliedByMemberId: PRIYA,
    appliedByName: "Priya Raman",
    days: [
      { date: "2026-11-06", session: "full" },
      { date: "2026-11-09", session: "full" },
    ],
    decisions: [],
    canWithdraw: false,
    canRequestCancellation: false,
    canDecide: true,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** The preview for Friday 6 Nov – Monday 9 Nov: two working days. */
export function storyPreview(body: unknown): LeavePreview {
  const input = body as {
    fromDate: string;
    toDate: string;
    leaveTypeId: string;
    days?: { date: string; session: "morning" | "afternoon" }[];
  };
  const sessions = new Map(
    (input.days ?? []).map((day) => [day.date, day.session]),
  );
  const dates: string[] = [];
  const skipped: LeavePreview["skipped"] = [];
  for (
    let time = Date.parse(`${input.fromDate}T00:00:00Z`);
    time <= Date.parse(`${input.toDate}T00:00:00Z`);
    time += 86_400_000
  ) {
    const date = new Date(time);
    const day = date.getUTCDay();
    const text = date.toISOString().slice(0, 10);
    if (day === 0 || day === 6) skipped.push({ date: text, kind: "week_off" });
    else dates.push(text);
  }
  const days = dates.map((date) => ({
    date,
    session: sessions.get(date) ?? ("full" as const),
  }));
  const total = days.reduce(
    (sum, day) => sum + (day.session === "full" ? 1 : 0.5),
    0,
  );
  const paid = input.leaveTypeId !== LOP_ID;
  return {
    memberId: ME,
    leaveYear: "2026",
    days,
    skipped,
    total,
    balance: paid
      ? {
          entitlement: 12,
          initialised: true,
          opening: 12,
          accrued: 0,
          carriedForward: 0,
          adjusted: 0,
          used: 2,
          pending: 1,
          available: 9,
          lastAccrualPeriod: null,
        }
      : null,
    problem: null,
  };
}

export type LeaveApiState = {
  options?: LeaveOptions;
  types?: LeaveTypeModel[];
  structures?: LeaveStructureModel[];
  assignments?: LeaveAssignmentModel[];
  balances?: MemberLeaveBalances;
  team?: TeamLeaveBalances;
  credits?: LeaveCredits;
  mine?: LeaveRequestModel[];
  approvals?: Partial<Record<LeaveApprovalTab, LeaveRequestModel[]>>;
  teamLeaves?: LeaveRequestModel[];
  report?: TeamLeaveReport;
  /** Answers a write; the default echoes a plausible success. */
  write?: (call: ApiCall) => Response | undefined;
};

const BASE = "/api/construction/hrms";

/**
 * Serves the leave API from `state` and records every call. Writes answer
 * with `state.write`, else a success built from the fixtures.
 */
export function serveLeave(state: LeaveApiState) {
  const calls: ApiCall[] = [];
  const api = mockApi((call) => {
    calls.push(call);
    const path = call.path.split("?")[0] ?? "";
    const search = new URLSearchParams(call.path.split("?")[1] ?? "");
    if (call.method === "POST") {
      const answered = state.write?.(call);
      if (answered != null) return answered;
      if (path === `${BASE}/leaves/preview`)
        return Response.json(storyPreview(call.body));
      if (path === `${BASE}/leaves`)
        return Response.json(
          storyLeave({ memberId: ME, memberName: "Arun Selva Kumar" }),
          { status: 201 },
        );
      if (path.startsWith(`${BASE}/leaves/`))
        return Response.json(storyLeave({ status: "approved" }));
      if (path === `${BASE}/leave-balances/accrue`)
        return Response.json({ leaveYear: "2026", members: 3, credits: 6 });
      if (path.startsWith(`${BASE}/leave-balances/initialize`))
        return Response.json({
          leaveYear: "2026",
          members: 2,
          initialised: 8,
          carriedForward: 1,
        });
      if (path === `${BASE}/leave-balances/adjust`)
        return Response.json(storyBalances().rows[1]);
      if (path === `${BASE}/leave-types`)
        return Response.json(
          { ...STORY_LEAVE_TYPES[0], ...(call.body as object), id: "new" },
          { status: 201 },
        );
      if (path === `${BASE}/leave-structures`)
        return Response.json(STORY_STRUCTURE, { status: 201 });
      if (path === `${BASE}/leave-structures/assignments`)
        return Response.json({ items: [STORY_ASSIGNMENT] }, { status: 201 });
      if (path.endsWith("/delete")) return new Response(null, { status: 204 });
      if (path.startsWith(`${BASE}/leave-types/`))
        return Response.json(STORY_LEAVE_TYPES[0]);
      if (path.startsWith(`${BASE}/leave-structures/`))
        return Response.json(STORY_STRUCTURE);
      return undefined;
    }
    switch (path) {
      case `${BASE}/leaves/options`:
        return Response.json(state.options ?? storyOptions());
      case `${BASE}/leave-types`:
        return Response.json({ items: state.types ?? STORY_LEAVE_TYPES });
      case `${BASE}/leave-structures`:
        return Response.json({ items: state.structures ?? [STORY_STRUCTURE] });
      case `${BASE}/leave-structures/assignments`:
        return Response.json({
          items: state.assignments ?? [STORY_ASSIGNMENT],
        });
      case `${BASE}/leave-balances`:
        return Response.json(state.balances ?? storyBalances());
      case `${BASE}/leave-balances/team`:
        return Response.json(state.team ?? storyTeamBalances());
      case `${BASE}/leave-balances/accruals`:
        return Response.json(state.credits ?? STORY_CREDITS);
      case `${BASE}/leaves`:
        return Response.json({
          items: state.mine ?? [],
          total: state.mine?.length ?? 0,
        });
      case `${BASE}/leaves/approvals`: {
        const tab = (search.get("tab") ?? "pending") as LeaveApprovalTab;
        const items = state.approvals?.[tab] ?? [];
        return Response.json({
          items,
          total: items.length,
          counts: {
            pending: state.approvals?.pending?.length ?? 0,
            approved: state.approvals?.approved?.length ?? 0,
            rejected: state.approvals?.rejected?.length ?? 0,
            cancel_requests: state.approvals?.cancel_requests?.length ?? 0,
          },
        });
      }
      case `${BASE}/leaves/team`:
        return Response.json({
          items: state.teamLeaves ?? [],
          total: state.teamLeaves?.length ?? 0,
        });
      case `${BASE}/leaves/report/team`:
        return Response.json(
          state.report ?? {
            from: search.get("from"),
            to: search.get("to"),
            rows: [],
          },
        );
      default:
        return undefined;
    }
  });
  return {
    calls,
    restore: api.restore,
    /** Bodies of the POSTs to `path`. */
    posted: (path: string) =>
      calls
        .filter(
          (call) => call.method === "POST" && call.path === `${BASE}${path}`,
        )
        .map((call) => call.body),
  };
}

/** The item at `index`, or a failed story when there is none. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item == null) throw new Error(`No item at ${String(index)}`);
  return item;
}
