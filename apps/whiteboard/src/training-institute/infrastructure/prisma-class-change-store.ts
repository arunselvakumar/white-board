import { Prisma, type PrismaClient } from "@repo/db";

import type {
  ChangeableBatch,
  ClassChangeStore,
  ClassExceptions,
  ClassExceptionsReader,
  ClassSlotKey,
} from "../application/class-change-handlers";
import { ClassChange } from "../domain/class-change";
import { localNow } from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import { Holiday } from "../domain/holiday";
import { WeeklyTimings } from "../domain/weekly-timings";
import { lockBatchSchedule, lockWorkspaceSchedule } from "./schedule-locks";

type Db = PrismaClient | Prisma.TransactionClient;

const dateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

type ChangeRow = NonNullable<
  Awaited<ReturnType<PrismaClient["trainingInstituteClassChange"]["findFirst"]>>
>;
type HolidayRow = NonNullable<
  Awaited<ReturnType<PrismaClient["trainingInstituteHoliday"]["findFirst"]>>
>;

function toChange(row: ChangeRow): ClassChange {
  return ClassChange.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    batchId: row.batchId,
    date: dateKey(row.classDate),
    startTime: row.startTime,
    endTime: row.endTime,
    kind: row.kind,
    reason: row.reason,
    movedTo:
      row.movedToDate != null &&
      row.movedToStartTime != null &&
      row.movedToEndTime != null
        ? {
            date: dateKey(row.movedToDate),
            startTime: row.movedToStartTime,
            endTime: row.movedToEndTime,
          }
        : null,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
  });
}

function toHoliday(row: HolidayRow): Holiday {
  return Holiday.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    startDate: dateKey(row.startDate),
    endDate: dateKey(row.endDate),
    reason: row.reason,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
  });
}

function changeConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    throw new DomainError(
      "CLASS_CHANGE_CONFLICT",
      "This Class was just changed by someone else. Refresh and try again.",
    );
  throw error;
}

const batchSelect = {
  id: true,
  timezone: true,
  timings: true,
  closedAt: true,
  createdAt: true,
  enrollments: {
    where: {
      deletedAt: null,
      endedAt: null,
      timingSource: "student" as const,
      student: { deletedAt: null, droppedAt: null },
    },
    select: { id: true, studentTimings: true },
  },
} satisfies Prisma.TrainingInstituteBatchSelect;

function toChangeableBatch(
  row: Prisma.TrainingInstituteBatchGetPayload<{ select: typeof batchSelect }>,
): ChangeableBatch {
  const firstDate = localNow(row.createdAt, row.timezone).date;
  return {
    id: row.id,
    timezone: row.timezone,
    closed: row.closedAt != null,
    sources: [
      {
        batchId: row.id,
        timings: WeeklyTimings.create(row.timings).slots,
        firstDate,
      },
      ...row.enrollments.map((enrollment) => ({
        batchId: row.id,
        enrollmentId: enrollment.id,
        timings: WeeklyTimings.create(enrollment.studentTimings).slots,
        firstDate,
      })),
    ],
  };
}

export class PrismaClassExceptionsReader implements ClassExceptionsReader {
  constructor(private readonly db: PrismaClient) {}

  async forBatches(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassExceptions> {
    const [changes, holidays] = await Promise.all([
      batchIds.length === 0
        ? []
        : this.db.trainingInstituteClassChange.findMany({
            where: {
              workspaceId,
              batchId: { in: [...new Set(batchIds)] },
              deletedAt: null,
            },
            orderBy: [{ classDate: "asc" }, { startTime: "asc" }],
          }),
      this.db.trainingInstituteHoliday.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: [{ startDate: "asc" }],
      }),
    ]);
    return {
      changes: changes.map((row) => toChange(row).toFact()),
      holidays: holidays.map((row) => toHoliday(row).toFact()),
    };
  }
}

export class PrismaClassChangeStore implements ClassChangeStore {
  constructor(private readonly db: Db) {}

