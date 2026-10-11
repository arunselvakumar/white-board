import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import type { TdsSuggestion } from "./tds";
import {
  financialYearOf,
  financialYearRange,
  gstShareOf,
  quarterOf,
  recordedTds,
} from "./tds-payment";

const suggestion: TdsSuggestion = {
  section: "194C",
  label: "393 (194C)",
  rate: "1.00",
  base: 50_000_00n,
  amount: 500_00n,
  reason: "single",
  catchUpBase: 0n,
};

describe("financial years and quarters", () => {
  it("runs April to March", () => {
    expect(financialYearRange(2026)).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
    expect(financialYearOf("2027-03-31")).toBe(2026);
    expect(financialYearOf("2027-04-01")).toBe(2027);
  });

  it("puts April–June in Q1 and January–March in Q4", () => {
    expect(quarterOf("2026-04-01")).toBe(1);
    expect(quarterOf("2026-09-30")).toBe(2);
    expect(quarterOf("2026-12-31")).toBe(3);
    expect(quarterOf("2027-03-31")).toBe(4);
  });
});

describe("GST share", () => {
  it("takes allocation × GST ÷ amount for invoices with GST", () => {
    const invoices = new Map([
      ["a", { amount: 1_18_000n, gstAmount: 18_000n }],
      ["b", { amount: 50_000n, gstAmount: null }],
    ]);
    expect(
      gstShareOf(
        [
          { invoiceId: "a", amount: 59_000n },
          { invoiceId: "b", amount: 50_000n },
        ],
        invoices,
      ),
    ).toBe(9_000n);
  });
});

describe("recorded TDS", () => {
  it("keeps the suggestion when the amount matches", () => {
    expect(recordedTds(suggestion, { amount: 500_00n })).toMatchObject({
      base: 50_000_00n,
      rate: "1.00",
      suggested: 500_00n,
      overrideReason: null,
    });
  });

  it("needs a reason for a different amount", () => {
    let code: string | null = null;
    try {
      recordedTds(suggestion, { amount: 0n });
    } catch (error) {
      code = error instanceof DomainError ? error.code : "OTHER";
    }
    expect(code).toBe("TDS_OVERRIDE_REASON_REQUIRED");
    expect(
      recordedTds(suggestion, {
        amount: 250_00n,
        rate: "0.5",
        overrideReason: "Lower deduction certificate",
      }),
    ).toMatchObject({ rate: "0.50", amount: 250_00n, suggested: 500_00n });
  });
});
