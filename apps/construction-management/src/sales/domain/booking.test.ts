import { describe, expect, it } from "vitest";

import {
  assertAction,
  bookingDisplayStatus,
  bookingFields,
  bookingHistoryKinds,
  cancelFields,
  confirmDate,
  extendedHoldUntil,
} from "./booking";

const TODAY = "2026-10-17";

describe("bookingFields (CM-0022 §7)", () => {
  const base = { bookingDate: "2026-10-10", customerName: " Meena  R " };

  it("normalises the customer and keeps Hold until only On Hold", () => {
    const fields = bookingFields(
      {
        ...base,
        holdUntil: "2026-10-20",
        customerMobile: "98765 43210",
        customerEmail: "meena@example.com",
        referredByContact: "",
      },
      "on_hold",
      TODAY,
    );
    expect(fields).toMatchObject({
      customerName: "Meena R",
      customerMobile: "+919876543210",
      holdUntil: "2026-10-20",
      referredByContact: null,
    });
    expect(
      bookingFields({ ...base, holdUntil: "2026-10-20" }, "booked", TODAY)
        .holdUntil,
    ).toBeNull();
  });

  it.each([
    [{ bookingDate: "2026-10-18" }, "BOOKING_DATE_IN_FUTURE"],
    [{ bookingDate: "" }, "BOOKING_DATE_REQUIRED"],
    [{ holdUntil: "2026-10-09" }, "HOLD_UNTIL_BEFORE_BOOKING_DATE"],
    [{ customerName: "  " }, "CUSTOMER_NAME_REQUIRED"],
    [{ customerMobile: "12345" }, "MOBILE_INVALID"],
    [{ customerEmail: "meena@" }, "EMAIL_INVALID"],
  ])("refuses %o with %s", (patch, code) => {
    expect(() =>
      bookingFields({ ...base, ...patch }, "on_hold", TODAY),
    ).toThrow(expect.objectContaining({ code }));
  });
});

describe("booking actions", () => {
  const booking = { bookingDate: "2026-10-10" };

  it("shows Hold expired after Hold until", () => {
    expect(
      bookingDisplayStatus(
        { status: "on_hold", holdUntil: "2026-10-16" },
        TODAY,
      ),
    ).toBe("hold_expired");
    expect(
      bookingDisplayStatus({ status: "on_hold", holdUntil: TODAY }, TODAY),
    ).toBe("on_hold");
  });

  it("confirms, extends and cancels within the dates", () => {
    expect(confirmDate("2026-10-12", booking, TODAY)).toBe("2026-10-12");
    expect(() => confirmDate("2026-10-09", booking, TODAY)).toThrow(
      expect.objectContaining({ code: "CONFIRM_DATE_BEFORE_BOOKING_DATE" }),
    );
    expect(extendedHoldUntil("2026-10-30", booking, TODAY)).toBe("2026-10-30");
    expect(() => extendedHoldUntil("2026-10-16", booking, TODAY)).toThrow(
      expect.objectContaining({ code: "HOLD_UNTIL_IN_PAST" }),
    );
    expect(
      cancelFields(
        { reason: " Loan refused ", cancelledOn: TODAY },
        booking,
        TODAY,
      ),
    ).toEqual({ reason: "Loan refused", cancelledOn: TODAY });
    expect(() =>
      cancelFields(
        { reason: "x".repeat(501), cancelledOn: TODAY },
        booking,
        TODAY,
      ),
    ).toThrow(expect.objectContaining({ code: "CANCEL_REASON_TOO_LONG" }));
  });

  it("refuses an action the status does not take", () => {
    expect(() => {
      assertAction("booked", "confirm");
    }).toThrow(expect.objectContaining({ code: "BOOKING_NOT_ON_HOLD" }));
    expect(() => {
      assertAction("cancelled", "cancel");
    }).toThrow(expect.objectContaining({ code: "BOOKING_CANCELLED" }));
  });

  it("names each history row from the one before", () => {
    expect(
      bookingHistoryKinds([
        { status: "on_hold" },
        { status: "on_hold" },
        { status: "booked" },
        { status: "cancelled" },
      ]),
    ).toEqual(["created", "hold_extended", "confirmed", "cancelled"]);
  });
});
