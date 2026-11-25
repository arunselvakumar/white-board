import { describe, expect, it } from "vitest";

import {
  feeDateLabel,
  feeReferenceLabel,
  frequencyOptions,
  monthStartOf,
  parentContact,
  receiptShareUrl,
  suggestedPaymentPaise,
} from "./preschool-fees";

describe("preschool fee helpers", () => {
  it("labels the reference by method, with none for cash", () => {
    expect(feeReferenceLabel("cash")).toBeNull();
    expect(feeReferenceLabel("upi")).toBe("UPI reference");
    expect(feeReferenceLabel("cheque")).toBe("Cheque number");
    expect(feeReferenceLabel("bank_transfer")).toBe("Bank reference");
  });

  it("offers only the frequencies a Fee Head's kind allows", () => {
    expect(frequencyOptions("one_time").map((option) => option.value)).toEqual([
      "one_time",
      "annual",
    ]);
    expect(frequencyOptions("recurring").map((option) => option.label)).toEqual(
      ["Monthly", "Quarterly", "Per term", "Annual"],
    );
  });

  it("reads dates as written and finds the month's start", () => {
    expect(feeDateLabel("2026-11-25")).toBe("25 Nov 2026");
    expect(monthStartOf("2026-11-25")).toBe("2026-11-01");
  });

  it("suggests the overdue amount first, else everything due", () => {
    expect(suggestedPaymentPaise({ duePaise: 900, overduePaise: 300 })).toBe(
      300,
    );
    expect(suggestedPaymentPaise({ duePaise: 900, overduePaise: 0 })).toBe(900);
  });

  it("picks the parent with a mobile number", () => {
    expect(
      parentContact({
        fatherName: "Ravi",
        fatherPhone: "044 2345 6789",
        motherName: "Meena",
        motherPhone: "98765 43210",
      }),
    ).toEqual({ name: "Meena", phone: "98765 43210" });
    expect(
      parentContact({
        fatherName: "Ravi",
        fatherPhone: "044 2345 6789",
        motherName: "Meena",
        motherPhone: null,
      }),
    ).toEqual({ name: "Ravi", phone: "044 2345 6789" });
    expect(
      parentContact({
        fatherName: "Ravi",
        fatherPhone: null,
        motherName: null,
        motherPhone: " ",
      }),
    ).toBeNull();
  });

  it("shares a Receipt on WhatsApp with the amount, number and balance", () => {
    const url = new URL(
      receiptShareUrl({
        centreName: "Little Steps",
        childName: "Aarav",
        receiptNumber: "LS/2026-27/00001",
        receivedOn: "2026-11-25",
        amountPaise: 1_250_000,
        balanceDuePaise: 3_100_000,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(
      "Little Steps: Fee Receipt LS/2026-27/00001 — ₹12,500 received for Aarav on 25 Nov 2026. Balance due: ₹31,000. Thank you.",
    );
  });
});
