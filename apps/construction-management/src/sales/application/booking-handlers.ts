import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  assertAction,
  bookingChanged,
  bookingDisplayStatus,
  bookingFields,
  bookingHistoryKinds,
  bookingNotFound,
  cancelFields,
  canTakeAction,
  confirmDate,
  extendedHoldUntil,
  unitBooked,
  unitUnavailable,
  type BookingDisplayStatus,
  type BookingFields,
  type BookingHistoryKind,
  type BookingInput,
  type BookingStartStatus,
} from "../domain/booking";
import type { BookingEvent } from "../domain/booking-events";
import { SYSTEM_ACTOR, type AreaUnit } from "../domain/sales-terms";
import { isHoldExpired, unitNotFound } from "../domain/unit-profile";
import type {
  BookingListParams,
  StoredBooking,
  StoredBookingEvent,
} from "./booking-ports";
import type { SalesTx, SalesUnitFacts } from "./ports";
import {
  BOOKING_MENU,
  cancelExpiredHold,
  type SalesBookingDeps,
} from "./sales-booking-deps";

/**
 * Bookings (CM-1006, ADR CM-0022 §7): hold or book a unit, confirm a hold,
 * extend it, cancel, edit, delete. Every write is one transaction holding
 * the unit's lock (create) or the booking's row (the rest), with its
 * history row and audit event; notifications go after commit. Booking
 * Create holds and books, Update confirms, extends, cancels and edits,
 * Delete deletes (ADR CM-0022 §7; the menu has no Approve step).
 */

export type BookingActions = {
  edit: boolean;
  confirm: boolean;
  extendHold: boolean;
  cancel: boolean;
  delete: boolean;
  /** Add or remove the Booking Form and photos: Update, or Create for a new one's. */
  files: boolean;
};

type Person = { userId: string; name: string | null };

export type BookingReadModel = StoredBooking & {
  displayStatus: BookingDisplayStatus;
  unit: { id: string; name: string; floorName: string; deleted: boolean };
  wing: { id: string; name: string };
  /** From the unit's sales details, for lists and the report. */
  unitType: string | null;
  carpetArea: string | null;
  areaUnit: AreaUnit;
  inquiry: { id: string; name: string } | null;
  createdByPerson: Person;
};

export type BookingHistoryItem = StoredBookingEvent & {
  kind: BookingHistoryKind;
  by: Person;
};

export type BookingDetail = BookingReadModel & {
  history: BookingHistoryItem[];
};

/** Live units the Project can book now, by Wing (an expired hold counts). */
export type BookableWing = {
  id: string;
  name: string;
  units: { id: string; name: string; floorName: string }[];
};

export function bookingActions(
  access: MemberAccess,
  booking: Pick<StoredBooking, "projectId" | "status">,
): BookingActions {
  const scope = { projectId: booking.projectId };
  const update = can(access, BOOKING_MENU, "update", scope);
  return {
    edit: update && canTakeAction(booking.status, "edit"),
    confirm: update && canTakeAction(booking.status, "confirm"),
    extendHold: update && canTakeAction(booking.status, "extend_hold"),
    cancel: update && canTakeAction(booking.status, "cancel"),
    delete: can(access, BOOKING_MENU, "delete", scope),
    files: update,
  };
}

/** The input of a booking made by closing an inquiry as Converted (CM-1007). */
export type BookUnitInTxInput = {
  workspaceId: string;
  projectId: string;
  unitId: string;
  bookingDate: string;
  customer: {
    name: string;
    mobile?: string | null;
    email?: string | null;
    address?: string | null;
  };
  inquiryId: string;
  /** User id of who closes the inquiry. */
  by: string;
  now: Date;
};

