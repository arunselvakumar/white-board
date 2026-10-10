import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { addMonths, monthKeyOf } from "../domain/calendar";
import {
  assertBalanceCovers,
  balanceOf,
  type LeaveBalance,
} from "../domain/leave-balance";
import { sumDays } from "../domain/leave-days";
import {
  applyTransition,
  approveTransition,
  assertLeaveRange,
  assertNoOverlap,
  assertTypeAllows,
  datesBetween,
  decideCancellationTransition,
  leaveReason,
  LIVE_LEAVE_STATUSES,
  optionalRemarks,
  planLeaveDays,
  rejectTransition,
  requestCancellationTransition,
  requiredReason,
  sessionDays,
  withdrawTransition,
  type LeaveCalendarDay,
  type LeaveDaysPlan,
  type LeaveDecider,
  type LeaveRequestState,
  type LeaveRequestStatus,
  type LeaveTransition,
} from "../domain/leave-request";
import { approvalLevelsFor } from "../domain/leave-type";
import { leaveYearOf } from "../domain/leave-year";
import { leaveMemberNotFound } from "./leave-balance-handlers";
import { LeaveEntitlements } from "./leave-entitlements";
import type {
  LeaveBackdatedGuard,
  LeaveQueries,
  LeaveStructureStore,
  LeaveTransactions,
  LeaveTypeStore,
  StoredLeaveRequest,
  StoredLeaveType,
} from "./leave-ports";
import type {
  EmployeeDirectory,
  HrmsEmployee,
  HrmsSettingsReader,
  MonthLock,
  WorkCalendar,
} from "./ports";

const MENU = "hrms.leaves" as const;

/** The most days Team Leaves and the team report cover at once. */
export const TEAM_RANGE_MAX_DAYS = 93;

export const leaveRequestNotFound = () =>
  notFound("LEAVE_REQUEST_NOT_FOUND", "This leave request was not found.");

const leaveTypeMissing = () =>
  new DomainError("LEAVE_TYPE_NOT_FOUND", "This leave type was not found.", {
    kind: "not_found",
    details: { field: "leaveTypeId" },
  });

export const LEAVE_APPROVAL_TABS = [
  "pending",
  "approved",
  "rejected",
  "cancel_requests",
] as const;

export type LeaveApprovalTab = (typeof LEAVE_APPROVAL_TABS)[number];

const TAB_STATUS: Record<LeaveApprovalTab, LeaveRequestStatus> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancel_requests: "cancellation_requested",
};

export type LeaveApplyInput = {
  /** Another member: a manager applying on their behalf (view_all + create). */
  memberId?: string | null;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  /** Dates that are a Morning or an Afternoon; others are Full. */
  days?: readonly { date: string; session: string }[];
  reason: string;
};

export type LeavePreview = {
  memberId: string;
  leaveYear: string;
  days: LeaveDaysPlan["days"];
  skipped: LeaveDaysPlan["skipped"];
  total: number;
  balance: (LeaveBalance & { entitlement: number }) | null;
  /** Null when the request fits; else why not. */
  problem: { code: string; message: string } | null;
};

export type LeaveRequestReadModel = Omit<StoredLeaveRequest, "decisions"> & {
  memberName: string;
  leaveTypeName: string;
  isPaid: boolean;
  appliedByName: string | null;
  decisions: (StoredLeaveRequest["decisions"][number] & {
    deciderName: string | null;
  })[];
  /** What the caller may do with it now. */
  canWithdraw: boolean;
  canRequestCancellation: boolean;
  canDecide: boolean;
};

export type TeamReportRow = {
  memberId: string;
  memberName: string;
  byType: { leaveTypeId: string; leaveTypeName: string; days: number }[];
  paidDays: number;
  unpaidDays: number;
  pendingDays: number;
};

/**
 * Leave requests (CM-312, CM-313): apply (for yourself, or for another
 * member with `view_all` + `create`), withdraw while pending, ask to
 * cancel approved leave; approvers (any holder of approve / reject on
 * `hrms.leaves`, ADR CM-0012 §5) decide requests and cancellations. Every
 * write runs under the member's leave lock, compares `updatedAt`, posts
 * its ledger entries and an audit event in one transaction.
 */
