import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { monthKeyOf } from "../domain/calendar";
import type { HrmsSettings } from "../domain/hrms-settings";
import {
  accrualCredits,
  balanceOf,
  carryForwardDays,
  createAdjustment,
  LEAVE_CREDIT_KINDS,
  openingCredit,
  previousLeaveYear,
  type LeaveBalance,
  type LeaveLedgerKind,
} from "../domain/leave-balance";
import { sumDays } from "../domain/leave-days";
import type { AccrualMode } from "../domain/leave-type";
import type { LeaveYear } from "../domain/leave-year";
import { LeaveEntitlements, resolveLeaveYear } from "./leave-entitlements";
import type {
  LeaveQueries,
  LeaveStructureStore,
  LeaveTransactions,
  LeaveTypeStore,
  LeaveWork,
  NewLedgerEntry,
  StoredLedgerEntry,
  StoredLeaveType,
} from "./leave-ports";
import type {
  EmployeeDirectory,
  HrmsEmployee,
  HrmsSettingsReader,
} from "./ports";

const LEAVES = "hrms.leaves" as const;
const STRUCTURES = "hrms.leave_structures" as const;

export const leaveMemberNotFound = () =>
  notFound("LEAVE_MEMBER_NOT_FOUND", "This Team Member was not found.");

export type LeaveBalanceRow = LeaveBalance & {
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  accrualMode: AccrualMode;
  isActive: boolean;
  allowAdvanceUse: boolean;
  /** The year's entitlement: the structure line's days or the yearly limit. */
  entitlement: number;
};

export type MemberLeaveBalances = {
  memberId: string;
  memberName: string;
  designationName: string | null;
  leaveYear: string;
  structureId: string | null;
  rows: LeaveBalanceRow[];
};

export type LeaveCreditEntry = {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  kind: LeaveLedgerKind;
  days: number;
  entryDate: CalendarDate;
  periodKey: string | null;
  reason: string | null;
  createdAt: Date;
};

export type InitialiseOutcome = {
  leaveYear: string;
  members: number;
  /** Balances (member × type) opened by this call. */
  initialised: number;
  /** Carry-forward entries posted by this call. */
  carriedForward: number;
};

export type AccrualOutcome = {
  leaveYear: string;
  members: number;
  /** Monthly credits posted by this call. */
  credits: number;
};

const SYSTEM = "system";

/**
 * Leave balances (CM-311): read from the ledger, opened by initialise,
 * credited by monthly accrual, carried into the next year, and adjusted
 * by a manager (Comp Off, ADR CM-0012 §9). Reading your own balances needs
 * `hrms.leaves` read, anyone else's `view_all`; initialise, accrue and
 * adjust need `hrms.leave_structures` update.
 */
export class LeaveBalanceHandlers {
  private readonly entitlements: LeaveEntitlements;

  constructor(
    private readonly types: LeaveTypeStore,
    structures: LeaveStructureStore,
    private readonly employees: EmployeeDirectory,
    private readonly settings: HrmsSettingsReader,
    private readonly queries: LeaveQueries,
    private readonly transactions: LeaveTransactions,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.entitlements = new LeaveEntitlements(types, structures);
  }

  /** The caller's own Team Member; 404 `LEAVE_MEMBER_NOT_FOUND` when they have none. */
  async me(access: MemberAccess): Promise<HrmsEmployee> {
    const me = await this.employees.findByUserId(
      access.workspaceId,
      access.userId,
    );
    if (me == null) throw leaveMemberNotFound();
    return me;
  }

  private async context(workspaceId: string, leaveYear?: string | null) {
    const [settings, today] = await Promise.all([
      this.settings.settingsFor(workspaceId),
      this.queries.today(workspaceId),
    ]);
    return {
      settings,
      today,
      year: resolveLeaveYear(settings, today, leaveYear),
    };
  }

  /** Own member (read) or anyone (view_all). */
  private async target(
    access: MemberAccess,
    memberId: string | undefined,
  ): Promise<HrmsEmployee> {
    assertCan(access, LEAVES, "read");
    const me = await this.employees.findByUserId(
      access.workspaceId,
      access.userId,
    );
    if (memberId == null || memberId === me?.memberId) {
      if (me == null) throw leaveMemberNotFound();
      return me;
    }
    assertCan(access, LEAVES, "view_all");
    const found = (
      await this.employees.find(access.workspaceId, [memberId])
    ).get(memberId);
    if (found == null) throw leaveMemberNotFound();
    return found;
  }

