import { describe, expect, it } from "vitest";

import {
  ageingBucket,
  invoiceBalance,
  invoiceWrittenOff,
  isOverdue,
  partyDues,
  tdsShare,
  type DueInvoice,
} from "./dues";

function invoice(overrides: Partial<DueInvoice> = {}): DueInvoice {
  return {
    id: "i1",
    partyType: "contractor",
    partyId: "c1",
    projectId: "p1",
    direction: "payable",
    invoiceDate: "2026-06-01",
    dueDate: "2026-07-01",
    amount: 100_000n,
    allocated: 0n,
    writtenOff: 0n,
    settled: false,
    ...overrides,
  };
}

describe("invoice balance", () => {
  it("is amount − allocated − written off, never below zero", () => {
    expect(invoiceBalance(invoice({ allocated: 30_000n }))).toBe(70_000n);
    expect(
      invoiceBalance(invoice({ allocated: 30_000n, writtenOff: 70_000n })),
    ).toBe(0n);
    expect(invoiceBalance(invoice({ allocated: 120_000n }))).toBe(0n);
  });

  it("a settled invoice without write-off entries has nothing left", () => {
    const settled = invoice({ allocated: 40_000n, settled: true });
    expect(invoiceBalance(settled)).toBe(0n);
    expect(invoiceWrittenOff(settled)).toBe(60_000n);
  });
});

describe("ageing", () => {
  it("buckets by days past the due date; due today is not due", () => {
    const due = { invoiceDate: "2026-01-01", dueDate: "2026-07-01" };
    expect(ageingBucket(due, "2026-06-30")).toBe("not_due");
    expect(ageingBucket(due, "2026-07-01")).toBe("not_due");
    expect(ageingBucket(due, "2026-07-02")).toBe("days_0_30");
    expect(ageingBucket(due, "2026-07-31")).toBe("days_0_30");
    expect(ageingBucket(due, "2026-08-01")).toBe("days_31_60");
    expect(ageingBucket(due, "2026-08-30")).toBe("days_31_60");
    expect(ageingBucket(due, "2026-08-31")).toBe("days_61_90");
    expect(ageingBucket(due, "2026-09-29")).toBe("days_61_90");
    expect(ageingBucket(due, "2026-09-30")).toBe("days_90_plus");
  });

  it("without a due date an invoice is never due (as the party screens say)", () => {
    expect(ageingBucket({ dueDate: null }, "2027-07-11")).toBe("not_due");
    expect(isOverdue(invoice({ dueDate: null }), "2027-07-11")).toBe(false);
  });

  it("is overdue only while something is left", () => {
    expect(isOverdue(invoice(), "2026-07-02")).toBe(true);
    expect(isOverdue(invoice(), "2026-07-01")).toBe(false);
    expect(isOverdue(invoice({ allocated: 100_000n }), "2026-09-01")).toBe(
      false,
    );
  });
});

describe("party dues", () => {
  it("sums each party and direction with buckets and overdue", () => {
    const dues = partyDues(
      [
        invoice({ id: "a", dueDate: "2026-07-01", allocated: 20_000n }),
        invoice({ id: "b", dueDate: "2026-09-01", amount: 50_000n }),
        invoice({ id: "c", dueDate: "2026-10-30", amount: 10_000n }),
        invoice({
          id: "d",
          partyId: "c2",
          amount: 5_000n,
          allocated: 5_000n,
        }),
        invoice({
          id: "e",
          partyType: "other_party",
          partyId: "o1",
          direction: "receivable",
          amount: 7_000n,
        }),
      ],
      "2026-10-11",
    );
    expect(dues).toHaveLength(3);
    const [c1, c2, o1] = dues;
    expect(c1).toMatchObject({
      partyId: "c1",
      invoiced: 160_000n,
      paid: 20_000n,
      due: 140_000n,
      overdue: 130_000n,
      openInvoices: 3,
      projectIds: ["p1"],
    });
    expect(c1?.ageing).toEqual({
      not_due: 10_000n,
      days_0_30: 0n,
      days_31_60: 50_000n,
      days_61_90: 0n,
      days_90_plus: 80_000n,
    });
    expect(c2).toMatchObject({ due: 0n, openInvoices: 0, paid: 5_000n });
    expect(o1).toMatchObject({ direction: "receivable", due: 7_000n });
  });
});

describe("TDS share of an allocation", () => {
  it("splits in the payment's proportion, half up to the paisa", () => {
    // Paid 98,000 + TDS 2,000 = 1,00,000 settled; 50,000 allocated → 1,000 TDS.
    expect(tdsShare(50_000n, { amount: 98_000n, tdsAmount: 2_000n })).toBe(
      1_000n,
    );
    expect(tdsShare(1n, { amount: 1n, tdsAmount: 1n })).toBe(1n);
    expect(tdsShare(100n, { amount: 100n, tdsAmount: 0n })).toBe(0n);
  });
});
