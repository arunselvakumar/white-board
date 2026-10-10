import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  AdvanceDueSource,
  CalculatedSlipWrite,
  SalaryMonthTotals,
  SalaryRunStore,
  SalarySlipComponent,
  SalarySlipDetails,
  SlipVersion,
  StoredSalaryAdvance,
  StoredSalarySlip,
} from "../application/salary-run-ports";
import { daysInMonth, monthKeyOf, type MonthKey } from "../domain/calendar";
import {
  firstRecoveryMonth,
  salarySlipChanged,
  type SalaryAdvanceTerms,
  type SalaryPayment,
} from "../domain/salary-slip";
import {
  companyToday,
  isUniqueViolation,
  lockKey,
  type Tx,
} from "./prisma-calendar-support";

type SlipRow = Prisma.ConstructionHrmsSalarySlipGetPayload<{
  include: { recoveries: true };
}>;

type AdvanceRow = Prisma.ConstructionHrmsSalaryAdvanceGetPayload<object>;

/** Long enough for a Company's whole month in one transaction. */
const RUN_TRANSACTION = { maxWait: 10_000, timeout: 60_000 } as const;

function num(value: Prisma.Decimal): number {
  return value.toNumber();
}

function components(value: Prisma.JsonValue): SalarySlipComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item == null || typeof item !== "object" || Array.isArray(item))
      return [];
    const line = item as Record<string, unknown>;
    return [
      {
        componentId:
          typeof line["componentId"] === "string" ? line["componentId"] : "",
        name: typeof line["name"] === "string" ? line["name"] : "",
        monthly: Number(line["monthly"] ?? 0),
        earned: Number(line["earned"] ?? 0),
      },
    ];
  });
}

function snapshot(value: Prisma.JsonValue): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function details(value: Record<string, unknown>): SalarySlipDetails | null {
  const slip = value["slip"];
  return slip != null && typeof slip === "object" && !Array.isArray(slip)
    ? (slip as SalarySlipDetails)
    : null;
}

function payment(row: SlipRow): SalaryPayment | null {
  if (row.paymentMode == null || row.paymentDate == null) return null;
  return {
    mode: row.paymentMode,
    date: calendarDateFromDb(row.paymentDate),
    reference: row.paymentReference,
  };
}

function advanceFromRow(
  row: AdvanceRow,
  recovered: number,
): StoredSalaryAdvance {
  return {
    id: row.id,
    amount: row.amount,
    instalments: row.instalments,
    advanceDate: calendarDateFromDb(row.advanceDate),
    firstRecoveryMonth: row.firstRecoveryMonth,
    reason: row.reason,
    recovered,
  };
}

function slipFromRow(
  row: SlipRow,
  advance: StoredSalaryAdvance | null,
): StoredSalarySlip {
  const statutory = snapshot(row.statutorySnapshot);
  return {
    id: row.id,
    runId: row.runId,
    memberId: row.memberId,
    month: row.month,
    kind: row.kind,
    status: row.status,
    structureId: row.structureId,
    days: {
      daysInMonth: row.daysInMonth,
      workingDays: num(row.workingDays),
      present: num(row.presentDays),
      halfDays: num(row.halfDays),
      absent: num(row.absentDays),
      paidLeave: num(row.paidLeaveDays),
      unpaidLeave: num(row.unpaidLeaveDays),
      weekOff: num(row.weekOffDays),
      holidays: num(row.holidayDays),
      payable: num(row.payableDays),
      overtimeHours: num(row.overtimeHours),
      totalHours: num(row.totalHours),
    },
    money: {
      baseMonthly: row.baseMonthly,
      overtimePay: row.overtimePay,
      grossEarnings: row.grossEarnings,
      pfEmployee: row.pfEmployee,
      esiEmployee: row.esiEmployee,
      professionalTax: row.professionalTax,
      absentDeduction: row.absentDeduction,
      unpaidLeaveDeduction: row.unpaidLeaveDeduction,
      otherDeductions: row.otherDeductions,
      advanceRecovered: row.advanceRecovered,
      netPayable: row.netPayable,
      pfEmployer: row.pfEmployer,
      epsEmployer: row.epsEmployer,
      esiEmployer: row.esiEmployer,
    },
    components: components(row.components),
    statutorySnapshot: statutory,
    details: details(statutory),
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    paidBy: row.paidBy,
    paidAt: row.paidAt,
    payment: payment(row),
    payslipKey: row.payslipKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recoveries: row.recoveries.map((item) => ({
      advanceId: item.advanceId,
      amount: item.amount,
    })),
    advance,
  };
}