export class LeaveRequestHandlers {
  private readonly entitlements: LeaveEntitlements;

  constructor(
    private readonly types: LeaveTypeStore,
    structures: LeaveStructureStore,
    private readonly employees: EmployeeDirectory,
    private readonly settings: HrmsSettingsReader,
    private readonly calendar: WorkCalendar,
    private readonly monthLock: MonthLock,
    private readonly guard: LeaveBackdatedGuard,
    private readonly queries: LeaveQueries,
    private readonly transactions: LeaveTransactions,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.entitlements = new LeaveEntitlements(types, structures);
  }

  private me(access: MemberAccess): Promise<HrmsEmployee | null> {
    return this.employees.findByUserId(access.workspaceId, access.userId);
  }

  private static decider(
    access: MemberAccess,
    me: HrmsEmployee | null,
  ): LeaveDecider {
    return { memberId: me?.memberId ?? null, isOwner: access.role === "owner" };
  }

  // -------------------------------------------------------------------------
  // Apply
  // -------------------------------------------------------------------------

  /**
   * What the leave screens may offer the caller: their leave permissions,
   * the active leave types, and the Team Members to pick from when they
   * may act for others (apply on behalf, assign, initialise, adjust). Any
   * member of the Company may ask; nothing here is private.
   */
  async options(access: MemberAccess) {
    const [me, types] = await Promise.all([
      this.me(access),
      this.types.list(access.workspaceId),
    ]);
    const permissions = {
      read: can(access, MENU, "read"),
      apply: can(access, MENU, "create") && me != null,
      applyForOthers:
        can(access, MENU, "view_all") && can(access, MENU, "create"),
      approve: can(access, MENU, "approve") || can(access, MENU, "reject"),
      viewTeam: can(access, MENU, "view_all"),
      report: can(access, MENU, "report"),
      configure: can(access, "hrms.leave_structures", "read"),
      manageBalances: can(access, "hrms.leave_structures", "update"),
    };
    const pickMembers =
      permissions.applyForOthers ||
      permissions.configure ||
      permissions.manageBalances;
    const members = pickMembers
      ? (await this.employees.list(access.workspaceId)).filter(
          (member) => member.active,
        )
      : [];
    return {
      me: me == null ? null : { memberId: me.memberId, name: me.name },
      permissions,
      members: members.map((member) => ({
        memberId: member.memberId,
        name: member.name,
        designationName: member.designationName,
      })),
      leaveTypes: types
        .filter((type) => type.isActive)
        .map((type) => ({
          id: type.id,
          name: type.name,
          isPaid: type.isPaid,
          requiresApproval: type.requiresApproval,
          maxConsecutiveDays: type.maxConsecutiveDays,
          allowAdvanceUse: type.allowAdvanceUse,
        })),
    };
  }

  /** Who the request is for: the caller, or another member (view_all + create). */
  private async applicant(
    access: MemberAccess,
    memberId: string | null | undefined,
  ): Promise<{ member: HrmsEmployee; me: HrmsEmployee | null }> {
    assertCan(access, MENU, "create");
    const me = await this.me(access);
    if (memberId == null || memberId === me?.memberId) {
      if (me == null) throw leaveMemberNotFound();
      return { member: me, me };
    }
    if (!can(access, MENU, "view_all"))
      throw forbidden(
        "PERMISSION_DENIED",
        "You can apply for leave only for yourself. Applying for someone else needs View All on Leave Management.",
      );
    const member = (
      await this.employees.find(access.workspaceId, [memberId])
    ).get(memberId);
    if (member?.active !== true)
      throw new DomainError(
        "LEAVE_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
        { kind: "not_found", details: { field: "memberId" } },
      );
    return { member, me };
  }