  private async balancesFor(
    workspaceId: string,
    members: readonly HrmsEmployee[],
    year: LeaveYear,
    today: CalendarDate,
  ): Promise<MemberLeaveBalances[]> {
    const memberIds = members.map((member) => member.memberId);
    const [types, entries] = await Promise.all([
      this.types.list(workspaceId),
      this.queries.ledger(workspaceId, { memberIds, leaveYears: [year.key] }),
    ]);
    const entitlements = await this.entitlements.forMembers(
      workspaceId,
      memberIds,
      year,
      today,
      types,
    );
    return members.map((member) => {
      const own = entries.filter((entry) => entry.memberId === member.memberId);
      const plan = entitlements.get(member.memberId);
      const withEntries = new Set(own.map((entry) => entry.leaveTypeId));
      const rows = types
        .filter(
          (type) =>
            withEntries.has(type.id) ||
            (type.isActive && plan?.lines.has(type.id) === true),
        )
        .map((type) => ({
          leaveTypeId: type.id,
          leaveTypeName: type.name,
          isPaid: type.isPaid,
          accrualMode: type.accrualMode,
          isActive: type.isActive,
          allowAdvanceUse: type.allowAdvanceUse,
          entitlement: plan?.lines.get(type.id) ?? type.yearlyLimit,
          ...balanceOf(own.filter((entry) => entry.leaveTypeId === type.id)),
        }));
      return {
        memberId: member.memberId,
        memberName: member.name,
        designationName: member.designationName,
        leaveYear: year.key,
        structureId: plan?.structureId ?? null,
        rows,
      };
    });
  }

  /** One member's balances for a leave year (the current one by default). */
  async memberBalances(
    access: MemberAccess,
    input: { memberId?: string; leaveYear?: string | null },
  ): Promise<MemberLeaveBalances> {
    const member = await this.target(access, input.memberId);
    const { year, today } = await this.context(
      access.workspaceId,
      input.leaveYear,
    );
    const [balances] = await this.balancesFor(
      access.workspaceId,
      [member],
      year,
      today,
    );
    if (balances == null) throw leaveMemberNotFound();
    return balances;
  }

  /** Every active Team Member's balances (`view_all`). */
  async teamBalances(
    access: MemberAccess,
    input: { leaveYear?: string | null },
  ): Promise<{ leaveYear: string; members: MemberLeaveBalances[] }> {
    assertCan(access, LEAVES, "view_all");
    const { year, today } = await this.context(
      access.workspaceId,
      input.leaveYear,
    );
    const members = (await this.employees.list(access.workspaceId)).filter(
      (member) => member.active,
    );
    return {
      leaveYear: year.key,
      members: await this.balancesFor(access.workspaceId, members, year, today),
    };
  }

  /** Initial, accrual, carry-forward and adjustment entries, newest first. */
  async creditHistory(
    access: MemberAccess,
    input: { memberId?: string; leaveYear?: string | null },
  ): Promise<{
    memberId: string;
    leaveYear: string;
    items: LeaveCreditEntry[];
  }> {
    const member = await this.target(access, input.memberId);
    const { year } = await this.context(access.workspaceId, input.leaveYear);
    const [types, entries] = await Promise.all([
      this.types.list(access.workspaceId),
      this.queries.ledger(access.workspaceId, {
        memberIds: [member.memberId],
        leaveYears: [year.key],
        kinds: LEAVE_CREDIT_KINDS,
      }),
    ]);
    const names = new Map(types.map((type) => [type.id, type.name]));
    return {
      memberId: member.memberId,
      leaveYear: year.key,
      items: entries
        .slice()
        .sort(
          (a, b) =>
            b.entryDate.localeCompare(a.entryDate) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map((entry) => ({
          id: entry.id,
          leaveTypeId: entry.leaveTypeId,
          leaveTypeName: names.get(entry.leaveTypeId) ?? "—",
          kind: entry.kind,
          days: entry.days,
          entryDate: entry.entryDate,
          periodKey: entry.periodKey,
          reason: entry.reason,
          createdAt: entry.createdAt,
        })),
    };
  }

  /**
   * Opens the leave year's balances for members (CM-311): an `initial`
   * entry per leave type of their structure (or every active type), with
   * the upfront entitlement or 0, and the carry forward from the year
   * before. Idempotent: balances already opened are left alone.
   */
  async initialise(
    access: MemberAccess,
    input: { memberIds: readonly string[]; leaveYear?: string | null },
  ): Promise<InitialiseOutcome> {
    assertCan(access, STRUCTURES, "update");
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length === 0)
      throw new DomainError(
        "LEAVE_MEMBERS_REQUIRED",
        "Choose at least one Team Member.",
        { details: { field: "memberIds" } },
      );
    const found = await this.employees.find(access.workspaceId, memberIds);
    for (const memberId of memberIds)
      if (!found.has(memberId))
        throw new DomainError(
          "LEAVE_MEMBER_NOT_FOUND",
          "A Team Member was not found.",
          { kind: "not_found", details: { field: "memberIds", memberId } },
        );
    return this.open(
      access.workspaceId,
      memberIds,
      access.userId,
      input.leaveYear,
    );
  }

