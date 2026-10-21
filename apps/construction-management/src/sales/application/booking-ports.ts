import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { BookingDisplayStatus, BookingFields } from "../domain/booking";
import type { BookingStatus, UnavailableReason } from "../domain/sales-terms";
import type { UnitProfileFields } from "../domain/unit-profile";
import type { SalesTx } from "./ports";

/**
 * Stores of the unit sales profiles and bookings (CM-1005, CM-1006).
 * Prisma in `infrastructure/prisma-unit-profile-store.ts` and
 * `infrastructure/prisma-booking-store.ts`; every method runs on the client
 * it is given, so writes join the caller's transaction.
 */

export type StoredUnitProfile = UnitProfileFields & {
  unitId: string;
  workspaceId: string;
  projectId: string;
  wingId: string;
  unavailable: boolean;
  unavailableReason: UnavailableReason | null;
  unavailableNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** One unit's whole profile, as an import or a command writes it. */
export type UnitProfileRow = UnitProfileFields & {
  unitId: string;
  workspaceId: string;
  projectId: string;
  wingId: string;
  unavailable: boolean;
  unavailableReason: UnavailableReason | null;
  unavailableNote: string | null;
};

export type UnitProfileStore = {
  /** The Project's profiles by unit id (only `unitIds` when given). */
  profiles(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitIds?: readonly string[],
  ): Promise<Map<string, StoredUnitProfile>>;
  /** Inserts or replaces each row (`created_*` kept on a replace). */
  save(
    db: SalesTx,
    rows: readonly UnitProfileRow[],
    by: string,
    at: Date,
  ): Promise<void>;
};

export type StoredBooking = BookingFields & {
  id: string;
  workspaceId: string;
  projectId: string;
  wingId: string;
  unitId: string;
  status: BookingStatus;
  inquiryId: string | null;
  confirmedOn: CalendarDate | null;
  cancelledOn: CalendarDate | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type NewBooking = BookingFields & {
  id: string;
  workspaceId: string;
  projectId: string;
  wingId: string;
  unitId: string;
  status: "on_hold" | "booked";
  inquiryId: string | null;
  confirmedOn: CalendarDate | null;
};

export type BookingChange = Partial<
  BookingFields & {
    status: BookingStatus;
    confirmedOn: CalendarDate | null;
    cancelledOn: CalendarDate | null;
    cancelReason: string | null;
  }
>;

/** A history row (`booking_events`). */
export type StoredBookingEvent = {
  id: string;
  bookingId: string;
  status: BookingStatus;
  onDate: CalendarDate;
  holdUntil: CalendarDate | null;
  reason: string | null;
  occurredAt: Date;
  actorUserId: string;
};

export type NewBookingEvent = {
  workspaceId: string;
  bookingId: string;
  status: BookingStatus;
  onDate: CalendarDate;
  holdUntil: CalendarDate | null;
  reason: string | null;
  actorUserId: string;
  at: Date;
};

export type BookingListParams = {
  workspaceId: string;
  projectId: string;
  /** The Company's today: Hold expired is derived from it. */
  today: CalendarDate;
  statuses?: readonly BookingDisplayStatus[];
  wingId?: string;
  unitId?: string;
  /** Part of the customer's name, mobile or email, or the Referred By name. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type BookingStore = {
  /**
   * Queues writers on one unit (a transaction-scoped advisory lock), so
   * booking it and marking it unavailable never interleave.
   */
  lockUnits(
    db: SalesTx,
    workspaceId: string,
    unitIds: readonly string[],
  ): Promise<void>;
  find(
    db: SalesTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBooking | null>;
  /** The live booking, locked `FOR UPDATE`. */
  lock(
    db: SalesTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBooking | null>;
  /** Live On Hold or Booked bookings by unit (all of the Project without `unitIds`). */
  active(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitIds?: readonly string[],
  ): Promise<Map<string, StoredBooking>>;
  /** A unit's live bookings, newest first. */
  ofUnit(
    db: SalesTx,
    workspaceId: string,
    unitId: string,
  ): Promise<StoredBooking[]>;
  /**
   * Inserts the booking; 409 `UNIT_BOOKED` when the "one active booking
   * per unit" index refuses it (a race the lock did not cover).
   */
  insert(db: SalesTx, row: NewBooking, by: string, at: Date): Promise<void>;
  update(
    db: SalesTx,
    id: string,
    change: BookingChange,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: SalesTx, id: string, by: string, at: Date): Promise<void>;
  appendEvent(db: SalesTx, event: NewBookingEvent): Promise<void>;
  /** Oldest first. */
  history(
    db: SalesTx,
    workspaceId: string,
    bookingId: string,
  ): Promise<StoredBookingEvent[]>;
  /** Newest first (by when they were recorded). */
  list(
    db: SalesTx,
    params: BookingListParams,
  ): Promise<{ items: StoredBooking[]; hasMore: boolean; total: number }>;
  /** Inquiries by id (deleted ones included), for "From inquiry …". */
  inquiryNames(
    db: SalesTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
};
