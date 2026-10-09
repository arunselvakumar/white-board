import { describe, expect, it } from "vitest";

import { MAX_PAISE } from "./labour";
import { paymentLedgerEntries, wagePayment } from "./wage-payment";

const base = {
  partyType: "labour" as const,
  partyId: "l1",
  projectId: "p1",
  paymentDate: "2026-10-31",
  kind: "payment" as const,
  mode: "cash" as const,
  amount: 5_00_000,
};

describe("wagePayment", () => {
  it("posts one negative entry of its kind", () => {
    const payment = wagePayment({ ...base, reference: "  ", remarks: " Oct " });
    expect(payment).toMatchObject({ reference: null, remarks: "Oct" });
    expect(paymentLedgerEntries(payment, "w1")).toEqual([
      expect.objectContaining({
        kind: "payment",
        amount: -5_00_000,
        sourceType: "wage_payment",
        sourceId: "w1",
        entryDate: "2026-10-31",
      }),
    ]);
    expect(
      paymentLedgerEntries(wagePayment({ ...base, kind: "advance" }), "w2")[0],
    ).toMatchObject({ kind: "advance", amount: -5_00_000 });
  });

  it("needs an amount above zero and short texts", () => {
    for (const amount of [0, -1, 1.5])
      expect(() => wagePayment({ ...base, amount })).toThrow(
        expect.objectContaining({ code: "PAYMENT_AMOUNT_INVALID" }),
      );
    expect(() => wagePayment({ ...base, reference: "x".repeat(101) })).toThrow(
      expect.objectContaining({ code: "PAYMENT_REFERENCE_TOO_LONG" }),
    );
  });

  it("keeps one payment within ₹2 crore so the row fits an integer", () => {
    expect(wagePayment({ ...base, amount: MAX_PAISE }).amount).toBe(MAX_PAISE);
    expect(() => wagePayment({ ...base, amount: MAX_PAISE + 1 })).toThrow(
      expect.objectContaining({ code: "AMOUNT_TOO_LARGE" }),
    );
  });
});