  /** Initialise every member whose structure in force is `structureId`. */
  async initialiseByStructure(
    access: MemberAccess,
    input: { structureId: string; leaveYear?: string | null },
  ): Promise<InitialiseOutcome> {
    assertCan(access, STRUCTURES, "update");
    const { year, today } = await this.context(
      access.workspaceId,
      input.leaveYear,
    );
    const members = (await this.employees.list(access.workspaceId)).map(
      (member) => member.memberId,
    );
    const plans = await this.entitlements.forMembers(
      access.workspaceId,
      members,
      year,
      today,
    );
    const memberIds = [...plans.values()]
      .filter((plan) => plan.structureId === input.structureId)
      .map((plan) => plan.memberId);
    if (memberIds.length === 0)
      throw new DomainError(
        "LEAVE_STRUCTURE_NOT_ASSIGNED",
        "No Team Member has this structure in this leave year. Assign it first.",
        { details: { field: "structureId" } },
      );
    return this.open(access.workspaceId, memberIds, access.userId, year.key);
  }

  private async open(
    workspaceId: string,
    memberIds: readonly string[],
    by: string,
    leaveYear?: string | null,
  ): Promise<InitialiseOutcome> {
    const { settings, today, year } = await this.context(
      workspaceId,
      leaveYear,
    );
    const types = await this.types.list(workspaceId);
    const plans = await this.entitlements.forMembers(
      workspaceId,
      memberIds,
      year,
      today,
      types,
    );
    const byId = new Map(types.map((type) => [type.id, type]));
    let initialised = 0;
    let carriedForward = 0;
    for (const memberId of memberIds) {
      const plan = plans.get(memberId);
      if (plan == null) continue;
      await this.transactions.run(workspaceId, [memberId], async (tx) => {
        const now = this.clock();
        const existing = await tx.ledger({
          memberIds: [memberId],
          leaveYears: [year.key],
          kinds: ["initial"],
        });
        const opened = new Set(existing.map((entry) => entry.leaveTypeId));
        const entries: NewLedgerEntry[] = [];
        for (const [typeId, entitlement] of plan.lines) {
          const type = byId.get(typeId);
          if (type == null || opened.has(typeId)) continue;
          entries.push({
            memberId,
            leaveTypeId: typeId,
            leaveYear: year.key,
            kind: "initial",
            days: openingCredit(type, entitlement),
            entryDate: plan.start,
            periodKey: null,
            requestId: null,
            reason: null,
            createdBy: by,
          });
        }
        const written = await tx.post(entries);
        const carried = await this.carryForward(tx, {
          memberId,
          types: [...plan.lines.keys()].flatMap((id) => byId.get(id) ?? []),
          settings,
          year,
          by,
        });
        if (written + carried > 0)
          await tx.audit({
            workspaceId,
            actorUserId: by,
            action: "leave_balance.initialised",
            entityType: "leave_balance",
            entityId: memberId,
            after: {
              leaveYear: year.key,
              initial: entries.map((entry) => ({
                leaveTypeId: entry.leaveTypeId,
                days: entry.days,
              })),
              carriedForward: carried,
            },
            occurredAt: now,
          });
        initialised += written;
        carriedForward += carried;
      });
    }
    return {
      leaveYear: year.key,
      members: memberIds.length,
      initialised,
      carriedForward,
    };
  }