  /** Runs writes in the current transaction, or a new one outside a lock. */
  private write<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return "$transaction" in this.db
      ? this.db.$transaction(work)
      : work(this.db);
  }

  private transaction<T>(
    lock: (tx: Prisma.TransactionClient) => Promise<void>,
    work: (store: ClassChangeStore) => Promise<T>,
  ): Promise<T> {
    if (!("$transaction" in this.db))
      throw new Error("Schedule locks can't be nested.");
    return this.db.$transaction(async (tx) => {
      await lock(tx);
      return work(new PrismaClassChangeStore(tx));
    });
  }

  withBatchLock<T>(
    workspaceId: string,
    batchId: string,
    work: (store: ClassChangeStore) => Promise<T>,
  ): Promise<T> {
    return this.transaction(
      (tx) => lockBatchSchedule(tx, workspaceId, batchId),
      work,
    );
  }

  withWorkspaceLock<T>(
    workspaceId: string,
    work: (store: ClassChangeStore) => Promise<T>,
  ): Promise<T> {
    return this.transaction(
      (tx) => lockWorkspaceSchedule(tx, workspaceId),
      work,
    );
  }

  async findBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<ChangeableBatch | null> {
    const row = await this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
      select: batchSelect,
    });
    return row == null ? null : toChangeableBatch(row);
  }

  async openBatches(workspaceId: string): Promise<ChangeableBatch[]> {
    const rows = await this.db.trainingInstituteBatch.findMany({
      where: { workspaceId, deletedAt: null, closedAt: null },
      select: batchSelect,
    });
    return rows.map(toChangeableBatch);
  }

  async isAssignedTeacher(
    workspaceId: string,
    batchId: string,
    userId: string,
  ): Promise<boolean> {
    const teacher = await this.db.trainingInstituteTeacher.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
        deactivatedAt: null,
        batchAssignments: {
          some: { batchId, workspaceId, unassignedAt: null, deletedAt: null },
        },
      },
      select: { id: true },
    });
    return teacher != null;
  }

  async activeChanges(
    workspaceId: string,
    batchId?: string,
  ): Promise<ClassChange[]> {
    const rows = await this.db.trainingInstituteClassChange.findMany({
      where: { workspaceId, deletedAt: null, ...(batchId ? { batchId } : {}) },
    });
    return rows.map(toChange);
  }

  async activeHolidays(workspaceId: string): Promise<Holiday[]> {
    const rows = await this.db.trainingInstituteHoliday.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ startDate: "asc" }],
    });
    return rows.map(toHoliday);
  }

  async findHoliday(workspaceId: string, id: string): Promise<Holiday | null> {
    const row = await this.db.trainingInstituteHoliday.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toHoliday(row);
  }

  async hasSavedAttendance(
    workspaceId: string,
    batchId: string | null,
    dates: { from: string; to: string },
  ): Promise<boolean> {
    // Same row lock an Attendance save takes, so the two can't interleave.
    await this.db.$queryRaw`
      SELECT id FROM training_institute.attendance_registers
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND date BETWEEN ${dateValue(dates.from)}::date AND ${dateValue(dates.to)}::date
        ${batchId ? Prisma.sql`AND batch_id = ${batchId}::uuid` : Prisma.empty}
      FOR UPDATE`;
    const mark = await this.db.trainingInstituteAttendanceMark.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        status: { not: "unmarked" },
        register: {
          workspaceId,
          deletedAt: null,
          ...(batchId ? { batchId } : {}),
          date: { gte: dateValue(dates.from), lte: dateValue(dates.to) },
        },
      },
      select: { id: true },
    });
    return mark != null;
  }

  async hasOccurrence(
    workspaceId: string,
    slot: ClassSlotKey,
  ): Promise<boolean> {
    const occurrence = await this.db.trainingInstituteClassOccurrence.findFirst(
      {
        where: {
          workspaceId,
          batchId: slot.batchId,
          classDate: dateValue(slot.date),
          startTime: slot.startTime,
        },
        select: { id: true },
      },
    );
    return occurrence != null;
  }

  async saveChange(
    change: ClassChange,
    emptyRegisterDates: string[],
  ): Promise<void> {
    const props = change.toProps();
    const data = {
      kind: props.kind,
      reason: props.reason,
      movedToDate: props.movedTo ? dateValue(props.movedTo.date) : null,
      movedToStartTime: props.movedTo?.startTime ?? null,
      movedToEndTime: props.movedTo?.endTime ?? null,
      updatedByUserId: props.updatedByUserId,
      deletedAt: props.deletedAt,
      deletedByUserId: props.deletedByUserId,
    };
    try {
      await this.write(async (tx) => {
        await tx.trainingInstituteClassChange.upsert({
          where: { id: props.id },
          create: {
            id: props.id,
            workspaceId: props.workspaceId,
            batchId: props.batchId,
            classDate: dateValue(props.date),
            startTime: props.startTime,
            endTime: props.endTime,
            createdByUserId: props.createdByUserId,
            createdAt: props.createdAt,
            ...data,
          },
          update: data,
        });
        if (emptyRegisterDates.length > 0)
          await tombstoneEmptyRegisters(tx, {
            workspaceId: props.workspaceId,
            batchId: props.batchId,
            dates: emptyRegisterDates,
            userId: props.updatedByUserId,
          });
      });
    } catch (error) {
      changeConflict(error);
    }
  }

  async saveHoliday(
    holiday: Holiday,
    emptyRegisterDates?: { from: string; to: string },
  ): Promise<void> {
    const props = holiday.toProps();
    await this.write(async (tx) => {
      await tx.trainingInstituteHoliday.upsert({
        where: { id: props.id },
        create: {
          id: props.id,
          workspaceId: props.workspaceId,
          startDate: dateValue(props.startDate),
          endDate: dateValue(props.endDate),
          reason: props.reason,
          createdByUserId: props.createdByUserId,
          createdAt: props.createdAt,
        },
        update: {
          deletedAt: props.deletedAt,
          deletedByUserId: props.deletedByUserId,
        },
      });
      if (emptyRegisterDates != null)
        await tombstoneEmptyRegisters(tx, {
          workspaceId: props.workspaceId,
          range: emptyRegisterDates,
          userId: props.createdByUserId,
        });
    });
  }
}

/** Unmarked-only Registers for Classes that no longer happen would show as gaps. */
async function tombstoneEmptyRegisters(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    batchId?: string;
    dates?: string[];
    range?: { from: string; to: string };
    userId: string;
  },
): Promise<void> {
  const registers = await tx.trainingInstituteAttendanceRegister.findMany({
    where: {
      workspaceId: input.workspaceId,
      deletedAt: null,
      ...(input.batchId ? { batchId: input.batchId } : {}),
      ...(input.dates ? { date: { in: input.dates.map(dateValue) } } : {}),
      ...(input.range
        ? {
            date: {
              gte: dateValue(input.range.from),
              lte: dateValue(input.range.to),
            },
          }
        : {}),
      marks: { none: { deletedAt: null, status: { not: "unmarked" } } },
    },
    select: { id: true },
  });
  if (registers.length === 0) return;
  const now = new Date();
  const ids = registers.map((register) => register.id);
  await tx.trainingInstituteAttendanceMark.updateMany({
    where: { registerId: { in: ids }, deletedAt: null },
    data: { deletedAt: now, deletedByUserId: input.userId },
  });
  await tx.trainingInstituteAttendanceRegister.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: now, deletedByUserId: input.userId },
  });
}
