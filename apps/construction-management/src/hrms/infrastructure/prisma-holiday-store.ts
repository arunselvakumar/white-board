import type { Prisma, PrismaClient } from "@repo/construction-db";

import type { MemberAccess } from "@/src/shared-kernel/access";
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
import { newId } from "@/src/shared-kernel/ids";

import type {
  HolidayBackdatedGuard,
  HolidayStore,
  StoredHoliday,
} from "../application/holiday-handlers";
import type { HrmsHoliday } from "../application/ports";
import { holidayDateTaken, type HolidayDetails } from "../domain/holiday";
import {
  companyToday,
  isUniqueViolation,
  staleOrMissing,
  type Tx,
} from "./prisma-calendar-support";

type HolidayRow = Prisma.ConstructionHrmsHolidayGetPayload<object>;

function toStored(row: HolidayRow): StoredHoliday {
  return {
    id: row.id,
    name: row.name,
    date: calendarDateFromDb(row.holidayDate),
    type: row.type,
    isOptional: row.isOptional,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columns(holiday: HolidayDetails) {
  return {
    name: holiday.name,
    holidayDate: calendarDateToDb(holiday.date),
    type: holiday.type,
    isOptional: holiday.isOptional,
    description: holiday.description,
  };
}

function audited(holiday: StoredHoliday) {
  const { createdAt: _created, updatedAt: _updated, ...rest } = holiday;
  return rest;
}

const MISSING = {
  code: "HOLIDAY_NOT_FOUND",
  message: "This holiday was deleted.",
};
const STALE = {
  code: "HOLIDAY_CHANGED",
  message:
    "Someone else changed this holiday after you opened it. Reload to see their changes.",
};

/** `construction_hrms.holidays` (CM-305). */
export class PrismaHolidayStore implements HolidayStore {
  constructor(private readonly db: PrismaClient) {}

  async listYear(workspaceId: string, year: number): Promise<StoredHoliday[]> {
    return this.between(
      workspaceId,
      `${String(year)}-01-01`,
      `${String(year)}-12-31`,
    );
  }

  async between(
    workspaceId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredHoliday[]> {
    const rows = await this.db.constructionHrmsHoliday.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        holidayDate: { gte: calendarDateToDb(from), lte: calendarDateToDb(to) },
      },
      orderBy: [{ holidayDate: "asc" }],
    });
    return rows.map(toStored);
  }

  async find(workspaceId: string, id: string): Promise<StoredHoliday | null> {
    const row = await this.db.constructionHrmsHoliday.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async onDates(
    workspaceId: string,
    dates: readonly CalendarDate[],
  ): Promise<StoredHoliday[]> {
    if (dates.length === 0) return [];
    const rows = await this.db.constructionHrmsHoliday.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        holidayDate: { in: [...new Set(dates)].map(calendarDateToDb) },
      },
    });
    return rows.map(toStored);
  }

  private async taken(
    tx: Tx,
    workspaceId: string,
    date: CalendarDate,
    exceptId: string | null,
  ): Promise<void> {
    const other = await tx.constructionHrmsHoliday.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        holidayDate: calendarDateToDb(date),
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { name: true },
    });
    if (other != null) throw holidayDateTaken(date, other.name);
  }

  async create(input: {
    workspaceId: string;
    holidays: readonly HolidayDetails[];
    by: string;
    now: Date;
  }): Promise<StoredHoliday[]> {
    try {
      return await this.db.$transaction(async (tx) => {
        const created: StoredHoliday[] = [];
        for (const holiday of input.holidays) {
          await this.taken(tx, input.workspaceId, holiday.date, null);
          const row = await tx.constructionHrmsHoliday.create({
            data: {
              id: newId(input.now.getTime()),
              workspaceId: input.workspaceId,
              ...columns(holiday),
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
            action: "hrms_holiday.created",
            entityType: "hrms_holiday",
            entityId: row.id,
            after: audited(stored),
            occurredAt: input.now,
          });
          created.push(stored);
        }
        return created;
      });
    } catch (error) {
      // Two adds of the same date racing: the unique live-date index.
      if (isUniqueViolation(error))
        throw holidayDateTaken(
          input.holidays[0]?.date ?? "",
          "another holiday",
        );
      throw error;
    }
  }

  async update(input: {
    workspaceId: string;
    id: string;
    holiday: HolidayDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredHoliday> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.constructionHrmsHoliday.findFirst({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
          },
        });
        if (before == null) staleOrMissing(false, MISSING, STALE);
        await this.taken(tx, input.workspaceId, input.holiday.date, input.id);
        const { count } = await tx.constructionHrmsHoliday.updateMany({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            ...columns(input.holiday),
            updatedAt: input.now,
            updatedBy: input.by,
          },
        });
        if (count !== 1) staleOrMissing(true, MISSING, STALE);
        const after = await tx.constructionHrmsHoliday.findUniqueOrThrow({
          where: { id: input.id },
        });
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_holiday.updated",
          entityType: "hrms_holiday",
          entityId: input.id,
          before: audited(toStored(before)),
          after: audited(toStored(after)),
          occurredAt: input.now,
        });
        return toStored(after);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw holidayDateTaken(input.holiday.date, "another holiday");
      throw error;
    }
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const before = await tx.constructionHrmsHoliday.findFirst({
        where: {
          id: input.id,
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
      });
      if (before == null) staleOrMissing(false, MISSING, STALE);
      await tx.constructionHrmsHoliday.updateMany({
        where: { id: input.id, workspaceId: input.workspaceId },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "hrms_holiday.deleted",
        entityType: "hrms_holiday",
        entityId: input.id,
        before: audited(toStored(before)),
        occurredAt: input.now,
      });
    });
  }

  /** The holidays between two dates, as the `WorkCalendar` port reads them. */
  async holidaysBetween(
    workspaceId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<HrmsHoliday[]> {
    return (await this.between(workspaceId, from, to)).map((holiday) => ({
      id: holiday.id,
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      isOptional: holiday.isOptional,
    }));
  }
}

/** The kernel's Back-dated Entry policy for module `holiday`. */
export class PrismaHolidayBackdatedGuard implements HolidayBackdatedGuard {
  constructor(private readonly db: PrismaClient) {}

  async forActor(
    access: MemberAccess,
  ): Promise<(action: "create" | "edit", date: CalendarDate) => void> {
    const [policy, actor, today] = await Promise.all([
      loadBackdatedPolicy(this.db, access.workspaceId),
      loadBackdatedActor(this.db, access),
      companyToday(this.db, access.workspaceId),
    ]);
    return (action, date) => {
      if (action === "create")
        assertCanCreate(policy, "holiday", date, actor, today);
      else assertCanEdit(policy, "holiday", date, actor, today);
    };
  }
}
