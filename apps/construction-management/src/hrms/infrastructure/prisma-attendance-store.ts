import type { Prisma, PrismaClient } from "@repo/construction-db";

import type { MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { assertCanCreate } from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import type {
  AttendanceBackdatedGuard,
  AttendanceChanges,
  AttendanceStore,
  NewAttendanceEntry,
  OverlapCheck,
  StoredAttendanceEntry,
} from "../application/attendance-handlers";
import {
  assertNoOverlap,
  attendanceAlreadyOpen,
  type GpsFix,
} from "../domain/attendance";
import {
  companyToday,
  isUniqueViolation,
  lockKey,
  staleOrMissing,
  type Tx,
} from "./prisma-calendar-support";

type EntryRow = Prisma.ConstructionHrmsAttendanceEntryGetPayload<object>;

function fix(
  latitude: Prisma.Decimal | null,
  longitude: Prisma.Decimal | null,
  accuracy: Prisma.Decimal | null,
): GpsFix | null {
  if (latitude == null || longitude == null) return null;
  return {
    latitude: latitude.toNumber(),
    longitude: longitude.toNumber(),
    accuracyMetres: accuracy?.toNumber() ?? null,
  };
}

function toStored(row: EntryRow): StoredAttendanceEntry {
  return {
    id: row.id,
    memberId: row.memberId,
    date: calendarDateFromDb(row.attendanceDate),
    checkInAt: row.checkInAt,
    checkIn: fix(
      row.checkInLatitude,
      row.checkInLongitude,
      row.checkInAccuracy,
    ),
    checkInBranchId: row.checkInBranchId,
    checkOutAt: row.checkOutAt,
    checkOut: fix(
      row.checkOutLatitude,
      row.checkOutLongitude,
      row.checkOutAccuracy,
    ),
    checkOutBranchId: row.checkOutBranchId,
    source: row.source,
    approvalStatus: row.approvalStatus,
    outOfFence: row.outOfFence,
    reason: row.reason,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    rejectionReason: row.rejectionReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function checkInColumns(value: GpsFix | null) {
  return {
    checkInLatitude: value?.latitude ?? null,
    checkInLongitude: value?.longitude ?? null,
    checkInAccuracy: value?.accuracyMetres ?? null,
  };
}

function checkOutColumns(value: GpsFix | null) {
  return {
    checkOutLatitude: value?.latitude ?? null,
    checkOutLongitude: value?.longitude ?? null,
    checkOutAccuracy: value?.accuracyMetres ?? null,
  };
}

function changeColumns(changes: AttendanceChanges) {
  const { checkOut, ...rest } = changes;
  return {
    ...rest,
    ...(checkOut === undefined ? {} : checkOutColumns(checkOut)),
  };
}

/** What the audit trail keeps of an entry. */
function audited(entry: StoredAttendanceEntry) {
  const { createdAt: _created, updatedAt: _updated, ...rest } = entry;
  return rest;
}

const LIVE = { deletedAt: null } as const;
const OPEN = {
  deletedAt: null,
  checkOutAt: null,
  approvalStatus: { not: "rejected" },
} as const;

const MISSING = {
  code: "ATTENDANCE_NOT_FOUND",
  message: "This attendance entry does not exist.",
};
const STALE = {
  code: "ATTENDANCE_CHANGED",
  message:
    "This attendance changed after you opened it. Reload to see the latest.",
};

/** `construction_hrms.attendance_entries` (CM-308). */
export class PrismaAttendanceStore implements AttendanceStore {
  constructor(private readonly db: PrismaClient) {}

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredAttendanceEntry | null> {
    const row = await this.db.constructionHrmsAttendanceEntry.findFirst({
      where: { id, workspaceId, ...LIVE },
    });
    return row == null ? null : toStored(row);
  }

  async openEntry(
    workspaceId: string,
    memberId: string,
  ): Promise<StoredAttendanceEntry | null> {
    const row = await this.db.constructionHrmsAttendanceEntry.findFirst({
      where: { workspaceId, memberId, ...OPEN },
    });
    return row == null ? null : toStored(row);
  }

  async openEntries(workspaceId: string): Promise<StoredAttendanceEntry[]> {
    const rows = await this.db.constructionHrmsAttendanceEntry.findMany({
      where: { workspaceId, ...OPEN },
    });
    return rows.map(toStored);
  }

  async entriesBetween(
    workspaceId: string,
    memberIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredAttendanceEntry[]> {
    if (memberIds.length === 0) return [];
    const rows = await this.db.constructionHrmsAttendanceEntry.findMany({
      where: {
        workspaceId,
        ...LIVE,
        memberId: { in: [...new Set(memberIds)] },
        attendanceDate: {
          gte: calendarDateToDb(from),
          lte: calendarDateToDb(to),
        },
      },
      orderBy: [{ attendanceDate: "asc" }, { checkInAt: "asc" }],
    });
    return rows.map(toStored);
  }

  async pending(
    workspaceId: string,
    memberId?: string,
  ): Promise<StoredAttendanceEntry[]> {
    const rows = await this.db.constructionHrmsAttendanceEntry.findMany({
      where: {
        workspaceId,
        ...LIVE,
        approvalStatus: "pending",
        ...(memberId == null ? {} : { memberId }),
      },
      orderBy: [{ attendanceDate: "asc" }, { checkInAt: "asc" }],
    });
    return rows.map(toStored);
  }

  /** Serialises one member's attendance writes until the transaction ends. */
  private async lock(tx: Tx, workspaceId: string, memberId: string) {
    await lockKey(tx, `hrms_attendance:${workspaceId}:${memberId}`);
  }

  /** `assertNoOverlap` against the member's other entries. */
  private async checkOverlap(
    tx: Tx,
    workspaceId: string,
    memberId: string,
    overlap: OverlapCheck | null,
  ): Promise<void> {
    if (overlap == null) return;
    const others = await tx.constructionHrmsAttendanceEntry.findMany({
      where: {
        workspaceId,
        memberId,
        ...LIVE,
        approvalStatus: { not: "rejected" },
        checkInAt: { lt: overlap.to },
        OR: [{ checkOutAt: null }, { checkOutAt: { gt: overlap.from } }],
      },
    });
    assertNoOverlap(
      overlap,
      others.map((row) => ({
        id: row.id,
        date: calendarDateFromDb(row.attendanceDate),
        checkInAt: row.checkInAt,
        checkOutAt: row.checkOutAt,
        approvalStatus: row.approvalStatus,
      })),
    );
  }

  async create(input: {
    workspaceId: string;
    entry: NewAttendanceEntry;
    overlap: OverlapCheck | null;
    action: string;
    by: string;
    now: Date;
  }): Promise<StoredAttendanceEntry> {
    const { entry } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        await this.lock(tx, input.workspaceId, entry.memberId);
        if (entry.checkOutAt == null) {
          const open = await tx.constructionHrmsAttendanceEntry.findFirst({
            where: {
              workspaceId: input.workspaceId,
              memberId: entry.memberId,
              ...OPEN,
            },
          });
          if (open != null)
            throw attendanceAlreadyOpen({
              id: open.id,
              date: calendarDateFromDb(open.attendanceDate),
            });
        }
        await this.checkOverlap(
          tx,
          input.workspaceId,
          entry.memberId,
          input.overlap,
        );
        const row = await tx.constructionHrmsAttendanceEntry.create({
          data: {
            id: newId(input.now.getTime()),
            workspaceId: input.workspaceId,
            memberId: entry.memberId,
            attendanceDate: calendarDateToDb(entry.date),
            checkInAt: entry.checkInAt,
            ...checkInColumns(entry.checkIn),
            checkInBranchId: entry.checkInBranchId,
            checkOutAt: entry.checkOutAt,
            ...checkOutColumns(entry.checkOut),
            checkOutBranchId: entry.checkOutBranchId,
            source: entry.source,
            approvalStatus: entry.approvalStatus,
            outOfFence: entry.outOfFence,
            reason: entry.reason,
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
        });
        const stored = toStored(row);
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: input.action,
          entityType: "hrms_attendance_entry",
          entityId: row.id,
          after: audited(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      // A second open entry raced past the check: the one-open index.
      if (isUniqueViolation(error))
        throw attendanceAlreadyOpen({ id: "", date: entry.date });
      throw error;
    }
  }

  async update(input: {
    workspaceId: string;
    id: string;
    expectedUpdatedAt: Date;
    changes: AttendanceChanges;
    overlap: OverlapCheck | null;
    action: string;
    by: string;
    now: Date;
  }): Promise<StoredAttendanceEntry> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.constructionHrmsAttendanceEntry.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId, ...LIVE },
      });
      if (before == null) staleOrMissing(false, MISSING, STALE);
      await this.lock(tx, input.workspaceId, before.memberId);
      await this.checkOverlap(
        tx,
        input.workspaceId,
        before.memberId,
        input.overlap,
      );
      const { count } = await tx.constructionHrmsAttendanceEntry.updateMany({
        where: {
          id: input.id,
          workspaceId: input.workspaceId,
          ...LIVE,
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          ...changeColumns(input.changes),
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      if (count !== 1) staleOrMissing(true, MISSING, STALE);
      const after = toStored(
        await tx.constructionHrmsAttendanceEntry.findUniqueOrThrow({
          where: { id: input.id },
        }),
      );
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: input.action,
        entityType: "hrms_attendance_entry",
        entityId: input.id,
        before: audited(toStored(before)),
        after: audited(after),
        occurredAt: input.now,
      });
      return after;
    });
  }
}

/** The kernel's Back-dated Entry policy for module `hrms_attendance` (create). */
export class PrismaAttendanceBackdatedGuard implements AttendanceBackdatedGuard {
  constructor(private readonly db: PrismaClient) {}

  async forActor(access: MemberAccess): Promise<(date: CalendarDate) => void> {
    const [policy, actor, today] = await Promise.all([
      loadBackdatedPolicy(this.db, access.workspaceId),
      loadBackdatedActor(this.db, access),
      companyToday(this.db, access.workspaceId),
    ]);
    return (date) => {
      assertCanCreate(policy, "hrms_attendance", date, actor, today);
    };
  }
}

/** The Company's IANA time zone (its profile; India by default). */
export async function companyTimeZone(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
): Promise<string> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  const zone = profile?.timezone ?? "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: zone });
    return zone;
  } catch {
    return "Asia/Kolkata";
  }
}
