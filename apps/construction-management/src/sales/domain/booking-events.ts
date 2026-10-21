import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * Booking events (CM-1006, ADR CM-0022 §10), raised after commit. Messaging
 * turns them into `booking.created`, `booking.confirmed` and
 * `booking.cancelled` for the Booking Read + Notification holders on the
 * Project (`src/messaging/application/inbound-events.ts` keeps a copy).
 * A hold the system cancels on rebooking raises nothing.
 */
type BookingEventBase = DomainEvent & {
  bookingId: string;
  projectId: string;
  /** "A-101": the unit as named in the Wing editor, with its Wing. */
  unitLabel: string;
  customerName: string;
  /** User id of who did it. */
  by: string;
};

export type BookingCreated = BookingEventBase & {
  type: "BookingCreated";
  status: "on_hold" | "booked";
};

export type BookingConfirmed = BookingEventBase & { type: "BookingConfirmed" };

export type BookingCancelled = BookingEventBase & {
  type: "BookingCancelled";
  reason: string;
};

export type BookingEvent = BookingCreated | BookingConfirmed | BookingCancelled;