  /**
   * Posts the year's carry forward for each type that has none yet (ADR
   * CM-0012 §6). Returns how many entries were written.
   */
  private async carryForward(
    tx: LeaveWork,
    input: {
      memberId: string;
      types: readonly StoredLeaveType[];
      settings: HrmsSettings;
      year: LeaveYear;
      by: string;
    },
  ): Promise<number> {
    const { settings, year, memberId } = input;
    const candidates = input.types.filter((type) => type.carryForward);
    if (!settings.carryForwardEnabled || candidates.length === 0) return 0;
    const previous = previousLeaveYear(year, settings.leaveYear);
    const entries = await tx.ledger({
      memberIds: [memberId],
      leaveTypeIds: candidates.map((type) => type.id),
      leaveYears: [previous.key, year.key],
    });
    const posts: NewLedgerEntry[] = [];
    for (const type of candidates) {
      const own = entries.filter((entry) => entry.leaveTypeId === type.id);
      if (
        own.some(
          (entry) =>
            entry.leaveYear === year.key && entry.kind === "carry_forward",
        )
      )
        continue;
      const old = own.filter((entry) => entry.leaveYear === previous.key);
      const days = carryForwardDays({
        type,
        settings,
        previousAvailable:
          old.length === 0 ? null : sumDays(old.map((entry) => entry.days)),
      });
      if (days == null) continue;
      posts.push({
        memberId,
        leaveTypeId: type.id,
        leaveYear: year.key,
        kind: "carry_forward",
        days,
        entryDate: year.start,
        periodKey: null,
        requestId: null,
        reason: `Carried forward from ${previous.key}`,
        createdBy: input.by,
      });
    }
    return tx.post(posts);
  }

  /**
   * "Accrue now" (CM-311): posts every monthly credit due up to today for
   * the Company's opened balances. 409 `LEAVE_ACCRUAL_DISABLED` while the
   * Settings switch "Credit leave every month" is off.
   */
  async accrue(
    access: MemberAccess,
    input: { leaveYear?: string | null },
  ): Promise<AccrualOutcome> {
    assertCan(access, STRUCTURES, "update");
    const settings = await this.settings.settingsFor(access.workspaceId);
    if (!settings.leaveAccrualEnabled)
      throw conflict(
        "LEAVE_ACCRUAL_DISABLED",
        "Monthly leave credit is off. Turn on “Credit leave every month” in HRMS Settings first.",
      );
    return this.accrueCompany(
      access.workspaceId,
      access.userId,
      input.leaveYear,
    );
  }

  /**
   * The monthly accrual for one Company, also run by the scheduled route
   * (as `system`). Idempotent by period: a period is credited once.
   */
  async accrueCompany(
    workspaceId: string,
    by: string = SYSTEM,
    leaveYear?: string | null,
  ): Promise<AccrualOutcome> {
    const { settings, today, year } = await this.context(
      workspaceId,
      leaveYear,
    );
    if (!settings.leaveAccrualEnabled)
      return { leaveYear: year.key, members: 0, credits: 0 };
    const types = await this.types.list(workspaceId);
    const periodic = new Map(
      types
        .filter((type) => type.accrualMode === "periodic")
        .map((type) => [type.id, type]),
    );
    const opened = (
      await this.queries.initialised(workspaceId, year.key)
    ).filter((row) => periodic.has(row.leaveTypeId));
    const memberIds = [...new Set(opened.map((row) => row.memberId))];
    const plans = await this.entitlements.forMembers(
      workspaceId,
      memberIds,
      year,
      today,
      types,
    );
    let credits = 0;
    for (const memberId of memberIds) {
      const plan = plans.get(memberId);
      const rows = opened.filter((row) => row.memberId === memberId);
      await this.transactions.run(workspaceId, [memberId], async (tx) => {
        const entries = await tx.ledger({
          memberIds: [memberId],
          leaveTypeIds: rows.map((row) => row.leaveTypeId),
          leaveYears: [year.key],
          kinds: ["accrual"],
        });
        const posts: NewLedgerEntry[] = [];
        for (const row of rows) {
          const type = periodic.get(row.leaveTypeId);
          if (type == null) continue;
          const accruals = entries.filter(
            (entry) => entry.leaveTypeId === type.id,
          );
          const due = accrualCredits({
            type,
            entitlement: plan?.lines.get(type.id) ?? type.yearlyLimit,
            fromMonth: monthKeyOf(row.entryDate),
            year,
            today,
            credited: new Set(
              accruals.flatMap((entry) =>
                entry.periodKey == null ? [] : [entry.periodKey],
              ),
            ),
            accruedSoFar: sumDays(accruals.map((entry) => entry.days)),
          });
          for (const credit of due)
            posts.push({
              memberId,
              leaveTypeId: type.id,
              leaveYear: year.key,
              kind: "accrual",
              days: credit.days,
              entryDate: credit.entryDate,
              periodKey: credit.periodKey,
              requestId: null,
              reason: null,
              createdBy: by,
            });
        }
        const written = await tx.post(posts);
        await this.carryForward(tx, {
          memberId,
          types: rows.flatMap((row) => periodic.get(row.leaveTypeId) ?? []),
          settings,
          year,
          by,
        });
        if (written > 0)
          await tx.audit({
            workspaceId,
            actorUserId: by,
            action: "leave_balance.accrued",
            entityType: "leave_balance",
            entityId: memberId,
            after: {
              leaveYear: year.key,
              credits: posts.map((post) => ({
                leaveTypeId: post.leaveTypeId,
                periodKey: post.periodKey,
                days: post.days,
              })),
            },
            occurredAt: this.clock(),
          });
        credits += written;
      });
    }
    return { leaveYear: year.key, members: memberIds.length, credits };
  }

