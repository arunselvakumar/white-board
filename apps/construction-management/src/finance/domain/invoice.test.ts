import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertAmountCovers,
  dueDateFromTerms,
  hasVariance,
  invoiceEntry,
  invoiceFields,
  invoiceProgress,
  writeOffEntry,
} from "./invoice";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

const base = { invoiceDate: "2026-06-10", amount: 1_00_000_00n };

describe("invoice fields", () => {
  it("needs a typed number on a bill from the party, none on a sales invoice", () => {
    expect(code(() => invoiceFields("supplier", "payable", base))).toBe(
      "INVOICE_NUMBER_REQUIRED",
    );
    expect(
      invoiceFields("other_party", "receivable", {
        ...base,
        invoiceNumber: "ignored",
      }).invoiceNumber,
    ).toBeNull();
    expect(
      invoiceFields("supplier", "payable", {
        ...base,
        invoiceNumber: "  INV  12 ",
      }).invoiceNumber,
    ).toBe("INV 12");
  });

  it("bills only an Other Party with a sales invoice", () => {
    expect(code(() => invoiceFields("contractor", "receivable", base))).toBe(
      "SALES_INVOICE_ONLY_FOR_OTHER_PARTIES",
    );
  });

  it("keeps the due date on or after the invoice date", () => {
    expect(
      code(() =>
        invoiceFields("supplier", "payable", {
          ...base,
          invoiceNumber: "A1",
          dueDate: "2026-06-09",
        }),
      ),
    ).toBe("DUE_DATE_BEFORE_INVOICE");
  });

  it("keeps taxable + GST within the amount, and Departments for Contractors", () => {
    expect(
      code(() =>
        invoiceFields("contractor", "payable", {
          ...base,
          invoiceNumber: "A1",
          taxableAmount: 90_000_00n,
          gstAmount: 18_000_00n,
        }),
      ),
    ).toBe("INVOICE_SPLIT_EXCEEDS_AMOUNT");
    expect(
      code(() =>
        invoiceFields("supplier", "payable", {
          ...base,
          invoiceNumber: "A1",
          departmentId: "d",
        }),
      ),
    ).toBe("DEPARTMENT_ONLY_FOR_CONTRACTORS");
  });
});

describe("invoice progress", () => {
  const invoice = {
    amount: 1000n,
    allocated: 0n,
    writtenOff: 0n,
    dueDate: "2026-06-30",
    settledAt: null,
  };

  it("derives Open, Partly paid, Paid and Settled", () => {
    expect(invoiceProgress(invoice, "2026-06-01").status).toBe("open");
    expect(
      invoiceProgress({ ...invoice, allocated: 400n }, "2026-06-01"),
    ).toMatchObject({ status: "partly_paid", balance: 600n });
    expect(
      invoiceProgress({ ...invoice, allocated: 1000n }, "2026-07-10"),
    ).toMatchObject({ status: "paid", overdue: false });
    expect(
      invoiceProgress(
        {
          ...invoice,
          allocated: 400n,
          writtenOff: 600n,
          settledAt: new Date(),
        },
        "2026-07-10",
      ),
    ).toMatchObject({ status: "settled", balance: 0n, overdue: false });
  });

  it("is overdue after the due date while a balance remains", () => {
    expect(invoiceProgress(invoice, "2026-06-30").overdue).toBe(false);
    expect(invoiceProgress(invoice, "2026-07-05")).toMatchObject({
      overdue: true,
      daysOverdue: 5,
    });
  });
});

describe("invoice entries", () => {
  const place = { kind: "project" as const, id: "p" };
  it("posts + for a bill and − for a sales invoice", () => {
    const common = {
      id: "i",
      partyType: "other_party" as const,
      partyId: "o",
      place,
      invoiceDate: "2026-06-10",
      amount: 500n,
    };
    expect(invoiceEntry({ ...common, direction: "payable" })).toMatchObject({
      kind: "invoice",
      amount: 500n,
      projectId: "p",
      storeId: null,
    });
    expect(invoiceEntry({ ...common, direction: "receivable" })).toMatchObject({
      kind: "sales_invoice",
      amount: -500n,
    });
  });

  it("writes off − on a bill and + on a sales invoice", () => {
    const invoice = {
      id: "i",
      partyType: "other_party" as const,
      partyId: "o",
      place,
    };
    expect(
      writeOffEntry({
        settlementId: "s",
        invoice: { ...invoice, direction: "payable" },
        balance: 70n,
        date: "2026-07-01",
      }),
    ).toMatchObject({
      kind: "write_off",
      amount: -70n,
      sourceType: "settlement",
    });
    expect(
      writeOffEntry({
        settlementId: "s",
        invoice: { ...invoice, direction: "receivable" },
        balance: 70n,
        date: "2026-07-01",
      }).amount,
    ).toBe(70n);
  });
});

describe("amount checks", () => {
  it("refuses an amount below what is allocated and written off", () => {
    expect(
      code(() => {
        assertAmountCovers(99n, { allocated: 80n, writtenOff: 20n });
      }),
    ).toBe("INVOICE_BELOW_ALLOCATED");
    expect(
      code(() => {
        assertAmountCovers(100n, { allocated: 80n, writtenOff: 20n });
      }),
    ).toBeNull();
  });

  it("flags a variance above ₹1 from the GRN value", () => {
    expect(hasVariance(10_000n, [5_000n, 4_950n])).toBe(false);
    expect(hasVariance(10_000n, [5_000n, 4_899n])).toBe(true);
    expect(hasVariance(10_000n, [])).toBe(false);
  });

  it("dates a GRN invoice's due date by the PO's payment terms", () => {
    expect(dueDateFromTerms("2026-03-15", 30)).toBe("2026-04-14");
    expect(dueDateFromTerms("2026-03-15", null)).toBeNull();
  });
});