function slipColumns(write: CalculatedSlipWrite) {
  return {
    structureId: write.structureId,
    daysInMonth: write.days.daysInMonth,
    workingDays: write.days.workingDays,
    presentDays: write.days.present,
    absentDays: write.days.absent,
    halfDays: write.days.halfDays,
    paidLeaveDays: write.days.paidLeave,
    unpaidLeaveDays: write.days.unpaidLeave,
    weekOffDays: write.days.weekOff,
    holidayDays: write.days.holidays,
    payableDays: write.days.payable,
    overtimeHours: write.days.overtimeHours,
    totalHours: write.days.totalHours,
    ...write.money,
    components: write.components as unknown as Prisma.InputJsonValue,
    statutorySnapshot: JSON.parse(
      JSON.stringify(write.statutorySnapshot),
    ) as Prisma.InputJsonValue,
  };
}

function auditSummary(write: CalculatedSlipWrite, month: MonthKey) {
  return {
    memberId: write.memberId,
    month,
    payableDays: write.days.payable,
    grossEarnings: write.money.grossEarnings,
    netPayable: write.money.netPayable,
    recoveries: write.recoveries,
  };
}

/**
 * Salary runs in `construction_hrms.salary_runs`, `salary_slips`,
 * `salary_advances`, `salary_advance_recoveries` and `month_locks`
 * (CM-316). Every write is one transaction with its audit events; a
 * month's run is serialised with an advisory lock.
 */
export class PrismaSalaryRunStore implements SalaryRunStore {
  constructor(private readonly db: PrismaClient) {}

  private async attachAdvances(
    db: PrismaClient | Tx,
    workspaceId: string,
    rows: readonly SlipRow[],
  ): Promise<StoredSalarySlip[]> {
    const advanceSlipIds = rows
      .filter((row) => row.kind === "advance")
      .map((row) => row.id);
    const advances =
      advanceSlipIds.length === 0
        ? []
        : await db.constructionHrmsSalaryAdvance.findMany({
            where: { workspaceId, slipId: { in: advanceSlipIds } },
            include: {
              recoveries: {
                where: {
                  slip: {
                    deletedAt: null,
                    status: { in: ["approved", "paid"] },
                  },
                },
                select: { amount: true },
              },
            },
          });
    const bySlip = new Map(
      advances.map((row) => [
        row.slipId,
        advanceFromRow(
          row,
          row.recoveries.reduce((sum, item) => sum + item.amount, 0),
        ),
      ]),
    );
    return rows.map((row) => slipFromRow(row, bySlip.get(row.id) ?? null));
  }