/** A booking's own fields, for its audit events. */
function fieldsOf(booking: StoredBooking): BookingFields {
  return {
    bookingDate: booking.bookingDate,
    holdUntil: booking.holdUntil,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    customerEmail: booking.customerEmail,
    customerAddress: booking.customerAddress,
    referredByName: booking.referredByName,
    referredByContact: booking.referredByContact,
    remarks: booking.remarks,
  };
}

/** "A-101": the Wing and the unit, as lists and notifications name it. */
export function unitLabel(wingName: string, unitName: string): string {
  return wingName === "" ? unitName : `${wingName} · ${unitName}`;
}

export class BookingHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: SalesBookingDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async unitOnProject(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitId: string,
  ): Promise<SalesUnitFacts & { wingName: string }> {
    const unit = (
      await this.deps.directory.units(db, workspaceId, projectId, [unitId])
    ).get(unitId);
    if (unit == null || unit.deleted) throw unitNotFound();
    const wing = (
      await this.deps.directory.wingsById(db, workspaceId, projectId, [
        unit.wingId,
      ])
    ).get(unit.wingId);
    return { ...unit, wingName: wing?.name ?? "" };
  }

  /**
   * The unit rules of every new booking, inside `tx` (CM-0022 §7): the
   * unit's lock; 409 `UNIT_UNAVAILABLE`; 409 `UNIT_BOOKED` while a booking
   * holds it — except a hold past its Hold until date, which is cancelled
   * here ("Hold expired", by `system`); then the row, its first history
   * row and the audit event.
   */
  private async insertBooking(
    tx: SalesTx,
    input: {
      workspaceId: string;
      projectId: string;
      unit: SalesUnitFacts;
      status: BookingStartStatus;
      fields: BookingFields;
      inquiryId: string | null;
      by: string;
      at: Date;
      today: CalendarDate;
    },
  ): Promise<string> {
    const { profiles, bookings } = this.deps;
    const { workspaceId, projectId, unit, at } = input;
    await bookings.lockUnits(tx, workspaceId, [unit.id]);
    const profile = (
      await profiles.profiles(tx, workspaceId, projectId, [unit.id])
    ).get(unit.id);
    if (profile?.unavailable === true) throw unitUnavailable();
    const active = (
      await bookings.active(tx, workspaceId, projectId, [unit.id])
    ).get(unit.id);
    if (active != null) {
      if (!isHoldExpired(active, input.today)) throw unitBooked(active.id);
      await cancelExpiredHold(this.deps, tx, active, input.today, at);
    }
    const id = newId(at.getTime());
    const confirmedOn =
      input.status === "booked" ? input.fields.bookingDate : null;
    await bookings.insert(
      tx,
      {
        ...input.fields,
        holdUntil: input.status === "on_hold" ? input.fields.holdUntil : null,
        id,
        workspaceId,
        projectId,
        wingId: unit.wingId,
        unitId: unit.id,
        status: input.status,
        inquiryId: input.inquiryId,
        confirmedOn,
      },
      input.by,
      at,
    );
    await bookings.appendEvent(tx, {
      workspaceId,
      bookingId: id,
      status: input.status,
      onDate: input.fields.bookingDate,
      holdUntil: input.status === "on_hold" ? input.fields.holdUntil : null,
      reason: null,
      actorUserId: input.by,
      at,
    });
    await recordAudit(tx, {
      workspaceId,
      actorUserId: input.by,
      action: "booking.created",
      entityType: "booking",
      entityId: id,
      after: {
        unitId: unit.id,
        status: input.status,
        inquiryId: input.inquiryId,
        ...input.fields,
      },
      occurredAt: at,
    });
    return id;
  }

  private async dispatch(events: readonly BookingEvent[]): Promise<void> {
    if (events.length > 0) await this.deps.events.dispatch(events);
  }

  /**
   * **Hold** or **Book** a unit (Booking Create). The Booking Date is not
   * after today and inside the back-dated window `booking`; Hold until (a
   * hold only) is not before it.
   */
  async create(
    access: MemberAccess,
    input: BookingInput & {
      projectId: string;
      unitId: string;
      status: BookingStartStatus;
    },
  ): Promise<string> {
    assertCan(access, BOOKING_MENU, "create", { projectId: input.projectId });
    const { db } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const fields = bookingFields(input, input.status, today);
    const check = await this.deps.backdated(access);
    check("booking", "create", fields.bookingDate);
    const unit = await this.unitOnProject(
      db,
      ws,
      input.projectId,
      input.unitId,
    );
    const at = this.clock();
    const id = await db.$transaction((tx) =>
      this.insertBooking(tx, {
        workspaceId: ws,
        projectId: input.projectId,
        unit,
        status: input.status,
        fields,
        inquiryId: null,
        by: access.userId,
        at,
        today,
      }),
    );
    await this.dispatch([
      {
        type: "BookingCreated",
        workspaceId: ws,
        occurredAt: at,
        bookingId: id,
        projectId: input.projectId,
        unitLabel: unitLabel(unit.wingName, unit.name),
        customerName: fields.customerName,
        status: input.status,
        by: access.userId,
      },
    ]);
    return id;
  }

  /**
   * A **Booked** booking made inside the caller's transaction, for closing
   * an inquiry as Converted (CM-1007, ADR CM-0022 §6): the customer's
   * name, mobile, email and address come from the inquiry and the booking
   * names it. Every unit rule of `create` applies (404 `UNIT_NOT_FOUND`,
   * 409 `UNIT_UNAVAILABLE` / `UNIT_BOOKED`, an expired hold cancelled); the
   * Booking Date is not after today. The caller checks Inquiry Update and
   * Booking Create and the back-dated window. Call `afterCommit()` once
   * the caller's transaction has committed: it sends `booking.created`.
   */
  async bookInTx(
    tx: SalesTx,
    input: BookUnitInTxInput,
  ): Promise<{ bookingId: string; afterCommit: () => Promise<void> }> {
    const today = await this.deps.today(input.workspaceId);
    const fields = bookingFields(
      {
        bookingDate: input.bookingDate,
        customerName: input.customer.name,
        customerMobile: input.customer.mobile,
        customerEmail: input.customer.email,
        customerAddress: input.customer.address,
      },
      "booked",
      today,
    );
    const unit = await this.unitOnProject(
      tx,
      input.workspaceId,
      input.projectId,
      input.unitId,
    );
    const bookingId = await this.insertBooking(tx, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      unit,
      status: "booked",
      fields,
      inquiryId: input.inquiryId,
      by: input.by,
      at: input.now,
      today,
    });
    return {
      bookingId,
      afterCommit: () =>
        this.dispatch([
          {
            type: "BookingCreated",
            workspaceId: input.workspaceId,
            occurredAt: input.now,
            bookingId,
            projectId: input.projectId,
            unitLabel: unitLabel(unit.wingName, unit.name),
            customerName: fields.customerName,
            status: "booked",
            by: input.by,
          },
        ]),
    };
  }

  /** A live booking of the Company (404 otherwise). */
  async find(workspaceId: string, id: string): Promise<StoredBooking> {
    const booking = await this.deps.bookings.find(
      this.deps.db,
      workspaceId,
      id,
    );
    if (booking == null) throw bookingNotFound();
    return booking;
  }

  /**
   * One change on a locked booking: the stale check, the action's status
   * rule, then `change` writes it inside the transaction.
   */
  private async change<T>(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    flag: "update" | "delete",
    change: (tx: SalesTx, booking: StoredBooking, at: Date) => Promise<T>,
  ): Promise<{ booking: StoredBooking; result: T; at: Date }> {
    const { db, bookings } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, BOOKING_MENU, flag, { projectId: current.projectId });
    const at = this.clock();
    return db.$transaction(async (tx) => {
      const booking = await bookings.lock(tx, access.workspaceId, id);
      if (booking == null) throw bookingNotFound();
      if (booking.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw bookingChanged(booking.updatedAt);
      return { booking, result: await change(tx, booking, at), at };
    });
  }

  private async labelOf(booking: StoredBooking): Promise<string> {
    const { db, directory } = this.deps;
    const [units, wings] = await Promise.all([
      directory.units(db, booking.workspaceId, booking.projectId, [
        booking.unitId,
      ]),
      directory.wingsById(db, booking.workspaceId, booking.projectId, [
        booking.wingId,
      ]),
    ]);
    return unitLabel(
      wings.get(booking.wingId)?.name ?? "",
      units.get(booking.unitId)?.name ?? "",
    );
  }

  /** **Confirm** a hold (Update): On Hold → Booked on a date. */
  async confirm(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    rawDate: string,
  ): Promise<void> {
    const today = await this.deps.today(access.workspaceId);
    const check = await this.deps.backdated(access);
    const { booking, at } = await this.change(
      access,
      id,
      expectedUpdatedAt,
      "update",
      async (tx, booking, at) => {
        assertAction(booking.status, "confirm");
        const date = confirmDate(rawDate, booking, today);
        check("booking", "create", date);
        await this.deps.bookings.update(
          tx,
          id,
          { status: "booked", confirmedOn: date, holdUntil: null },
          access.userId,
          at,
        );
        await this.deps.bookings.appendEvent(tx, {
          workspaceId: access.workspaceId,
          bookingId: id,
          status: "booked",
          onDate: date,
          holdUntil: null,
          reason: null,
          actorUserId: access.userId,
          at,
        });
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "booking.confirmed",
          entityType: "booking",
          entityId: id,
          before: { status: booking.status, holdUntil: booking.holdUntil },
          after: { status: "booked", confirmedOn: date },
          occurredAt: at,
        });
      },
    );
    await this.dispatch([
      {
        type: "BookingConfirmed",
        workspaceId: access.workspaceId,
        occurredAt: at,
        bookingId: id,
        projectId: booking.projectId,
        unitLabel: await this.labelOf(booking),
        customerName: booking.customerName,
        by: access.userId,
      },
    ]);
  }

  /** **Extend hold** (Update): a new Hold until, today or later. */
  async extendHold(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    rawHoldUntil: string,
  ): Promise<void> {
    const today = await this.deps.today(access.workspaceId);
    await this.change(
      access,
      id,
      expectedUpdatedAt,
      "update",
      async (tx, booking, at) => {
        assertAction(booking.status, "extend_hold");
        const holdUntil = extendedHoldUntil(rawHoldUntil, booking, today);
        await this.deps.bookings.update(
          tx,
          id,
          { holdUntil },
          access.userId,
          at,
        );
        await this.deps.bookings.appendEvent(tx, {
          workspaceId: access.workspaceId,
          bookingId: id,
          status: "on_hold",
          onDate: today,
          holdUntil,
          reason: null,
          actorUserId: access.userId,
          at,
        });
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "booking.hold_extended",
          entityType: "booking",
          entityId: id,
          before: { holdUntil: booking.holdUntil },
          after: { holdUntil },
          occurredAt: at,
        });
      },
    );
  }

  /** **Cancel** (Update): a reason and a date; the unit is free again. */
  async cancel(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: { reason: string; cancelledOn: string },
  ): Promise<void> {
    const today = await this.deps.today(access.workspaceId);
    const check = await this.deps.backdated(access);
    const { booking, result, at } = await this.change(
      access,
      id,
      expectedUpdatedAt,
      "update",
      async (tx, booking, at) => {
        assertAction(booking.status, "cancel");
        const fields = cancelFields(input, booking, today);
        check("booking", "create", fields.cancelledOn);
        await this.deps.bookings.update(
          tx,
          id,
          {
            status: "cancelled",
            cancelledOn: fields.cancelledOn,
            cancelReason: fields.reason,
          },
          access.userId,
          at,
        );
        await this.deps.bookings.appendEvent(tx, {
          workspaceId: access.workspaceId,
          bookingId: id,
          status: "cancelled",
          onDate: fields.cancelledOn,
          holdUntil: booking.holdUntil,
          reason: fields.reason,
          actorUserId: access.userId,
          at,
        });
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "booking.cancelled",
          entityType: "booking",
          entityId: id,
          before: { status: booking.status },
          after: { status: "cancelled", ...fields },
          occurredAt: at,
        });
        return fields;
      },
    );
    await this.dispatch([
      {
        type: "BookingCancelled",
        workspaceId: access.workspaceId,
        occurredAt: at,
        bookingId: id,
        projectId: booking.projectId,
        unitLabel: await this.labelOf(booking),
        customerName: booking.customerName,
        reason: result.reason,
        by: access.userId,
      },
    ]);
  }

  /**
   * **Edit** details (Update) of an On Hold or Booked booking: the status,
   * unit and Hold until stay (Extend hold changes Hold until). The
   * back-dated window applies to the old Booking Date and, when it
   * changes, the new one.
   */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: BookingInput,
  ): Promise<void> {
    const today = await this.deps.today(access.workspaceId);
    const check = await this.deps.backdated(access);
    await this.change(
      access,
      id,
      expectedUpdatedAt,
      "update",
      async (tx, booking, at) => {
        assertAction(booking.status, "edit");
        const fields = bookingFields(
          { ...input, holdUntil: booking.holdUntil },
          booking.status,
          today,
        );
        check("booking", "edit", booking.bookingDate);
        if (fields.bookingDate !== booking.bookingDate)
          check("booking", "edit", fields.bookingDate);
        if (
          booking.confirmedOn != null &&
          booking.confirmedOn < fields.bookingDate
        )
          throw new DomainError(
            "CONFIRM_DATE_BEFORE_BOOKING_DATE",
            "The Booking Date cannot be after the date it was confirmed.",
            { details: { field: "bookingDate" } },
          );
        await this.deps.bookings.update(tx, id, fields, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "booking.updated",
          entityType: "booking",
          entityId: id,
          before: fieldsOf(booking),
          after: fields,
          occurredAt: at,
        });
      },
    );
  }

  /**
   * **Delete** (Booking Delete) a booking entered by mistake: a tombstone,
   * audited; the unit is free again. The back-dated edit limit applies to
   * its Booking Date.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const check = await this.deps.backdated(access);
    await this.change(
      access,
      id,
      expectedUpdatedAt,
      "delete",
      async (tx, booking, at) => {
        check("booking", "edit", booking.bookingDate);
        await this.deps.bookings.tombstone(tx, id, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "booking.deleted",
          entityType: "booking",
          entityId: id,
          before: {
            unitId: booking.unitId,
            status: booking.status,
            customerName: booking.customerName,
            bookingDate: booking.bookingDate,
          },
          occurredAt: at,
        });
      },
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async readModels(
    workspaceId: string,
    projectId: string,
    rows: readonly StoredBooking[],
    today: CalendarDate,
  ): Promise<BookingReadModel[]> {
    const { db, directory, profiles, bookings } = this.deps;
    const inquiryIds = rows.flatMap((row) =>
      row.inquiryId == null ? [] : [row.inquiryId],
    );
    const [units, wings, profileMap, inquiries, names] = await Promise.all([
      directory.units(
        db,
        workspaceId,
        projectId,
        rows.map((row) => row.unitId),
      ),
      directory.wingsById(
        db,
        workspaceId,
        projectId,
        rows.map((row) => row.wingId),
      ),
      profiles.profiles(
        db,
        workspaceId,
        projectId,
        rows.map((row) => row.unitId),
      ),
      bookings.inquiryNames(db, workspaceId, inquiryIds),
      directory.userNames(
        db,
        workspaceId,
        rows.map((row) => row.createdBy),
      ),
    ]);
    return rows.map((row) => {
      const unit = units.get(row.unitId);
      const profile = profileMap.get(row.unitId);
      return {
        ...row,
        displayStatus: bookingDisplayStatus(row, today),
        unit: {
          id: row.unitId,
          name: unit?.name ?? "",
          floorName: unit?.floorName ?? "",
          deleted: unit?.deleted ?? true,
        },
        wing: { id: row.wingId, name: wings.get(row.wingId)?.name ?? "" },
        unitType: profile?.unitType ?? null,
        carpetArea: profile?.carpetArea ?? null,
        areaUnit: profile?.areaUnit ?? "sq_ft",
        inquiry:
          row.inquiryId == null
            ? null
            : {
                id: row.inquiryId,
                name: inquiries.get(row.inquiryId) ?? "",
              },
        createdByPerson: {
          userId: row.createdBy,
          name: names.get(row.createdBy) ?? null,
        },
      };
    });
  }

  /** One booking (Booking Read on its Project) with its status history. */
  async get(access: MemberAccess, id: string): Promise<BookingDetail> {
    const booking = await this.find(access.workspaceId, id);
    assertCan(access, BOOKING_MENU, "read", { projectId: booking.projectId });
    const { db, bookings, directory } = this.deps;
    const today = await this.deps.today(access.workspaceId);
    const [[model], rows] = await Promise.all([
      this.readModels(access.workspaceId, booking.projectId, [booking], today),
      bookings.history(db, access.workspaceId, id),
    ]);
    if (model == null) throw bookingNotFound();
    const names = await directory.userNames(
      db,
      access.workspaceId,
      rows.flatMap((row) =>
        row.actorUserId === SYSTEM_ACTOR ? [] : [row.actorUserId],
      ),
    );
    const kinds = bookingHistoryKinds(rows);
    return {
      ...model,
      history: rows.map((row, index) => ({
        ...row,
        kind: kinds[index] ?? "created",
        by: {
          userId: row.actorUserId,
          name:
            row.actorUserId === SYSTEM_ACTOR
              ? "System"
              : (names.get(row.actorUserId) ?? null),
        },
      })),
    };
  }

  /** A page of the Project's bookings, newest first (Booking Read). */
  async list(
    access: MemberAccess,
    params: Omit<BookingListParams, "workspaceId" | "today">,
  ) {
    assertCan(access, BOOKING_MENU, "read", { projectId: params.projectId });
    const today = await this.deps.today(access.workspaceId);
    const page = await this.deps.bookings.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      today,
    });
    return {
      ...page,
      items: await this.readModels(
        access.workspaceId,
        params.projectId,
        page.items,
        today,
      ),
    };
  }

  /**
   * The units that can be booked now (CM-0022 §6, §7): live, not
   * Unavailable, and with no active booking — a hold past its Hold until
   * date does not count. For the booking form and the Converted dialog.
   */
  async bookableUnits(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
  ): Promise<BookableWing[]> {
    const { directory, profiles, bookings } = this.deps;
    const [today, wings, profileMap, active] = await Promise.all([
      this.deps.today(workspaceId),
      directory.wings(db, workspaceId, projectId),
      profiles.profiles(db, workspaceId, projectId),
      bookings.active(db, workspaceId, projectId),
    ]);
    return wings
      .map((wing) => ({
        id: wing.id,
        name: wing.name,
        units: wing.floors.flatMap((floor) =>
          floor.units
            .filter((unit) => {
              if (profileMap.get(unit.id)?.unavailable === true) return false;
              const booking = active.get(unit.id);
              return booking == null || isHoldExpired(booking, today);
            })
            .map((unit) => ({
              id: unit.id,
              name: unit.name,
              floorName: floor.name,
            })),
        ),
      }))
      .filter((wing) => wing.units.length > 0);
  }
}
