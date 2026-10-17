import type { MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import { HOLD_EXPIRED_REASON, SYSTEM_ACTOR } from "../domain/sales-terms";
import type {
  BookingStore,
  StoredBooking,
  UnitProfileStore,
} from "./booking-ports";
import type { SalesDirectory, SalesTx } from "./ports";

/** The menu of Bookings, units included (ADR CM-0022 §1). */
export const BOOKING_MENU = "sales.bookings" as const;

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type BookingBackdatedCheck = (
  module: "booking",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type SalesDb = SalesTx & {
  $transaction<T>(fn: (tx: SalesTx) => Promise<T>): Promise<T>;
};

/** What the unit and booking commands need (wired in `src/composition/sales-bookings.ts`). */
export type SalesBookingDeps = {
  db: SalesDb;
  directory: SalesDirectory;
  profiles: UnitProfileStore;
  bookings: BookingStore;
  /** The Company's today. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  backdated: (access: MemberAccess) => Promise<BookingBackdatedCheck>;
  /** `BookingCreated`, `BookingConfirmed`, `BookingCancelled` → messaging. */
  events: EventDispatcher;
  clock?: () => Date;
};

/**
 * Cancels a hold past its Hold until date for the system (CM-0022 §7):
 * status Cancelled on `today` with the reason "Hold expired", a history
 * row and an audit event by `system`. Called inside the transaction that
 * books the unit again (or marks it unavailable), holding the unit's lock.
 */
export async function cancelExpiredHold(
  deps: Pick<SalesBookingDeps, "bookings">,
  tx: SalesTx,
  booking: StoredBooking,
  today: CalendarDate,
  at: Date,
): Promise<void> {
  await deps.bookings.update(
    tx,
    booking.id,
    {
      status: "cancelled",
      cancelledOn: today,
      cancelReason: HOLD_EXPIRED_REASON,
    },
    SYSTEM_ACTOR,
    at,
  );
  await deps.bookings.appendEvent(tx, {
    workspaceId: booking.workspaceId,
    bookingId: booking.id,
    status: "cancelled",
    onDate: today,
    holdUntil: booking.holdUntil,
    reason: HOLD_EXPIRED_REASON,
    actorUserId: SYSTEM_ACTOR,
    at,
  });
  await recordAudit(tx, {
    workspaceId: booking.workspaceId,
    actorUserId: SYSTEM_ACTOR,
    action: "booking.cancelled",
    entityType: "booking",
    entityId: booking.id,
    before: { status: booking.status, holdUntil: booking.holdUntil },
    after: { status: "cancelled", reason: HOLD_EXPIRED_REASON },
    occurredAt: at,
  });
}