  /** Every Company with monthly credit on (the scheduled route). */
  async accrueAllCompanies(): Promise<{ companies: number; credits: number }> {
    const companies = await this.queries.companiesWithAccrual();
    let credits = 0;
    for (const workspaceId of companies) {
      try {
        credits += (await this.accrueCompany(workspaceId)).credits;
      } catch (error) {
        // One Company's failure must not stop the others; the next run retries.
        console.error("Leave accrual failed for a Company", workspaceId, error);
      }
    }
    return { companies: companies.length, credits };
  }

  /**
   * A manager's adjustment with a reason (ADR CM-0012 §9): credits Comp
   * Off, or corrects a balance. A debit may not take it below zero.
   */
  async adjust(
    access: MemberAccess,
    input: {
      memberId: string;
      leaveTypeId: string;
      leaveYear?: string | null;
      days: number;
      reason: string;
    },
  ): Promise<LeaveBalanceRow> {
    assertCan(access, STRUCTURES, "update");
    const member = (
      await this.employees.find(access.workspaceId, [input.memberId])
    ).get(input.memberId);
    if (member == null)
      throw new DomainError(
        "LEAVE_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
        { kind: "not_found", details: { field: "memberId" } },
      );
    const type = await this.types.find(access.workspaceId, input.leaveTypeId);
    if (type == null)
      throw new DomainError(
        "LEAVE_TYPE_NOT_FOUND",
        "This leave type was not found.",
        { kind: "not_found", details: { field: "leaveTypeId" } },
      );
    const { year, today } = await this.context(
      access.workspaceId,
      input.leaveYear,
    );
    const entries = await this.transactions.run(
      access.workspaceId,
      [member.memberId],
      async (tx) => {
        const own = await tx.ledger({
          memberIds: [member.memberId],
          leaveTypeIds: [type.id],
          leaveYears: [year.key],
        });
        const adjustment = createAdjustment({
          days: input.days,
          reason: input.reason,
          available: balanceOf(own).available,
        });
        const now = this.clock();
        const entry: NewLedgerEntry = {
          memberId: member.memberId,
          leaveTypeId: type.id,
          leaveYear: year.key,
          kind: "adjustment",
          days: adjustment.days,
          entryDate: today,
          periodKey: null,
          requestId: null,
          reason: adjustment.reason,
          createdBy: access.userId,
        };
        await tx.post([entry]);
        await tx.audit({
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "leave_balance.adjusted",
          entityType: "leave_balance",
          entityId: member.memberId,
          before: { available: balanceOf(own).available },
          after: {
            leaveTypeId: type.id,
            leaveYear: year.key,
            days: adjustment.days,
            reason: adjustment.reason,
          },
          occurredAt: now,
        });
        return tx.ledger({
          memberIds: [member.memberId],
          leaveTypeIds: [type.id],
          leaveYears: [year.key],
        });
      },
    );
    const plan = (
      await this.entitlements.forMembers(
        access.workspaceId,
        [member.memberId],
        year,
        today,
      )
    ).get(member.memberId);
    return {
      leaveTypeId: type.id,
      leaveTypeName: type.name,
      isPaid: type.isPaid,
      accrualMode: type.accrualMode,
      isActive: type.isActive,
      allowAdvanceUse: type.allowAdvanceUse,
      entitlement: plan?.lines.get(type.id) ?? type.yearlyLimit,
      ...balanceOf(entries),
    };
  }

  /** Whether the caller may see another member's balances. */
  static canSeeTeam(access: MemberAccess): boolean {
    return can(access, LEAVES, "view_all");
  }
}

export type { StoredLedgerEntry };
