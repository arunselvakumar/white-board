import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  BookingChange,
  BookingListParams,
  BookingStore,
  NewBooking,
  NewBookingEvent,
  StoredBooking,
} from "../application/booking-ports";
import type { SalesTx } from "../application/ports";
import { unitBooked } from "../domain/booking";
import { ACTIVE_BOOKING_STATUSES } from "../domain/sales-terms";

type Row = Prisma.ConstructionSalesBookingGetPayload<object>;

const day = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);
const toDb = (value: CalendarDate | null | undefined) =>
  value == null ? null : calendarDateToDb(value);

function toStored(row: Row): StoredBooking {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    wingId: row.wingId,
    unitId: row.unitId,
    status: row.status,
    bookingDate: calendarDateFromDb(row.bookingDate),
    holdUntil: day(row.holdUntil),
    customerName: row.customerName,
    customerMobile: row.customerMobile,
    customerEmail: row.customerEmail,
    customerAddress: row.customerAddress,
    referredByName: row.referredByName,
    referredByContact: row.referredByContact,
    remarks: row.remarks,
    inquiryId: row.inquiryId,
    confirmedOn: day(row.confirmedOn),
    cancelledOn: day(row.cancelledOn),
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const ACTIVE = { in: [...ACTIVE_BOOKING_STATUSES] };

/** The display-status filter as SQL on the stored status and Hold until. */
function statusWhere(
  statuses: BookingListParams["statuses"],
  today: CalendarDate,
): Prisma.ConstructionSalesBookingWhereInput | null {
  if (statuses == null || statuses.length === 0) return null;
  const todayDb = calendarDateToDb(today);
  return {
    OR: statuses.map((status): Prisma.ConstructionSalesBookingWhereInput => {
      switch (status) {
        case "on_hold":
          return {
            status: "on_hold",
            OR: [{ holdUntil: null }, { holdUntil: { gte: todayDb } }],
          };
        case "hold_expired":
          return { status: "on_hold", holdUntil: { lt: todayDb } };
        case "booked":
          return { status: "booked" };
        case "cancelled":
          return { status: "cancelled" };
      }
    }),
  };
}

function where(
  params: BookingListParams,
): Prisma.ConstructionSalesBookingWhereInput {
  const and: Prisma.ConstructionSalesBookingWhereInput[] = [];
  const status = statusWhere(params.statuses, params.today);
  if (status != null) and.push(status);
  if (params.wingId != null) and.push({ wingId: params.wingId });
  if (params.unitId != null) and.push({ unitId: params.unitId });
  const search = params.search?.trim() ?? "";
  if (search !== "") {
    const digits = search.replace(/\D/g, "");
    and.push({
      OR: [
        { customerName: { contains: search, mode: "insensitive" } },
        { customerEmail: { contains: search, mode: "insensitive" } },
        { referredByName: { contains: search, mode: "insensitive" } },
        ...(digits.length >= 3
          ? [{ customerMobile: { contains: digits } }]
          : []),
      ],
    });
  }
  return {
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    deletedAt: null,
    AND: and,
  };
}

/**
 * Bookings in `construction_sales.bookings` and their status history
 * (`booking_events`) (CM-1006). The partial unique index
 * `bookings_unit_active_key` keeps one On Hold or Booked booking per unit;
 * writers on a unit also queue on an advisory lock (`lockUnits`).
 */
export class PrismaBookingStore implements BookingStore {
  async lockUnits(
    db: SalesTx,
    workspaceId: string,
    unitIds: readonly string[],
  ): Promise<void> {
    const sorted = [...new Set(unitIds)].sort();
    if (sorted.length === 0) return;
    const keys = sorted.map(
      (id) => `construction_sales.unit:${workspaceId}:${id}`,
    );
    await db.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(k, 0))
      FROM unnest(${keys}::text[]) WITH ORDINALITY AS t(k, n)
      ORDER BY n`);
  }

  async find(db: SalesTx, workspaceId: string, id: string) {
    const row = await db.constructionSalesBooking.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: SalesTx, workspaceId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_sales.bookings
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  }

  async active(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitIds?: readonly string[],
  ) {
    if (unitIds?.length === 0) return new Map<string, StoredBooking>();
    const rows = await db.constructionSalesBooking.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        status: ACTIVE,
        ...(unitIds == null ? {} : { unitId: { in: [...new Set(unitIds)] } }),
      },
    });
    return new Map(rows.map((row) => [row.unitId, toStored(row)]));
  }

  async ofUnit(db: SalesTx, workspaceId: string, unitId: string) {
    const rows = await db.constructionSalesBooking.findMany({
      where: { workspaceId, unitId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toStored);
  }

  async insert(
    db: SalesTx,
    row: NewBooking,
    by: string,
    at: Date,
  ): Promise<void> {
    try {
      await db.constructionSalesBooking.create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          wingId: row.wingId,
          unitId: row.unitId,
          status: row.status,
          bookingDate: calendarDateToDb(row.bookingDate),
          holdUntil: toDb(row.holdUntil),
          customerName: row.customerName,
          customerMobile: row.customerMobile,
          customerEmail: row.customerEmail,
          customerAddress: row.customerAddress,
          referredByName: row.referredByName,
          referredByContact: row.referredByContact,
          remarks: row.remarks,
          inquiryId: row.inquiryId,
          confirmedOn: toDb(row.confirmedOn),
          createdAt: at,
          updatedAt: at,
          createdBy: by,
          updatedBy: by,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw unitBooked(null);
      throw error;
    }
  }

  async update(
    db: SalesTx,
    id: string,
    change: BookingChange,
    by: string,
    at: Date,
  ): Promise<void> {
    const dates = {
      ...(change.bookingDate === undefined
        ? {}
        : { bookingDate: calendarDateToDb(change.bookingDate) }),
      ...(change.holdUntil === undefined
        ? {}
        : { holdUntil: toDb(change.holdUntil) }),
      ...(change.confirmedOn === undefined
        ? {}
        : { confirmedOn: toDb(change.confirmedOn) }),
      ...(change.cancelledOn === undefined
        ? {}
        : { cancelledOn: toDb(change.cancelledOn) }),
    };
    const {
      bookingDate: _bookingDate,
      holdUntil: _holdUntil,
      confirmedOn: _confirmedOn,
      cancelledOn: _cancelledOn,
      ...rest
    } = change;
    await db.constructionSalesBooking.update({
      where: { id },
      data: { ...rest, ...dates, updatedAt: at, updatedBy: by },
    });
  }

  async tombstone(
    db: SalesTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionSalesBooking.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async appendEvent(db: SalesTx, event: NewBookingEvent): Promise<void> {
    await db.constructionSalesBookingEvent.create({
      data: {
        id: newId(event.at.getTime()),
        workspaceId: event.workspaceId,
        bookingId: event.bookingId,
        status: event.status,
        onDate: calendarDateToDb(event.onDate),
        holdUntil: toDb(event.holdUntil),
        reason: event.reason,
        occurredAt: event.at,
        actorUserId: event.actorUserId,
      },
    });
  }

  async history(db: SalesTx, workspaceId: string, bookingId: string) {
    const rows = await db.constructionSalesBookingEvent.findMany({
      where: { workspaceId, bookingId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      status: row.status,
      onDate: calendarDateFromDb(row.onDate),
      holdUntil: day(row.holdUntil),
      reason: row.reason,
      occurredAt: row.occurredAt,
      actorUserId: row.actorUserId,
    }));
  }

  async list(db: SalesTx, params: BookingListParams) {
    const filter = where(params);
    const cursor = params.after ?? params.before;
    const backwards = params.before != null;
    const page =
      cursor == null
        ? {}
        : backwards
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            };
    const order = backwards ? "asc" : "desc";
    const [found, total] = await Promise.all([
      db.constructionSalesBooking.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
      }),
      db.constructionSalesBooking.count({ where: filter }),
    ]);
    const hasMore = found.length > params.limit;
    const items = found.slice(0, params.limit);
    if (backwards) items.reverse();
    return { items: items.map(toStored), hasMore, total };
  }

  async inquiryNames(db: SalesTx, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await db.constructionSalesInquiry.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
