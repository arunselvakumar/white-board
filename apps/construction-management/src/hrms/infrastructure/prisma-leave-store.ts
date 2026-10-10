import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  LedgerFilter,
  LeaveQueries,
  LeaveRequestListFilter,
  LeaveRequestUpdate,
  LeaveTransactions,
  LeaveWork,
  NewLedgerEntry,
  StoredLedgerEntry,
  StoredLeaveDecision,
  StoredLeaveRequest,
} from "../application/leave-ports";
import type { LeaveDayPlan } from "../domain/leave-request";
import { LIVE_LEAVE_STATUSES } from "../domain/leave-request";

type Db = PrismaClient | Prisma.TransactionClient;

const REQUEST_INCLUDE = {
  days: { orderBy: { leaveDate: "asc" } },
  decisions: { orderBy: { decidedAt: "asc" } },
} as const satisfies Prisma.ConstructionHrmsLeaveRequestInclude;

type RequestRow = Prisma.ConstructionHrmsLeaveRequestGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

type LedgerRow = Prisma.ConstructionHrmsLeaveLedgerEntryGetPayload<object>;

function ledgerFromRow(row: LedgerRow): StoredLedgerEntry {
  return {
    id: row.id,
    memberId: row.memberId,
    leaveTypeId: row.leaveTypeId,
    leaveYear: row.leaveYear,
    kind: row.kind,
    days: row.days.toNumber(),
    entryDate: calendarDateFromDb(row.entryDate),
    periodKey: row.periodKey,
    requestId: row.requestId,
    reason: row.reason,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function requestFromRow(row: RequestRow): StoredLeaveRequest {
  return {
    id: row.id,
    memberId: row.memberId,
    leaveTypeId: row.leaveTypeId,
    fromDate: calendarDateFromDb(row.fromDate),
    toDate: calendarDateFromDb(row.toDate),
    totalDays: row.totalDays.toNumber(),
    leaveYear: row.leaveYear,
    reason: row.reason,
    status: row.status,
    approvalLevels: row.approvalLevels,
    currentLevel: row.currentLevel,
    approvalRemarks: row.approvalRemarks,
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
    appliedByMemberId: row.appliedByMemberId,
    days: row.days.map((day) => ({
      date: calendarDateFromDb(day.leaveDate),
      session: day.session,
    })),
    decisions: row.decisions.map((decision): StoredLeaveDecision => ({
      stage: decision.stage,
      level: decision.level,
      outcome: decision.outcome,
      remarks: decision.remarks,
      deciderMemberId: decision.deciderMemberId,
      decidedAt: decision.decidedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function ledgerWhere(
  workspaceId: string,
  filter: LedgerFilter,
): Prisma.ConstructionHrmsLeaveLedgerEntryWhereInput {
  return {
    workspaceId,
    ...(filter.memberIds == null
      ? {}
      : { memberId: { in: [...filter.memberIds] } }),
    ...(filter.leaveTypeIds == null
      ? {}
      : { leaveTypeId: { in: [...filter.leaveTypeIds] } }),
    ...(filter.leaveYears == null
      ? {}
      : { leaveYear: { in: [...filter.leaveYears] } }),
    ...(filter.kinds == null ? {} : { kind: { in: [...filter.kinds] } }),
  };
}

async function readLedger(
  db: Db,
  workspaceId: string,
  filter: LedgerFilter,
): Promise<StoredLedgerEntry[]> {
  if (
    filter.memberIds?.length === 0 ||
    filter.leaveTypeIds?.length === 0 ||
    filter.leaveYears?.length === 0
  )
    return [];
  const rows = await db.constructionHrmsLeaveLedgerEntry.findMany({
    where: ledgerWhere(workspaceId, filter),
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
  });
  return rows.map(ledgerFromRow);
}

function requestWhere(
  workspaceId: string,
  filter: Omit<LeaveRequestListFilter, "limit">,
): Prisma.ConstructionHrmsLeaveRequestWhereInput {
  return {
    workspaceId,
    ...(filter.memberIds == null
      ? {}
      : { memberId: { in: [...filter.memberIds] } }),
    ...(filter.statuses == null
      ? {}
      : { status: { in: [...filter.statuses] } }),
    ...(filter.from == null && filter.to == null
      ? {}
      : {
          days: {
            some: {
              leaveDate: {
                ...(filter.from == null
                  ? {}
                  : { gte: calendarDateToDb(filter.from) }),
                ...(filter.to == null
                  ? {}
                  : { lte: calendarDateToDb(filter.to) }),
              },
            },
          },
        }),
  };
}

/** Today in the Company's time zone (Asia/Kolkata when unset or unknown). */
export async function companyLeaveToday(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<CalendarDate> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  try {
    return todayIn(profile?.timezone ?? "Asia/Kolkata", now);
  } catch {
    return todayIn("Asia/Kolkata", now);
  }
}

/** Lock-free reads of leave (CM-311 … CM-313). */
export class PrismaLeaveQueries implements LeaveQueries {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  ledger(workspaceId: string, filter: LedgerFilter) {
    return readLedger(this.db, workspaceId, filter);
  }

  async request(
    workspaceId: string,
    id: string,
  ): Promise<StoredLeaveRequest | null> {
    const row = await this.db.constructionHrmsLeaveRequest.findFirst({
      where: { id, workspaceId },
      include: REQUEST_INCLUDE,
    });
    return row == null ? null : requestFromRow(row);
  }

  async requests(
    workspaceId: string,
    filter: LeaveRequestListFilter,
  ): Promise<{ items: StoredLeaveRequest[]; total: number }> {
    if (filter.memberIds?.length === 0 || filter.statuses?.length === 0)
      return { items: [], total: 0 };
    const where = requestWhere(workspaceId, filter);
    const [rows, total] = await Promise.all([
      filter.limit === 0
        ? Promise.resolve([])
        : this.db.constructionHrmsLeaveRequest.findMany({
            where,
            include: REQUEST_INCLUDE,
            orderBy: [{ fromDate: "desc" }, { id: "desc" }],
            take: filter.limit,
          }),
      this.db.constructionHrmsLeaveRequest.count({ where }),
    ]);
    return { items: rows.map(requestFromRow), total };
  }

  async initialised(
    workspaceId: string,
    leaveYear: string,
  ): Promise<
    { memberId: string; leaveTypeId: string; entryDate: CalendarDate }[]
  > {
    const rows = await this.db.constructionHrmsLeaveLedgerEntry.findMany({
      where: { workspaceId, leaveYear, kind: "initial", reversesEntryId: null },
      select: { memberId: true, leaveTypeId: true, entryDate: true },
      orderBy: [{ memberId: "asc" }, { leaveTypeId: "asc" }],
    });
    return rows.map((row) => ({
      memberId: row.memberId,
      leaveTypeId: row.leaveTypeId,
      entryDate: calendarDateFromDb(row.entryDate),
    }));
  }

  async companiesWithAccrual(): Promise<string[]> {
    const rows = await this.db.constructionHrmsSettings.findMany({
      where: { leaveAccrualEnabled: true },
      select: { workspaceId: true },
      orderBy: { workspaceId: "asc" },
    });
    return rows.map((row) => row.workspaceId);
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyLeaveToday(this.db, workspaceId, this.clock());
  }
}

const requestChanged = () =>
  conflict(
    "LEAVE_REQUEST_CHANGED",
    "Someone else acted on this request after you opened it. Reload to see what changed.",
  );

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

class PrismaLeaveWork implements LeaveWork {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly workspaceId: string,
  ) {}

  ledger(filter: LedgerFilter) {
    return readLedger(this.tx, this.workspaceId, filter);
  }

  async post(entries: readonly NewLedgerEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const now = Date.now();
    // ON CONFLICT DO NOTHING: an accrual period, a year's initial credit
    // and a year's carry forward already posted are skipped (partial
    // unique indexes), which makes initialise and accrue idempotent.
    const created = await this.tx.constructionHrmsLeaveLedgerEntry.createMany({
      data: entries.map((entry) => ({
        id: newId(now),
        workspaceId: this.workspaceId,
        memberId: entry.memberId,
        leaveTypeId: entry.leaveTypeId,
        leaveYear: entry.leaveYear,
        kind: entry.kind,
        days: entry.days.toFixed(2),
        entryDate: calendarDateToDb(entry.entryDate),
        periodKey: entry.periodKey,
        requestId: entry.requestId,
        reason: entry.reason,
        createdBy: entry.createdBy,
      })),
      skipDuplicates: true,
    });
    return created.count;
  }

  async liveDays(
    memberId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<LeaveDayPlan[]> {
    const rows = await this.tx.constructionHrmsLeaveRequestDay.findMany({
      where: {
        leaveDate: { gte: calendarDateToDb(from), lte: calendarDateToDb(to) },
        request: {
          workspaceId: this.workspaceId,
          memberId,
          status: { in: [...LIVE_LEAVE_STATUSES] },
        },
      },
      select: { leaveDate: true, session: true },
    });
    return rows.map((row) => ({
      date: calendarDateFromDb(row.leaveDate),
      session: row.session,
    }));
  }

  async findRequest(id: string): Promise<StoredLeaveRequest | null> {
    const row = await this.tx.constructionHrmsLeaveRequest.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: REQUEST_INCLUDE,
    });
    return row == null ? null : requestFromRow(row);
  }

  async insertRequest(
    request: Omit<StoredLeaveRequest, "decisions" | "createdAt" | "updatedAt">,
    by: string,
    now: Date,
  ): Promise<void> {
    await this.tx.constructionHrmsLeaveRequest.create({
      data: {
        id: request.id,
        workspaceId: this.workspaceId,
        memberId: request.memberId,
        leaveTypeId: request.leaveTypeId,
        fromDate: calendarDateToDb(request.fromDate),
        toDate: calendarDateToDb(request.toDate),
        totalDays: request.totalDays.toFixed(1),
        leaveYear: request.leaveYear,
        reason: request.reason,
        status: request.status,
        approvalLevels: request.approvalLevels,
        currentLevel: request.currentLevel,
        approvalRemarks: request.approvalRemarks,
        rejectionReason: request.rejectionReason,
        cancellationReason: request.cancellationReason,
        appliedByMemberId: request.appliedByMemberId,
        createdAt: now,
        updatedAt: now,
        createdBy: by,
        updatedBy: by,
      },
    });
    await this.tx.constructionHrmsLeaveRequestDay.createMany({
      data: request.days.map((day) => ({
        id: newId(now.getTime()),
        requestId: request.id,
        leaveDate: calendarDateToDb(day.date),
        session: day.session,
      })),
    });
  }

  async updateRequest(
    id: string,
    expectedUpdatedAt: Date,
    update: LeaveRequestUpdate,
  ): Promise<void> {
    const updated = await this.tx.constructionHrmsLeaveRequest.updateMany({
      where: {
        id,
        workspaceId: this.workspaceId,
        updatedAt: expectedUpdatedAt,
      },
      data: update,
    });
    if (updated.count === 0) throw requestChanged();
  }

  async insertDecision(
    requestId: string,
    decision: StoredLeaveDecision,
    by: string,
  ): Promise<void> {
    try {
      // The level's unique index: a second approver of the same level loses.
      await this.tx.constructionHrmsLeaveDecision.create({
        data: {
          id: newId(decision.decidedAt.getTime()),
          workspaceId: this.workspaceId,
          requestId,
          stage: decision.stage,
          level: decision.level,
          outcome: decision.outcome,
          remarks: decision.remarks,
          deciderMemberId: decision.deciderMemberId,
          decidedBy: by,
          decidedAt: decision.decidedAt,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw requestChanged();
      throw error;
    }
  }

  audit(event: Parameters<LeaveWork["audit"]>[0]): Promise<void> {
    return recordAudit(this.tx, event);
  }
}

/**
 * Leave writes in one transaction holding a transaction-scoped advisory
 * lock per member (in sorted order, so two writers never deadlock): a
 * balance check and the posting it guards cannot interleave with another
 * write for the same member.
 */
export class PrismaLeaveTransactions implements LeaveTransactions {
  constructor(private readonly db: PrismaClient) {}

  run<T>(
    workspaceId: string,
    memberIds: readonly string[],
    work: (tx: LeaveWork) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        for (const memberId of [...new Set(memberIds)].sort())
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`construction_hrms.leave:${memberId}`}, 0))
          `;
        return work(new PrismaLeaveWork(tx, workspaceId));
      },
      { timeout: 20_000 },
    );
  }
}
