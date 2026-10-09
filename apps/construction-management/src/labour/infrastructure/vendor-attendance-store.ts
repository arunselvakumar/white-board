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
  StoredVendorDay,
  VendorAttendanceActor,
  VendorAttendanceBackdatedGuard,
  VendorAttendanceStore,
  VendorDayListParams,
} from "../application/vendor-attendance-handlers";
import { vendorDayLedgerEntries } from "../domain/vendor-attendance";
import { lockLiveParties } from "./party-locks";
import { prismaLedger } from "./prisma-ledger";

const INCLUDE = {
  lines: { orderBy: { id: "asc" } },
} as const satisfies Prisma.ConstructionLabourVendorAttendanceInclude;

type Row = Prisma.ConstructionLabourVendorAttendanceGetPayload<{
  include: typeof INCLUDE;
}>;

function toStored(row: Row): StoredVendorDay {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    date: calendarDateFromDb(row.attendanceDate),
    totalPay: row.totalPay,
    lines: row.lines.map((line) => ({
      shiftId: line.shiftId,
      shiftName: line.shiftName,
      labourCategoryId: line.labourCategoryId,
      fullDayCount: line.fullDayCount,
      halfDayCount: line.halfDayCount,
      overtimeHours: line.overtimeHours.toString(),
      ratePerDay: line.ratePerDay,
      overtimePerHour: line.overtimePerHour,
      amount: line.amount,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function changed() {
  return conflict(
    "VENDOR_ATTENDANCE_CHANGED",
    "Someone changed this day after you opened it. Reload to see the latest.",
  );
}

/** What the audit log keeps of a vendor day. */
function snapshot(day: { totalPay: number; lines: unknown }) {
  return { totalPay: day.totalPay, lines: day.lines };
}

/**
 * Vendor attendance in `construction_labour` (CM-212): one live row per
 * vendor, Project and date (partial unique index), lines in id order (UUID
 * v7, one step per line), and the vendor ledger in the same transaction.
 */
export class PrismaVendorAttendanceStore implements VendorAttendanceStore {
  constructor(private readonly db: PrismaClient) {}

  async findById(
    workspaceId: string,
    id: string,
  ): Promise<StoredVendorDay | null> {
    const row = await this.db.constructionLabourVendorAttendance.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toStored(row);
  }

  async findDay(
    workspaceId: string,
    vendorId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredVendorDay | null> {
    const row = await this.db.constructionLabourVendorAttendance.findFirst({
      where: {
        workspaceId,
        vendorId,
        projectId,
        attendanceDate: calendarDateToDb(date),
        deletedAt: null,
      },
      include: INCLUDE,
    });
    return row == null ? null : toStored(row);
  }

  async daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredVendorDay[]> {
    const rows = await this.db.constructionLabourVendorAttendance.findMany({
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
    params: VendorDayListParams,
  ): Promise<{ items: StoredVendorDay[]; total: number }> {
    const where: Prisma.ConstructionLabourVendorAttendanceWhereInput = {
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      deletedAt: null,
      ...(params.vendorId == null ? {} : { vendorId: params.vendorId }),
      ...(params.from == null && params.to == null
        ? {}
        : {
            attendanceDate: {
              ...(params.from == null
                ? {}
                : { gte: calendarDateToDb(params.from) }),
              ...(params.to == null
                ? {}
                : { lte: calendarDateToDb(params.to) }),
            },
          }),
      ...(params.labourCategoryId == null
        ? {}
        : {
            lines: { some: { labourCategoryId: params.labourCategoryId } },
          }),
    };
    const [rows, total] = await Promise.all([
      this.db.constructionLabourVendorAttendance.findMany({
        where,
        include: INCLUDE,
        orderBy: [
          { attendanceDate: "desc" },
          { vendor: { name: "asc" } },
          { id: "asc" },
        ],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.db.constructionLabourVendorAttendance.count({ where }),
    ]);
    return { items: rows.map(toStored), total };
  }

  async save(
    input: Parameters<VendorAttendanceStore["save"]>[0],
  ): Promise<void> {
    const { day, workspaceId, by, now } = input;
    try {
      await this.db.$transaction(async (tx) => {
        // A vendor deleted meanwhile is refused; a delete waits for this.
        await lockLiveParties(
          tx,
          workspaceId,
          "vendor",
          [day.vendorId],
          "share",
        );
        let before: StoredVendorDay | null = null;
        if (input.expectedUpdatedAt == null) {
          await tx.constructionLabourVendorAttendance.create({
            data: {
              id: input.id,
              workspaceId,
              projectId: day.projectId,
              vendorId: day.vendorId,
              attendanceDate: calendarDateToDb(day.date),
              totalPay: day.totalPay,
              createdAt: now,
              updatedAt: now,
              createdBy: by,
              updatedBy: by,
            },
          });
        } else {
          const row = await tx.constructionLabourVendorAttendance.findFirst({
            where: { id: input.id, workspaceId, deletedAt: null },
            include: INCLUDE,
          });
          if (row == null) throw changed();
          before = toStored(row);
          // Compare-and-set on updatedAt: a stale edit changes no row.
          const updated =
            await tx.constructionLabourVendorAttendance.updateMany({
              where: {
                id: input.id,
                workspaceId,
                deletedAt: null,
                updatedAt: input.expectedUpdatedAt,
              },
              data: { totalPay: day.totalPay, updatedAt: now, updatedBy: by },
            });
          if (updated.count === 0) throw changed();
          await tx.constructionLabourVendorAttendanceLine.deleteMany({
            where: { attendanceId: input.id },
          });
        }
        const start = now.getTime();
        await tx.constructionLabourVendorAttendanceLine.createMany({
          data: day.lines.map((line, index) => ({
            id: newId(start + index),
            attendanceId: input.id,
            shiftId: line.shiftId,
            shiftName: line.shiftName,
            labourCategoryId: line.labourCategoryId,
            fullDayCount: line.fullDayCount,
            halfDayCount: line.halfDayCount,
            overtimeHours: line.overtimeHours,
            ratePerDay: line.ratePerDay,
            overtimePerHour: line.overtimePerHour,
            amount: line.amount,
          })),
        });
        await prismaLedger.reverseSource(
          tx,
          workspaceId,
          by,
          "vendor_attendance",
          input.id,
        );
        await prismaLedger.post(
          tx,
          workspaceId,
          by,
          vendorDayLedgerEntries(day, input.id),
        );
        await recordAudit(tx, {
          workspaceId,
          actorUserId: by,
          action:
            before == null
              ? "vendor_attendance.recorded"
              : "vendor_attendance.updated",
          entityType: "vendor_attendance",
          entityId: input.id,
          before: before == null ? undefined : snapshot(before),
          after: {
            vendorId: day.vendorId,
            projectId: day.projectId,
            date: day.date,
            ...snapshot(day),
          },
          occurredAt: now,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw conflict(
          "VENDOR_ATTENDANCE_CHANGED",
          "Someone recorded this day after you opened it. Reload to see their entry.",
        );
      throw error;
    }
  }

  async clear(
    input: Parameters<VendorAttendanceStore["clear"]>[0],
  ): Promise<void> {
    const { day, by, now } = input;
    await this.db.$transaction(async (tx) => {
      await lockLiveParties(
        tx,
        day.workspaceId,
        "vendor",
        [day.vendorId],
        "share",
      );
      const updated = await tx.constructionLabourVendorAttendance.updateMany({
        where: {
          id: day.id,
          workspaceId: day.workspaceId,
          deletedAt: null,
          ...(input.expectedUpdatedAt == null
            ? {}
            : { updatedAt: input.expectedUpdatedAt }),
        },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      if (updated.count === 0) {
        const live = await tx.constructionLabourVendorAttendance.count({
          where: { id: day.id, deletedAt: null },
        });
        if (live === 0)
          throw notFound(
            "VENDOR_ATTENDANCE_NOT_FOUND",
            "This attendance was not found.",
          );
        throw changed();
      }
      await prismaLedger.reverseSource(
        tx,
        day.workspaceId,
        by,
        "vendor_attendance",
        day.id,
      );
      await recordAudit(tx, {
        workspaceId: day.workspaceId,
        actorUserId: by,
        action: "vendor_attendance.cleared",
        entityType: "vendor_attendance",
        entityId: day.id,
        before: {
          vendorId: day.vendorId,
          projectId: day.projectId,
          date: day.date,
          ...snapshot(day),
        },
        occurredAt: now,
      });
    });
  }

  async vendorNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourVendor.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}

/** The kernel's back-dated entry policy for `vendor_attendance`. */
export class PrismaVendorAttendanceBackdatedGuard implements VendorAttendanceBackdatedGuard {
  constructor(
    private readonly db: PrismaClient,
    private readonly today: (workspaceId: string) => Promise<CalendarDate>,
  ) {}

  async assert(
    action: "create" | "edit",
    actor: VendorAttendanceActor,
    date: CalendarDate,
  ): Promise<void> {
    const [policy, who, today] = await Promise.all([
      loadBackdatedPolicy(this.db, actor.workspaceId),
      loadBackdatedActor(this.db, actor),
      this.today(actor.workspaceId),
    ]);
    if (action === "create")
      assertCanCreate(policy, "vendor_attendance", date, who, today);
    else assertCanEdit(policy, "vendor_attendance", date, who, today);
  }
}
