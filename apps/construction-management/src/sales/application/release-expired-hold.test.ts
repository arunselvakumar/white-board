import { describe, expect, it, vi } from "vitest";

import type { BookingStore, StoredBooking } from "./booking-ports";
import type { SalesTx } from "./ports";
import { releaseExpiredHold } from "./sales-booking-deps";

const TODAY = "2026-10-17";
const tx = {} as SalesTx;

function booking(change: Partial<StoredBooking> = {}): StoredBooking {
  return {
    id: "b1",
    workspaceId: "ws",
    projectId: "p",
    wingId: "w",
    unitId: "u",
    status: "on_hold",
    holdUntil: "2026-10-12",
    inquiryId: null,
    confirmedOn: null,
    cancelledOn: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user",
    updatedBy: "user",
    ...change,
  } as StoredBooking;
}

function store(locked: StoredBooking | null) {
  const update = vi.fn();
  const bookings = {
    lock: vi.fn(() => Promise.resolve(locked)),
    update,
  } as unknown as BookingStore;
  return { bookings, update };
}

describe("releaseExpiredHold (CM-0022 §7, review of #92)", () => {
  it("keeps a hold that was confirmed after the unit's bookings were read", async () => {
    const { bookings, update } = store(
      booking({ status: "booked", confirmedOn: "2026-10-16" }),
    );
    const holding = await releaseExpiredHold(
      { bookings },
      tx,
      booking(),
      TODAY,
      new Date(),
    );
    expect(holding?.status).toBe("booked");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a hold whose Hold until was extended in between", async () => {
    const { bookings, update } = store(booking({ holdUntil: "2026-10-24" }));
    const holding = await releaseExpiredHold(
      { bookings },
      tx,
      booking(),
      TODAY,
      new Date(),
    );
    expect(holding?.holdUntil).toBe("2026-10-24");
    expect(update).not.toHaveBeenCalled();
  });

  it("frees the unit when the booking was cancelled or deleted in between", async () => {
    for (const locked of [booking({ status: "cancelled" }), null]) {
      const { bookings, update } = store(locked);
      await expect(
        releaseExpiredHold({ bookings }, tx, booking(), TODAY, new Date()),
      ).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    }
  });
});
