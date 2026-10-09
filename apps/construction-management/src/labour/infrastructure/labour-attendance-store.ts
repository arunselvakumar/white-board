import { Prisma, type PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCanCreate,
  assertCanEdit,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  AttendanceLabourer,
  LabourAttendanceActor,
  LabourAttendanceBackdatedGuard,
  LabourAttendanceStore,
  LabourDayListParams,
  StoredLabourDay,
} from "../application/labour-attendance-handlers";
import { dayLedgerEntries, type PricedDay } from "../domain/labour-attendance";
import type { Weekday } from "../domain/wages";
import { projectsOn } from "./labour-project-on";
import { companyToday, PrismaLabourQueries } from "./prisma-labour-queries";
import { prismaLedger } from "./prisma-ledger";

const INCLUDE = {
  overtime: { orderBy: { id: "asc" } },
} as const satisfies Prisma.ConstructionLabourAttendanceInclude;

type Row = Prisma.ConstructionLabourAttendanceGetPayload<{
  include: typeof INCLUDE;
}>;

type LabourRow = Prisma.ConstructionLabourLabourGetPayload<object>;

function toStored(row: Row): StoredLabourDay {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    labourId: row.labourId,
    date: calendarDateFromDb(row.attendanceDate),
    status: row.status,
    isPaidLeave: row.isPaidLeave,
    shift: row.shift,
    supervisorId: row.supervisorId,
    wageType: row.wageType,
    wageRate: row.wageRate,
    earned: row.earned,
    overtime: row.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId,
      hours: line.hours.toString(),
      ratePerHour: line.ratePerHour,
      amount: line.amount,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toLabourer(row: {
  id: string;
  name: string;
  labourCode: string | null;
  isActive?: boolean;
  labourCategoryId: string | null;
  supervisorId: string | null;
  weeklyHolidays: number[];
  wageType: LabourRow["wageType"];
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
}): AttendanceLabourer {
  return {
    id: row.id,
    name: row.name,
    labourCode: row.labourCode,
    isActive: row.isActive ?? true,
    labourCategoryId: row.labourCategoryId,
    supervisorId: row.supervisorId,
    weeklyHolidays: row.weeklyHolidays as Weekday[],
    card: {
      wageType: row.wageType,
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
    },
  };
}

function changed(labourId: string) {
  return conflict(
    "ATTENDANCE_CHANGED",
    "Someone changed this Labour's day after you opened it. Reload to see the latest.",
    { labourId },
  );
}

/** What the audit log keeps of a day. */
function snapshot(day: PricedDay) {
  return {
    labourId: day.labourId,
    projectId: day.projectId,
    date: day.date,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift,
    supervisorId: day.supervisorId,
    wageType: day.wageType,
    wageRate: day.wageRate,
    earned: day.earned,
    overtime: day.overtime,
  };
}

function rowData(day: PricedDay) {
  return {
    projectId: day.projectId,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift,
    supervisorId: day.supervisorId,
    wageType: day.wageType,
    wageRate: day.wageRate,
    earned: day.earned,
  };
}

/**
 * Labour attendance in `construction_labour` (CM-210): one live row per
 * labourer per date (partial unique index), overtime lines in id order, and
 * the labour ledger in the same transaction (ADR CM-0004).
 */
export class PrismaLabourAttendanceStore implements LabourAttendanceStore {
  private readonly queries: PrismaLabourQueries;

  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.queries = new PrismaLabourQueries(db, clock);
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId, this.clock());
  }

  async labourers(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, AttendanceLabourer>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
    });
    return new Map(rows.map((row) => [row.id, toLabourer(row)]));
  }

  projectsOn(
    _workspaceId: string,
    ids: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, string>> {
    // Ids come from `labourers`, already scoped to the Company.
    return projectsOn(this.db, ids, date);
  }

  async labourersOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<AttendanceLabourer[]> {
    const options = await this.queries.options(workspaceId, projectId, date);
    return options.map((option) => toLabourer(option));
  }

  async daysOf(
    workspaceId: string,
    labourIds: readonly string[],
    date: CalendarDate,
  ): Promise<StoredLabourDay[]> {
    if (labourIds.length === 0) return [];
    const rows = await this.db.constructionLabourAttendance.findMany({
      where: {
        workspaceId,
        labourId: { in: [...new Set(labourIds)] },
        attendanceDate: calendarDateToDb(date),
        deletedAt: null,
      },
      include: INCLUDE,
    });
    return rows.map(toStored);
  }

  async findById(
    workspaceId: string,
    id: string,
  ): Promise<StoredLabourDay | null> {
    const row = await this.db.constructionLabourAttendance.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toStored(row);
  }

  async daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredLabourDay[]> {
    const rows = await this.db.constructionLabourAttendance.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        attendanceDate: {
          gte: calendarDateToDb(from),
          lte: calendarDateToDb(to),
        },
      },
      include: INCLUDE,
      orderBy: [{ attendanceDate: "asc" }, { id: "asc" }],
    });
    return rows.map(toStored);
  }

  async list(
    params: LabourDayListParams,
  ): Promise<{ items: StoredLabourDay[]; total: number; hasMore: boolean }> {
    const filters: Prisma.ConstructionLabourAttendanceWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
      },
    ];
    if (params.from != null)
      filters.push({ attendanceDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ attendanceDate: { lte: calendarDateToDb(params.to) } });
    if (params.labourId != null) filters.push({ labourId: params.labourId });
    if (params.supervisorId != null)
      filters.push({ supervisorId: params.supervisorId });
    if (params.status === "paid_leave")
      filters.push({ status: "on_leave", isPaidLeave: true });
    else if (params.status != null) filters.push({ status: params.status });

    // Newest date first, then id; `after` pages to older days.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await this.db.constructionLabourAttendance.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { attendanceDate: { gt: cursor.createdAt } },
                        {
                          attendanceDate: cursor.createdAt,
                          id: { gt: cursor.id },
                        },
                      ]
                    : [
                        { attendanceDate: { lt: cursor.createdAt } },
                        {
                          attendanceDate: cursor.createdAt,
                          id: { lt: cursor.id },
                        },
                      ],
                },
              ],
      },
      include: INCLUDE,
      orderBy: backwards
        ? [{ attendanceDate: "asc" }, { id: "asc" }]
        : [{ attendanceDate: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionLabourAttendance.count({
      where: { AND: filters },
    });
    return { items: rows.map(toStored), total, hasMore };
  }

  async save(
    input: Parameters<LabourAttendanceStore["save"]>[0],
  ): Promise<void> {
    const { workspaceId, by, now } = input;
    await this.db.$transaction(async (tx) => {
      const start = now.getTime();
      let step = 0;
      for (const write of input.writes) {
        const { day } = write;
        let before: StoredLabourDay | null = null;
        if (write.expectedUpdatedAt == null) {
          try {
            await tx.constructionLabourAttendance.create({
              data: {
                id: write.id,
                workspaceId,
                labourId: day.labourId,
                attendanceDate: calendarDateToDb(day.date),
                ...rowData(day),
                createdAt: now,
                updatedAt: now,
                createdBy: by,
                updatedBy: by,
              },
            });
          } catch (error) {
            // The live-day unique index: someone marked this day meanwhile.
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            )
              throw changed(day.labourId);
            throw error;
          }
        } else {
          const row = await tx.constructionLabourAttendance.findFirst({
            where: { id: write.id, workspaceId, deletedAt: null },
            include: INCLUDE,
          });
          if (row == null) throw changed(day.labourId);
          before = toStored(row);
          // Compare-and-set on updatedAt: a stale save changes no row.
          const updated = await tx.constructionLabourAttendance.updateMany({
            where: {
              id: write.id,
              workspaceId,
              deletedAt: null,
              updatedAt: write.expectedUpdatedAt,
            },
            data: { ...rowData(day), updatedAt: now, updatedBy: by },
          });
          if (updated.count === 0) throw changed(day.labourId);
          await tx.constructionLabourOvertime.deleteMany({
            where: { attendanceId: write.id },
          });
        }
        if (day.overtime.length > 0)
          await tx.constructionLabourOvertime.createMany({
            data: day.overtime.map((line) => ({
              id: newId(start + step++),
              attendanceId: write.id,
              labourCategoryId: line.labourCategoryId,
              hours: line.hours,
              ratePerHour: line.ratePerHour,
              amount: line.amount,
            })),
          });
        await prismaLedger.reverseSource(
          tx,
          workspaceId,
          by,
          "labour_attendance",
          write.id,
        );
        await prismaLedger.post(
          tx,
          workspaceId,
          by,
          dayLedgerEntries(day, write.id),
        );
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action:
            input.reason === "paid_leave"
              ? "labour_attendance.paid_leave_changed"
              : before == null
                ? "labour_attendance.marked"
                : "labour_attendance.updated",
          entityType: "labour_attendance",
          entityId: write.id,
          before: before == null ? undefined : snapshot(before),
          after: snapshot(day),
          occurredAt: now,
        });
      }
    });
  }

  async clear(
    input: Parameters<LabourAttendanceStore["clear"]>[0],
  ): Promise<void> {
    const { workspaceId, by, now } = input;
    await this.db.$transaction(async (tx) => {
      for (const { day, expectedUpdatedAt } of input.days) {
        const updated = await tx.constructionLabourAttendance.updateMany({
          where: {
            id: day.id,
            workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            deletedAt: now,
            deletedBy: by,
            updatedAt: now,
            updatedBy: by,
          },
        });
        if (updated.count === 0) {
          const live = await tx.constructionLabourAttendance.count({
            where: { id: day.id, deletedAt: null },
          });
          if (live === 0)
            throw notFound(
              "ATTENDANCE_NOT_FOUND",
              "This attendance was not found.",
            );
          throw changed(day.labourId);
        }
        await prismaLedger.reverseSource(
          tx,
          workspaceId,
          by,
          "labour_attendance",
          day.id,
        );
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action: "labour_attendance.cleared",
          entityType: "labour_attendance",
          entityId: day.id,
          before: snapshot(day),
          occurredAt: now,
        });
      }
    });
  }

  async labourNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { name: string; labourCode: string | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, labourCode: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { name: row.name, labourCode: row.labourCode },
      ]),
    );
  }

  async categoryOptions(
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db.constructionMastersLabourCategory.findMany({
      where: { workspaceId, deletedAt: null, disabledAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
}

/** The kernel's back-dated entry policy for `labour_attendance`. */
export class PrismaLabourAttendanceBackdatedGuard implements LabourAttendanceBackdatedGuard {
  constructor(
    private readonly db: PrismaClient,
    private readonly today: (workspaceId: string) => Promise<CalendarDate>,
  ) {}

  async assert(
    action: "create" | "edit",
    actor: LabourAttendanceActor,
    date: CalendarDate,
  ): Promise<void> {
    const [policy, who, today] = await Promise.all([
      loadBackdatedPolicy(this.db, actor.workspaceId),
      loadBackdatedActor(this.db, actor),
      this.today(actor.workspaceId),
    ]);
    if (action === "create")
      assertCanCreate(policy, "labour_attendance", date, who, today);
    else assertCanEdit(policy, "labour_attendance", date, who, today);
  }
}
