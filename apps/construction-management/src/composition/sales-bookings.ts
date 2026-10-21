import { prisma } from "@repo/construction-db";

import { messagingEvents } from "@/src/composition/messaging";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { salesDirectory } from "@/src/composition/sales-directory";
import { BookingFiles } from "@/src/sales/application/booking-files";
import {
  BookingHandlers,
  type BookableWing,
  type BookUnitInTxInput,
} from "@/src/sales/application/booking-handlers";
import type { SalesTx } from "@/src/sales/application/ports";
import type { SalesBookingDeps } from "@/src/sales/application/sales-booking-deps";
import { UnitSalesHandlers } from "@/src/sales/application/unit-sales-handlers";
import { PrismaBookingFileStore } from "@/src/sales/infrastructure/booking-files-store";
import { PrismaBookingStore } from "@/src/sales/infrastructure/prisma-booking-store";
import { PrismaUnitProfileStore } from "@/src/sales/infrastructure/prisma-unit-profile-store";
import { companyToday } from "@/src/shared-kernel/company-today";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

/**
 * Units and Bookings of the sales context (CM-1005, CM-1006) wired to
 * Prisma, the `SalesDirectory`, the Back-dated Entry policy and messaging
 * (`booking.created`, `booking.confirmed`, `booking.cancelled`).
 */
export function createSalesBookingDeps(): SalesBookingDeps {
  return {
    db: prisma,
    directory: salesDirectory,
    profiles: new PrismaUnitProfileStore(),
    bookings: new PrismaBookingStore(),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    events: messagingEvents(),
  };
}

export const salesBookingDeps = createSalesBookingDeps();

/** One set of handlers for every units and bookings route. */
export const unitSalesHandlers = new UnitSalesHandlers(salesBookingDeps);
export const bookingHandlers = new BookingHandlers(salesBookingDeps);

/**
 * A booking's Booking Form and photos (personal data: not in the Gallery).
 * Storage limits are the organization context's plan.
 */
export const bookingFiles = new BookingFiles(
  new PrismaBookingFileStore(prisma, salesDirectory),
  objectStorage(),
  createPlanGate(),
);

/**
 * Creates a **Booked** booking inside the caller's transaction (CM-1007:
 * closing an inquiry as Converted). Every unit rule applies — 404
 * `UNIT_NOT_FOUND` (not a live unit of the Project), 409
 * `UNIT_UNAVAILABLE`, 409 `UNIT_BOOKED`; a hold past its Hold until date
 * is cancelled ("Hold expired", by `system`) — and the history row and
 * audit event are written in `tx`. Throws 400 for a Booking Date after
 * today or a bad mobile / email. The caller checks Inquiry Update and
 * Booking Create and the back-dated window, and calls `afterCommit()`
 * after its transaction commits (it sends `booking.created`).
 */
export function bookUnitInTx(
  tx: SalesTx,
  input: BookUnitInTxInput,
): Promise<{ bookingId: string; afterCommit: () => Promise<void> }> {
  return bookingHandlers.bookInTx(tx, input);
}

/**
 * The units a Project can book now, by Wing (live, not Unavailable, no
 * active booking; an expired hold counts as free), for the Converted
 * dialog's unit picker (CM-1007) and the booking form.
 */
export function bookableUnits(
  db: SalesTx,
  workspaceId: string,
  projectId: string,
): Promise<BookableWing[]> {
  return bookingHandlers.bookableUnits(db, workspaceId, projectId);
}