  private async calendarDays(
    workspaceId: string,
    memberId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<LeaveCalendarDay[]> {
    const wanted = new Set(datesBetween(from, to));
    const months: string[] = [];
    for (
      let month = monthKeyOf(from);
      month <= monthKeyOf(to);
      month = addMonths(month, 1)
    )
      months.push(month);
    const found = await Promise.all(
      months.map((month) =>
        this.calendar.monthFor(workspaceId, [memberId], month),
      ),
    );
    return found
      .flatMap((byMember) => byMember.get(memberId) ?? [])
      .filter((day) => wanted.has(day.date))
      .map((day) => ({ date: day.date, kind: day.kind }));
  }

  private async plan(
    access: MemberAccess,
    input: LeaveApplyInput,
  ): Promise<{
    member: HrmsEmployee;
    me: HrmsEmployee | null;
    type: StoredLeaveType;
    plan: LeaveDaysPlan;
    leaveYear: ReturnType<typeof leaveYearOf>;
    levels: 0 | 1 | 2;
    entitlement: number;
  }> {
    const { member, me } = await this.applicant(access, input.memberId);
    const type = await this.types.find(access.workspaceId, input.leaveTypeId);
    if (type == null) throw leaveTypeMissing();
    assertLeaveRange(input.fromDate, input.toDate);
    const settings = await this.settings.settingsFor(access.workspaceId);
    const leaveYear = leaveYearOf(input.fromDate, settings.leaveYear);
    if (input.toDate > leaveYear.end)
      throw new DomainError(
        "LEAVE_SPANS_YEARS",
        `A request stays within one leave year. Apply up to ${leaveYear.end}, then again from the next day.`,
        { details: { field: "toDate", leaveYearEnd: leaveYear.end } },
      );
    const sessions: Record<string, string> = {};
    for (const day of input.days ?? []) sessions[day.date] = day.session;
    const plan = planLeaveDays({
      calendar: await this.calendarDays(
        access.workspaceId,
        member.memberId,
        input.fromDate,
        input.toDate,
      ),
      sessions,
    });
    assertTypeAllows(type, plan.total);
    const today = await this.queries.today(access.workspaceId);
    const entitlement =
      (
        await this.entitlements.forMembers(
          access.workspaceId,
          [member.memberId],
          leaveYear,
          today,
        )
      )
        .get(member.memberId)
        ?.lines.get(type.id) ?? type.yearlyLimit;
    return {
      member,
      me,
      type,
      plan,
      leaveYear,
      levels: approvalLevelsFor(type, settings.leaveApprovalLevels),
      entitlement,
    };
  }

  /**
   * The Apply Leave form's live view: the day breakdown, the total and the
   * balance, with why it would be refused (balance, overlap). Writes
   * nothing; date and type mistakes are 400s as on apply.
   */
  async preview(
    access: MemberAccess,
    input: Omit<LeaveApplyInput, "reason">,
  ): Promise<LeavePreview> {
    const planned = await this.plan(access, { ...input, reason: "" });
    const { member, type, plan, leaveYear, entitlement } = planned;
    const entries = await this.queries.ledger(access.workspaceId, {
      memberIds: [member.memberId],
      leaveTypeIds: [type.id],
      leaveYears: [leaveYear.key],
    });
    const balance = balanceOf(entries);
    let problem: LeavePreview["problem"] = null;
    try {
      assertBalanceCovers({
        type,
        balance,
        entitlement,
        requested: plan.total,
      });
      const taken = await this.liveDaysOf(
        access.workspaceId,
        member.memberId,
        input.fromDate,
        input.toDate,
      );
      assertNoOverlap(plan.days, taken);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      problem = { code: error.code, message: error.message };
    }
    return {
      memberId: member.memberId,
      leaveYear: leaveYear.key,
      days: plan.days,
      skipped: plan.skipped,
      total: plan.total,
      balance: type.isPaid ? { ...balance, entitlement } : null,
      problem,
    };
  }

  private async liveDaysOf(
    workspaceId: string,
    memberId: string,
    from: CalendarDate,
    to: CalendarDate,
  ) {
    const { items } = await this.queries.requests(workspaceId, {
      memberIds: [memberId],
      statuses: LIVE_LEAVE_STATUSES,
      from,
      to,
      limit: 500,
    });
    return items.flatMap((item) => item.days);
  }

  private async assertMonthsOpen(
    workspaceId: string,
    memberId: string,
    dates: readonly CalendarDate[],
  ): Promise<void> {
    const firstOfMonth = new Map<string, CalendarDate>();
    for (const date of dates)
      if (!firstOfMonth.has(monthKeyOf(date)))
        firstOfMonth.set(monthKeyOf(date), date);
    for (const date of firstOfMonth.values())
      await this.monthLock.assertOpen(workspaceId, memberId, date);
  }

  /**
   * Apply for leave (CM-312): the back-dated guard on the first day, the
   * month lock on every month, the type's most days, no overlap with
   * another live request, and the balance (unpaid leave and advance use
   * aside). Pending with a reservation, or approved at once.
   */
  async apply(
    access: MemberAccess,
    input: LeaveApplyInput,
  ): Promise<LeaveRequestReadModel> {
    const reason = leaveReason(input.reason);
    const planned = await this.plan(access, input);
    const { member, type, plan, leaveYear, levels, entitlement } = planned;
    await this.guard.assertCanCreate(access, input.fromDate);
    await this.assertMonthsOpen(
      access.workspaceId,
      member.memberId,
      plan.days.map((day) => day.date),
    );
    const transition = applyTransition(levels, plan.total);
    const appliedBy = planned.me ?? member;
    const now = this.clock();
    const id = newId(now.getTime());
    await this.transactions.run(
      access.workspaceId,
      [member.memberId],
      async (tx) => {
        assertNoOverlap(
          plan.days,
          await tx.liveDays(member.memberId, input.fromDate, input.toDate),
        );
        assertBalanceCovers({
          type,
          balance: balanceOf(
            await tx.ledger({
              memberIds: [member.memberId],
              leaveTypeIds: [type.id],
              leaveYears: [leaveYear.key],
            }),
          ),
          entitlement,
          requested: plan.total,
        });
        await tx.insertRequest(
          {
            id,
            memberId: member.memberId,
            leaveTypeId: type.id,
            fromDate: input.fromDate,
            toDate: input.toDate,
            totalDays: plan.total,
            leaveYear: leaveYear.key,
            reason,
            status: transition.status,
            approvalLevels: transition.approvalLevels,
            currentLevel: transition.currentLevel,
            approvalRemarks: null,
            rejectionReason: null,
            cancellationReason: null,
            appliedByMemberId: appliedBy.memberId,
            days: plan.days,
          },
          access.userId,
          now,
        );
        await tx.post(
          transition.postings.map((posting) => ({
            memberId: member.memberId,
            leaveTypeId: type.id,
            leaveYear: leaveYear.key,
            kind: posting.kind,
            days: posting.days,
            entryDate: input.fromDate,
            periodKey: null,
            requestId: id,
            reason: null,
            createdBy: access.userId,
          })),
        );
        await tx.audit({
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action:
            transition.status === "approved"
              ? "leave_request.applied_and_approved"
              : "leave_request.applied",
          entityType: "leave_request",
          entityId: id,
          after: {
            memberId: member.memberId,
            leaveTypeId: type.id,
            fromDate: input.fromDate,
            toDate: input.toDate,
            totalDays: plan.total,
            status: transition.status,
            appliedByMemberId: appliedBy.memberId,
          },
          occurredAt: now,
        });
      },
    );
    return this.get(access, id);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private async readModels(
    access: MemberAccess,
    requests: readonly StoredLeaveRequest[],
  ): Promise<LeaveRequestReadModel[]> {
    if (requests.length === 0) return [];
    const memberIds = requests.flatMap((request) => [
      request.memberId,
      request.appliedByMemberId,
      ...request.decisions.flatMap((decision) =>
        decision.deciderMemberId == null ? [] : [decision.deciderMemberId],
      ),
    ]);
    const [members, types, me] = await Promise.all([
      this.employees.find(access.workspaceId, memberIds),
      this.types.list(access.workspaceId),
      this.me(access),
    ]);
    const typeById = new Map(types.map((type) => [type.id, type]));
    const decider = LeaveRequestHandlers.decider(access, me);
    const mayApprove =
      can(access, MENU, "approve") || can(access, MENU, "reject");
    const mayCreate = can(access, MENU, "create");
    const forOthers = mayCreate && can(access, MENU, "view_all");
    return requests.map((request) => {
      const type = typeById.get(request.leaveTypeId);
      const mine =
        me != null &&
        (request.memberId === me.memberId ||
          request.appliedByMemberId === me.memberId);
      const ownOrManaged = mayCreate && (mine || forOthers);
      const state = stateOf(request);
      let canDecide = false;
      if (
        mayApprove &&
        (request.status === "pending" ||
          request.status === "cancellation_requested")
      ) {
        try {
          if (request.status === "pending") approveTransition(state, decider);
          else decideCancellationTransition(state, decider, true);
          canDecide = true;
        } catch {
          canDecide = false;
        }
      }
      return {
        ...request,
        memberName: members.get(request.memberId)?.name ?? "—",
        leaveTypeName: type?.name ?? "—",
        isPaid: type?.isPaid ?? true,
        appliedByName: members.get(request.appliedByMemberId)?.name ?? null,
        decisions: request.decisions.map((decision) => ({
          ...decision,
          deciderName:
            decision.deciderMemberId == null
              ? null
              : (members.get(decision.deciderMemberId)?.name ?? null),
        })),
        canWithdraw: ownOrManaged && request.status === "pending",
        canRequestCancellation: ownOrManaged && request.status === "approved",
        canDecide,
      };
    });
  }

  /** One request: your own, any with view_all, or any for an approver. */
  async get(access: MemberAccess, id: string): Promise<LeaveRequestReadModel> {
    assertCan(access, MENU, "read");
    const request = await this.queries.request(access.workspaceId, id);
    if (request == null) throw leaveRequestNotFound();
    if (
      !can(access, MENU, "view_all") &&
      !can(access, MENU, "approve") &&
      !can(access, MENU, "reject")
    ) {
      const me = await this.me(access);
      if (
        me == null ||
        (request.memberId !== me.memberId &&
          request.appliedByMemberId !== me.memberId)
      )
        throw leaveRequestNotFound();
    }
    const [model] = await this.readModels(access, [request]);
    if (model == null) throw leaveRequestNotFound();
    return model;
  }

  /** My Leaves: the caller's own requests, newest first. */
  async listMine(
    access: MemberAccess,
    input: { status?: LeaveRequestStatus; limit?: number },
  ): Promise<{ items: LeaveRequestReadModel[]; total: number }> {
    assertCan(access, MENU, "read");
    const me = await this.me(access);
    if (me == null) return { items: [], total: 0 };
    const page = await this.queries.requests(access.workspaceId, {
      memberIds: [me.memberId],
      statuses: input.status == null ? undefined : [input.status],
      limit: input.limit ?? 100,
    });
    return {
      items: await this.readModels(access, page.items),
      total: page.total,
    };
  }

  /** Leave Approvals: one tab (approve or reject on `hrms.leaves`). */
  async approvals(
    access: MemberAccess,
    input: { tab: LeaveApprovalTab; limit?: number },
  ): Promise<{
    items: LeaveRequestReadModel[];
    total: number;
    counts: Record<LeaveApprovalTab, number>;
  }> {
    if (!can(access, MENU, "approve") && !can(access, MENU, "reject"))
      assertCan(access, MENU, "approve");
    const [page, ...counts] = await Promise.all([
      this.queries.requests(access.workspaceId, {
        statuses: [TAB_STATUS[input.tab]],
        limit: input.limit ?? 100,
      }),
      ...LEAVE_APPROVAL_TABS.map((tab) =>
        this.queries.requests(access.workspaceId, {
          statuses: [TAB_STATUS[tab]],
          limit: 0,
        }),
      ),
    ]);
    return {
      items: await this.readModels(access, page.items),
      total: page.total,
      counts: Object.fromEntries(
        LEAVE_APPROVAL_TABS.map((tab, index) => [
          tab,
          counts[index]?.total ?? 0,
        ]),
      ) as Record<LeaveApprovalTab, number>,
    };
  }

  private static assertTeamRange(from: string, to: string): void {
    assertLeaveRange(from, to);
    if (daysBetween(from, to) + 1 > TEAM_RANGE_MAX_DAYS)
      throw new DomainError(
        "LEAVE_RANGE_TOO_LONG",
        `Choose at most ${String(TEAM_RANGE_MAX_DAYS)} days.`,
        { details: { field: "toDate" } },
      );
  }

  /** Team Leaves: live requests with a day in the range (`view_all`). */
  async team(
    access: MemberAccess,
    input: { from: string; to: string },
  ): Promise<{ items: LeaveRequestReadModel[]; total: number }> {
    assertCan(access, MENU, "view_all");
    LeaveRequestHandlers.assertTeamRange(input.from, input.to);
    const page = await this.queries.requests(access.workspaceId, {
      statuses: LIVE_LEAVE_STATUSES,
      from: input.from,
      to: input.to,
      limit: 500,
    });
    return {
      items: await this.readModels(access, page.items),
      total: page.total,
    };
  }

  /**
   * The team leave report (`report`): per member, the approved days in the
   * range by leave type, paid and unpaid, and the days still pending.
   */
  async teamReport(
    access: MemberAccess,
    input: { from: string; to: string },
  ): Promise<{ from: string; to: string; rows: TeamReportRow[] }> {
    assertCan(access, MENU, "report");
    LeaveRequestHandlers.assertTeamRange(input.from, input.to);
    const [page, members, types] = await Promise.all([
      this.queries.requests(access.workspaceId, {
        statuses: LIVE_LEAVE_STATUSES,
        from: input.from,
        to: input.to,
        limit: 5000,
      }),
      this.employees.list(access.workspaceId),
      this.types.list(access.workspaceId),
    ]);
    const typeById = new Map(types.map((type) => [type.id, type]));
    const rows: TeamReportRow[] = [];
    for (const member of members) {
      const own = page.items.filter(
        (request) => request.memberId === member.memberId,
      );
      if (own.length === 0 && !member.active) continue;
      const byType = new Map<string, number[]>();
      const paid: number[] = [];
      const unpaid: number[] = [];
      const pending: number[] = [];
      for (const request of own) {
        const inRange = request.days
          .filter((day) => day.date >= input.from && day.date <= input.to)
          .map((day) => sessionDays(day.session));
        if (request.status === "pending") {
          pending.push(...inRange);
          continue;
        }
        byType.set(request.leaveTypeId, [
          ...(byType.get(request.leaveTypeId) ?? []),
          ...inRange,
        ]);
        (typeById.get(request.leaveTypeId)?.isPaid === false
          ? unpaid
          : paid
        ).push(...inRange);
      }
      rows.push({
        memberId: member.memberId,
        memberName: member.name,
        byType: [...byType].map(([leaveTypeId, days]) => ({
          leaveTypeId,
          leaveTypeName: typeById.get(leaveTypeId)?.name ?? "—",
          days: sumDays(days),
        })),
        paidDays: sumDays(paid),
        unpaidDays: sumDays(unpaid),
        pendingDays: sumDays(pending),
      });
    }
    return { from: input.from, to: input.to, rows };
  }

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  /**
   * Runs a transition under the member's leave lock: reloads the request,
   * refuses a stale `expectedUpdatedAt` (409 `LEAVE_REQUEST_CHANGED`),
   * writes the status, the decision, the ledger postings and the audit.
   */
  private async transition(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: {
      action: string;
      checkMonths: boolean;
      decide: (
        state: LeaveRequestState,
        request: StoredLeaveRequest,
      ) => {
        transition: LeaveTransition;
        decision?: {
          stage: "request" | "cancellation";
          outcome: "approved" | "rejected";
          remarks: string | null;
        };
        fields?: {
          approvalRemarks?: string | null;
          rejectionReason?: string | null;
          cancellationReason?: string | null;
        };
      };
      deciderMemberId: string | null;
      authorise?: (request: StoredLeaveRequest) => Promise<void>;
    },
  ): Promise<LeaveRequestReadModel> {
    const loaded = await this.queries.request(access.workspaceId, id);
    if (loaded == null) throw leaveRequestNotFound();
    await input.authorise?.(loaded);
    if (input.checkMonths)
      await this.assertMonthsOpen(
        access.workspaceId,
        loaded.memberId,
        loaded.days.map((day) => day.date),
      );
    await this.transactions.run(
      access.workspaceId,
      [loaded.memberId],
      async (tx) => {
        const request = await tx.findRequest(id);
        if (request == null) throw leaveRequestNotFound();
        if (request.updatedAt.getTime() !== expectedUpdatedAt.getTime())
          throw conflict(
            "LEAVE_REQUEST_CHANGED",
            "Someone else acted on this request after you opened it. Reload to see what changed.",
          );
        const { transition, decision, fields } = input.decide(
          stateOf(request),
          request,
        );
        const now = this.clock();
        if (decision != null)
          await tx.insertDecision(
            id,
            {
              ...decision,
              level: request.currentLevel,
              deciderMemberId: input.deciderMemberId,
              decidedAt: now,
            },
            access.userId,
          );
        await tx.updateRequest(id, request.updatedAt, {
          status: transition.status,
          currentLevel: transition.currentLevel,
          ...fields,
          updatedAt: now,
          updatedBy: access.userId,
        });
        await tx.post(
          transition.postings.map((posting) => ({
            memberId: request.memberId,
            leaveTypeId: request.leaveTypeId,
            leaveYear: request.leaveYear,
            kind: posting.kind,
            days: posting.days,
            entryDate: request.fromDate,
            periodKey: null,
            requestId: id,
            reason: null,
            createdBy: access.userId,
          })),
        );
        await tx.audit({
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: input.action,
          entityType: "leave_request",
          entityId: id,
          before: {
            status: request.status,
            currentLevel: request.currentLevel,
          },
          after: {
            status: transition.status,
            currentLevel: transition.currentLevel,
            ...decision,
            ...fields,
          },
          occurredAt: now,
        });
      },
    );
    return this.get(access, id);
  }

  /** The member, whoever applied, or a manager (view_all) — with `create`. */
  private async assertOwnOrManaged(
    access: MemberAccess,
    request: StoredLeaveRequest,
  ): Promise<void> {
    assertCan(access, MENU, "create");
    if (can(access, MENU, "view_all")) return;
    const me = await this.me(access);
    if (
      me == null ||
      (request.memberId !== me.memberId &&
        request.appliedByMemberId !== me.memberId)
    )
      throw leaveRequestNotFound();
  }

  /** Take back a pending request (ADR CM-0012 §8); the reservation is released. */
  async withdraw(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<LeaveRequestReadModel> {
    return this.transition(access, id, expectedUpdatedAt, {
      action: "leave_request.withdrawn",
      checkMonths: false,
      deciderMemberId: null,
      authorise: (request) => this.assertOwnOrManaged(access, request),
      decide: (state) => ({ transition: withdrawTransition(state) }),
    });
  }

  /** Ask to cancel approved leave, with a reason; immediate for a type needing no approval. */
  async requestCancellation(
    access: MemberAccess,
    id: string,
    reasonInput: string,
    expectedUpdatedAt: Date,
  ): Promise<LeaveRequestReadModel> {
    const reason = requiredReason(
      reasonInput,
      "LEAVE_CANCELLATION_REASON_REQUIRED",
      "Say why the leave is cancelled.",
    );
    let needsApproval = true;
    return this.transition(access, id, expectedUpdatedAt, {
      action: "leave_request.cancellation_requested",
      checkMonths: true,
      deciderMemberId: null,
      authorise: async (request) => {
        await this.assertOwnOrManaged(access, request);
        const type = await this.types.find(
          access.workspaceId,
          request.leaveTypeId,
        );
        needsApproval = type?.requiresApproval ?? true;
      },
      decide: (state) => ({
        transition: requestCancellationTransition(state, needsApproval),
        fields: { cancellationReason: reason },
      }),
    });
  }

  /** Approve the waiting level with optional remarks (`approve`). */
  async approve(
    access: MemberAccess,
    id: string,
    remarksInput: string | null | undefined,
    expectedUpdatedAt: Date,
  ): Promise<LeaveRequestReadModel> {
    assertCan(access, MENU, "approve");
    const remarks = optionalRemarks(remarksInput);
    const me = await this.me(access);
    const decider = LeaveRequestHandlers.decider(access, me);
    return this.transition(access, id, expectedUpdatedAt, {
      action: "leave_request.approved",
      checkMonths: true,
      deciderMemberId: decider.memberId,
      decide: (state) => {
        const transition = approveTransition(state, decider);
        return {
          transition,
          decision: { stage: "request", outcome: "approved", remarks },
          fields:
            transition.status === "approved"
              ? { approvalRemarks: remarks }
              : undefined,
        };
      },
    });
  }

  /** Reject with a reason (`reject`); the reservation is released. */
  async reject(
    access: MemberAccess,
    id: string,
    reasonInput: string,
    expectedUpdatedAt: Date,
  ): Promise<LeaveRequestReadModel> {
    assertCan(access, MENU, "reject");
    const reason = requiredReason(
      reasonInput,
      "LEAVE_REJECTION_REASON_REQUIRED",
      "Give a rejection reason.",
    );
    const me = await this.me(access);
    const decider = LeaveRequestHandlers.decider(access, me);
    return this.transition(access, id, expectedUpdatedAt, {
      action: "leave_request.rejected",
      checkMonths: true,
      deciderMemberId: decider.memberId,
      decide: (state) => ({
        transition: rejectTransition(state, decider),
        decision: { stage: "request", outcome: "rejected", remarks: reason },
        fields: { rejectionReason: reason },
      }),
    });
  }

  /**
   * Decide a cancellation request: approve (`approve`; cancelled, days
   * restored) or refuse with a reason (`reject`; stays approved).
   */
  async decideCancellation(
    access: MemberAccess,
    id: string,
    input: { approve: boolean; remarks?: string | null },
    expectedUpdatedAt: Date,
  ): Promise<LeaveRequestReadModel> {
    assertCan(access, MENU, input.approve ? "approve" : "reject");
    const remarks = input.approve
      ? optionalRemarks(input.remarks)
      : requiredReason(
          input.remarks,
          "LEAVE_REJECTION_REASON_REQUIRED",
          "Say why the cancellation is refused.",
        );
    const me = await this.me(access);
    const decider = LeaveRequestHandlers.decider(access, me);
    return this.transition(access, id, expectedUpdatedAt, {
      action: input.approve
        ? "leave_request.cancelled"
        : "leave_request.cancellation_refused",
      checkMonths: true,
      deciderMemberId: decider.memberId,
      decide: (state) => ({
        transition: decideCancellationTransition(state, decider, input.approve),
        decision: {
          stage: "cancellation",
          outcome: input.approve ? "approved" : "rejected",
          remarks,
        },
      }),
    });
  }
}

function stateOf(request: StoredLeaveRequest): LeaveRequestState {
  return {
    memberId: request.memberId,
    status: request.status,
    approvalLevels: request.approvalLevels,
    currentLevel: request.currentLevel,
    totalDays: request.totalDays,
    levelDeciders: request.decisions
      .filter((decision) => decision.stage === "request")
      .map((decision) => ({
        level: decision.level,
        memberId: decision.deciderMemberId,
      })),
  };
}