  async listMonth(
    workspaceId: string,
    month: MonthKey,
  ): Promise<StoredSalarySlip[]> {
    const rows = await this.db.constructionHrmsSalarySlip.findMany({
      where: { workspaceId, month, deletedAt: null },
      include: { recoveries: true },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return this.attachAdvances(this.db, workspaceId, rows);
  }

  async listMember(
    workspaceId: string,
    memberId: string,
  ): Promise<StoredSalarySlip[]> {
    const rows = await this.db.constructionHrmsSalarySlip.findMany({
      where: { workspaceId, memberId, deletedAt: null },
      include: { recoveries: true },
      orderBy: [{ month: "desc" }, { kind: "asc" }, { createdAt: "desc" }],
    });
    return this.attachAdvances(this.db, workspaceId, rows);
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredSalarySlip | null> {
    return (await this.findMany(workspaceId, [id])).get(id) ?? null;
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, StoredSalarySlip>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionHrmsSalarySlip.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      include: { recoveries: true },
    });
    const slips = await this.attachAdvances(this.db, workspaceId, rows);
    return new Map(slips.map((slip) => [slip.id, slip]));
  }

  async totals(
    workspaceId: string,
    month: MonthKey,
  ): Promise<SalaryMonthTotals> {
    // Every sum is 64-bit: a month's totals pass ₹2.14 crore (ADR CM-0004).
    const [row] = await this.db.$queryRaw<
      {
        slips: number;
        gross: bigint;
        deductions: bigint;
        net: bigint;
        employer: bigint;
        advances: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE "kind" = 'regular')::int AS "slips",
        COALESCE(SUM("gross_earnings"::bigint) FILTER (WHERE "kind" = 'regular'), 0)::bigint AS "gross",
        COALESCE(SUM("pf_employee"::bigint + "esi_employee"::bigint + "professional_tax"::bigint + "other_deductions"::bigint + "advance_recovered"::bigint) FILTER (WHERE "kind" = 'regular'), 0)::bigint AS "deductions",
        COALESCE(SUM("net_payable"::bigint) FILTER (WHERE "kind" = 'regular'), 0)::bigint AS "net",
        COALESCE(SUM("pf_employer"::bigint + "eps_employer"::bigint + "esi_employer"::bigint) FILTER (WHERE "kind" = 'regular'), 0)::bigint AS "employer",
        COALESCE(SUM("net_payable"::bigint) FILTER (WHERE "kind" = 'advance'), 0)::bigint AS "advances"
      FROM "construction_hrms"."salary_slips"
      WHERE "workspace_id" = ${workspaceId} AND "month" = ${month} AND "deleted_at" IS NULL
    `;
    return {
      slips: row?.slips ?? 0,
      grossEarnings: Number(row?.gross ?? 0n),
      deductions: Number(row?.deductions ?? 0n),
      netPayable: Number(row?.net ?? 0n),
      employerContributions: Number(row?.employer ?? 0n),
      advancesPaid: Number(row?.advances ?? 0n),
    };
  }

  async runExists(workspaceId: string, month: MonthKey): Promise<boolean> {
    const run = await this.db.constructionHrmsSalaryRun.findUnique({
      where: { workspaceId_month: { workspaceId, month } },
      select: { id: true },
    });
    return run != null;
  }

  async periodFirstSlips(
    workspaceId: string,
    memberIds: readonly string[],
    from: MonthKey,
    before: MonthKey,
  ): Promise<Map<string, { month: MonthKey; fullMonthGross: number }>> {
    const result = new Map<
      string,
      { month: MonthKey; fullMonthGross: number }
    >();
    if (memberIds.length === 0 || from >= before) return result;
    const rows = await this.db.constructionHrmsSalarySlip.findMany({
      where: {
        workspaceId,
        memberId: { in: [...memberIds] },
        kind: "regular",
        deletedAt: null,
        month: { gte: from, lt: before },
      },
      select: {
        memberId: true,
        month: true,
        components: true,
        statutorySnapshot: true,
      },
      orderBy: [{ month: "asc" }],
    });
    for (const row of rows) {
      if (result.has(row.memberId)) continue;
      const slip = details(snapshot(row.statutorySnapshot));
      result.set(row.memberId, {
        month: row.month,
        fullMonthGross:
          slip?.fullMonthGross ??
          components(row.components).reduce(
            (sum, line) => sum + line.monthly,
            0,
          ),
      });
    }
    return result;
  }

  async advancesDue(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, AdvanceDueSource[]>> {
    const result = new Map<string, AdvanceDueSource[]>();
    if (memberIds.length === 0) return result;
    const rows = await this.db.constructionHrmsSalaryAdvance.findMany({
      where: {
        workspaceId,
        memberId: { in: [...memberIds] },
        deletedAt: null,
        firstRecoveryMonth: { lte: month },
      },
      include: {
        recoveries: {
          where: { month: { lt: month }, slip: { deletedAt: null } },
          select: { amount: true },
        },
      },
      orderBy: [{ advanceDate: "asc" }, { createdAt: "asc" }],
    });
    for (const row of rows) {
      const recoveredBefore = row.recoveries.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      if (recoveredBefore >= row.amount) continue;
      const list = result.get(row.memberId) ?? [];
      list.push({
        advance: {
          id: row.id,
          amount: row.amount,
          instalments: row.instalments,
          firstRecoveryMonth: row.firstRecoveryMonth,
        },
        recoveredBefore,
      });
      result.set(row.memberId, list);
    }
    return result;
  }

  async salaryStarts(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<Map<string, CalendarDate>> {
    if (memberIds.length === 0) return new Map();
    const rows = await this.db.constructionHrmsEmployeeSalaryConfig.groupBy({
      by: ["memberId"],
      where: { workspaceId, memberId: { in: [...memberIds] }, deletedAt: null },
      _min: { effectiveFrom: true },
    });
    const result = new Map<string, CalendarDate>();
    for (const row of rows)
      if (row._min.effectiveFrom != null)
        result.set(row.memberId, calendarDateFromDb(row._min.effectiveFrom));
    return result;
  }

  async saveCalculated(input: {
    workspaceId: string;
    month: MonthKey;
    writes: readonly CalculatedSlipWrite[];
    by: string;
    now: Date;
  }): Promise<string[]> {
    const { workspaceId, month, by, now } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        await lockKey(tx, `hrms-salary-run:${workspaceId}:${month}`);
        const run =
          (await tx.constructionHrmsSalaryRun.findUnique({
            where: { workspaceId_month: { workspaceId, month } },
            select: { id: true },
          })) ??
          (await tx.constructionHrmsSalaryRun.create({
            data: {
              id: newId(),
              workspaceId,
              month,
              createdAt: now,
              updatedAt: now,
              createdBy: by,
              updatedBy: by,
            },
            select: { id: true },
          }));
        const ids: string[] = [];
        for (const write of input.writes) {
          let id: string;
          if (write.replaces != null) {
            id = write.replaces.id;
            const updated = await tx.constructionHrmsSalarySlip.updateMany({
              where: {
                id,
                workspaceId,
                kind: "regular",
                status: "calculated",
                deletedAt: null,
                updatedAt: write.replaces.updatedAt,
              },
              data: { ...slipColumns(write), updatedAt: now, updatedBy: by },
            });
            if (updated.count === 0) throw salarySlipChanged([id]);
            await tx.constructionHrmsSalaryAdvanceRecovery.deleteMany({
              where: { slipId: id },
            });
          } else {
            id = newId();
            await tx.constructionHrmsSalarySlip.create({
              data: {
                id,
                workspaceId,
                runId: run.id,
                memberId: write.memberId,
                month,
                kind: "regular",
                status: "calculated",
                ...slipColumns(write),
                createdAt: now,
                updatedAt: now,
                createdBy: by,
                updatedBy: by,
              },
            });
          }
          if (write.recoveries.length > 0)
            await tx.constructionHrmsSalaryAdvanceRecovery.createMany({
              data: write.recoveries.map((item) => ({
                id: newId(),
                advanceId: item.advanceId,
                slipId: id,
                month,
                amount: item.amount,
                createdAt: now,
                createdBy: by,
              })),
            });
          await recordAudit(tx, {
            workspaceId,
            actorUserId: by,
            action:
              write.replaces == null
                ? "salary_slip.calculated"
                : "salary_slip.recalculated",
            entityType: "salary_slip",
            entityId: id,
            after: auditSummary(write, month),
            occurredAt: now,
          });
          ids.push(id);
        }
        await tx.constructionHrmsSalaryRun.update({
          where: { id: run.id },
          data: { updatedAt: now, updatedBy: by },
        });
        return ids;
      }, RUN_TRANSACTION);
    } catch (error) {
      // Someone else calculated a member's month meanwhile.
      if (isUniqueViolation(error))
        throw salarySlipChanged(input.writes.map((write) => write.memberId));
      throw error;
    }
  }

  /** Why a guarded update of `id` changed nothing. */
  private static async refused(
    tx: Tx,
    workspaceId: string,
    id: string,
    wanted: "calculated" | "approved",
  ): Promise<never> {
    const row = await tx.constructionHrmsSalarySlip.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { status: true, month: true },
    });
    if (row == null)
      throw notFound(
        "SALARY_SLIP_NOT_FOUND",
        "This salary was not found. It may have been removed.",
      );
    if (wanted === "calculated" && row.status !== "calculated")
      throw conflict(
        "SALARY_SLIP_ALREADY_APPROVED",
        `This salary for ${row.month} is already approved.`,
        { month: row.month, slipIds: [id] },
      );
    if (wanted === "approved" && row.status === "paid")
      throw conflict(
        "SALARY_ALREADY_PAID",
        `This salary for ${row.month} is already paid.`,
        { month: row.month, slipIds: [id] },
      );
    if (wanted === "approved" && row.status === "calculated")
      throw conflict(
        "SALARY_NOT_APPROVED",
        "Approve this salary before marking it paid.",
        { month: row.month, slipIds: [id] },
      );
    throw salarySlipChanged([id]);
  }

  async approve(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    by: string;
    now: Date;
  }): Promise<void> {
    const { workspaceId, by, now } = input;
    await this.db.$transaction(async (tx) => {
      for (const item of input.items) {
        const updated = await tx.constructionHrmsSalarySlip.updateMany({
          where: {
            id: item.id,
            workspaceId,
            kind: "regular",
            status: "calculated",
            deletedAt: null,
            updatedAt: item.expectedUpdatedAt,
          },
          data: {
            status: "approved",
            approvedBy: by,
            approvedAt: now,
            updatedAt: now,
            updatedBy: by,
          },
        });
        if (updated.count === 0)
          await PrismaSalaryRunStore.refused(
            tx,
            workspaceId,
            item.id,
            "calculated",
          );
        const slip = await tx.constructionHrmsSalarySlip.findUniqueOrThrow({
          where: { id: item.id },
          select: { memberId: true, month: true, netPayable: true },
        });
        // ADR CM-0012 §17: the member's month is closed for attendance and leave.
        const lock = await tx.constructionHrmsMonthLock.createMany({
          data: [
            {
              id: newId(),
              workspaceId,
              memberId: slip.memberId,
              month: slip.month,
              slipId: item.id,
              lockedAt: now,
              lockedBy: by,
            },
          ],
          skipDuplicates: true,
        });
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action: "salary_slip.approved",
          entityType: "salary_slip",
          entityId: item.id,
          before: { status: "calculated" },
          after: {
            status: "approved",
            memberId: slip.memberId,
            month: slip.month,
            netPayable: slip.netPayable,
            monthLocked: true,
          },
          occurredAt: now,
        });
        if (lock.count > 0)
          await recordAudit(tx, {
            workspaceId,
            actorUserId: by,
            action: "month_lock.created",
            entityType: "month_lock",
            entityId: `${slip.memberId}:${slip.month}`,
            after: {
              memberId: slip.memberId,
              month: slip.month,
              slipId: item.id,
            },
            occurredAt: now,
          });
      }
    }, RUN_TRANSACTION);
  }

  async markPaid(input: {
    workspaceId: string;
    items: readonly SlipVersion[];
    payment: SalaryPayment;
    by: string;
    now: Date;
  }): Promise<void> {
    const { workspaceId, payment, by, now } = input;
    await this.db.$transaction(async (tx) => {
      for (const item of input.items) {
        const updated = await tx.constructionHrmsSalarySlip.updateMany({
          where: {
            id: item.id,
            workspaceId,
            kind: "regular",
            status: "approved",
            deletedAt: null,
            updatedAt: item.expectedUpdatedAt,
          },
          data: {
            status: "paid",
            paidBy: by,
            paidAt: now,
            paymentMode: payment.mode,
            paymentDate: calendarDateToDb(payment.date),
            paymentReference: payment.reference,
            updatedAt: now,
            updatedBy: by,
          },
        });
        if (updated.count === 0)
          await PrismaSalaryRunStore.refused(
            tx,
            workspaceId,
            item.id,
            "approved",
          );
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action: "salary_slip.paid",
          entityType: "salary_slip",
          entityId: item.id,
          before: { status: "approved" },
          after: { status: "paid", ...payment },
          occurredAt: now,
        });
      }
    }, RUN_TRANSACTION);
  }

  async payAdvance(input: {
    workspaceId: string;
    memberId: string;
    terms: SalaryAdvanceTerms;
    by: string;
    now: Date;
  }): Promise<string> {
    const { workspaceId, memberId, terms, by, now } = input;
    const month = monthKeyOf(terms.advanceDate);
    return this.db.$transaction(async (tx) => {
      await lockKey(tx, `hrms-salary-run:${workspaceId}:${month}`);
      const regular = await tx.constructionHrmsSalarySlip.findFirst({
        where: {
          workspaceId,
          memberId,
          month,
          kind: "regular",
          deletedAt: null,
        },
        select: { status: true },
      });
      const recoverFrom = firstRecoveryMonth(
        terms.advanceDate,
        regular != null && regular.status !== "calculated",
      );
      const slipId = newId();
      const advanceId = newId();
      await tx.constructionHrmsSalarySlip.create({
        data: {
          id: slipId,
          workspaceId,
          runId: null,
          memberId,
          month,
          kind: "advance",
          status: "paid",
          daysInMonth: daysInMonth(month),
          netPayable: terms.amount,
          approvedBy: by,
          approvedAt: now,
          paidBy: by,
          paidAt: now,
          paymentMode: terms.payment.mode,
          paymentDate: calendarDateToDb(terms.payment.date),
          paymentReference: terms.payment.reference,
          createdAt: now,
          updatedAt: now,
          createdBy: by,
          updatedBy: by,
        },
      });
      await tx.constructionHrmsSalaryAdvance.create({
        data: {
          id: advanceId,
          workspaceId,
          memberId,
          slipId,
          amount: terms.amount,
          instalments: terms.instalments,
          advanceDate: calendarDateToDb(terms.advanceDate),
          firstRecoveryMonth: recoverFrom,
          reason: terms.reason,
          createdAt: now,
          updatedAt: now,
          createdBy: by,
          updatedBy: by,
        },
      });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "salary_advance.paid",
        entityType: "salary_advance",
        entityId: advanceId,
        after: {
          memberId,
          slipId,
          amount: terms.amount,
          instalments: terms.instalments,
          advanceDate: terms.advanceDate,
          firstRecoveryMonth: recoverFrom,
          reason: terms.reason,
          payment: terms.payment,
        },
        occurredAt: now,
      });
      return slipId;
    });
  }

  async autoSalaryCompanies(): Promise<{ workspaceId: string; day: number }[]> {
    const rows = await this.db.constructionHrmsSettings.findMany({
      where: {
        autoSalaryCalculation: true,
        salaryCalculationDay: { not: null },
      },
      select: { workspaceId: true, salaryCalculationDay: true },
      orderBy: { workspaceId: "asc" },
    });
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      day: row.salaryCalculationDay ?? 1,
    }));
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId);
  }
}
