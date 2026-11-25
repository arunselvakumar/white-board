import { describe, expect, it } from "vitest";

import { PreschoolError } from "./errors";
import {
  allocatePayment,
  assertConcession,
  invoiceDuePaise,
  invoiceStatus,
  planInvoices,
  receiptNumber,
  royaltyPaise,
  type FeeStructureLine,
} from "./fees";

const YEAR = { startsOn: "2026-04-01", endsOn: "2027-03-31" };

function line(
  feeHeadName: string,
  frequency: FeeStructureLine["frequency"],
  amountPaise = 100_000,
): FeeStructureLine {
  return { feeHeadId: feeHeadName, feeHeadName, amountPaise, frequency };
}

describe("planInvoices", () => {
  it("raises a one-time and an annual charge once, due on the admission date", () => {
    const invoices = planInvoices({
      admittedOn: "2026-06-12",
      academicYear: YEAR,
      lines: [line("Admission fee", "one_time"), line("Kit & books", "annual")],
    });
    expect(invoices).toEqual([
      expect.objectContaining({ label: "Admission fee", dueOn: "2026-06-12" }),
      expect.objectContaining({ label: "Kit & books", dueOn: "2026-06-12" }),
    ]);
  });

  it("raises every term for a Child who joins on the first day", () => {
    const invoices = planInvoices({
      admittedOn: "2026-04-01",
      academicYear: YEAR,
      lines: [line("Tuition", "term")],
    });
    expect(invoices.map((invoice) => [invoice.label, invoice.dueOn])).toEqual([
      ["Tuition — Term 1", "2026-04-01"],
      ["Tuition — Term 2", "2026-08-01"],
      ["Tuition — Term 3", "2026-12-01"],
    ]);
  });

  it("charges the term under way in full, due on the admission date, and skips terms already over", () => {
    const invoices = planInvoices({
      admittedOn: "2026-09-15",
      academicYear: YEAR,
      lines: [line("Tuition", "term")],
    });
    expect(invoices.map((invoice) => [invoice.label, invoice.dueOn])).toEqual([
      ["Tuition — Term 2", "2026-09-15"],
      ["Tuition — Term 3", "2026-12-01"],
    ]);
  });

  it("raises monthly charges from the month of admission to the year's last month", () => {
    const invoices = planInvoices({
      admittedOn: "2027-01-20",
      academicYear: YEAR,
      lines: [line("Daycare", "monthly")],
    });
    expect(invoices.map((invoice) => [invoice.label, invoice.dueOn])).toEqual([
      ["Daycare — Jan 2027", "2027-01-20"],
      ["Daycare — Feb 2027", "2027-02-01"],
      ["Daycare — Mar 2027", "2027-03-01"],
    ]);
  });

  it("raises four quarters and names them by number", () => {
    const invoices = planInvoices({
      admittedOn: "2026-07-01",
      academicYear: YEAR,
      lines: [line("Tuition", "quarterly")],
    });
    expect(invoices.map((invoice) => invoice.label)).toEqual([
      "Tuition — Quarter 2",
      "Tuition — Quarter 3",
      "Tuition — Quarter 4",
    ]);
  });

  it("charges a Child admitted before the year starts from its first day", () => {
    const invoices = planInvoices({
      admittedOn: "2026-02-10",
      academicYear: YEAR,
      lines: [line("Admission fee", "one_time"), line("Tuition", "monthly")],
    });
    expect(invoices).toHaveLength(13);
    expect(invoices[0]?.dueOn).toBe("2026-04-01");
  });

  it("leaves out a line with no amount and refuses an admission after the year", () => {
    expect(
      planInvoices({
        admittedOn: "2026-04-01",
        academicYear: YEAR,
        lines: [line("Uniform", "one_time", 0)],
      }),
    ).toEqual([]);
    expect(() =>
      planInvoices({
        admittedOn: "2027-04-01",
        academicYear: YEAR,
        lines: [line("Tuition", "term")],
      }),
    ).toThrow(PreschoolError);
  });
});

describe("invoice amounts", () => {
  const invoice = {
    amountPaise: 500_000,
    concessionPaise: 50_000,
    paidPaise: 200_000,
    cancelled: false,
    dueOn: "2026-08-01",
  };

  it("owes the amount less concession and payments", () => {
    expect(invoiceDuePaise(invoice)).toBe(250_000);
    expect(invoiceDuePaise({ ...invoice, cancelled: true })).toBe(0);
  });

  it("reads the status against today", () => {
    expect(invoiceStatus(invoice, "2026-07-20")).toBe("partly_paid");
    expect(invoiceStatus(invoice, "2026-08-02")).toBe("overdue");
    expect(invoiceStatus({ ...invoice, paidPaise: 0 }, "2026-07-20")).toBe(
      "upcoming",
    );
    expect(invoiceStatus({ ...invoice, paidPaise: 0 }, "2026-08-01")).toBe(
      "due",
    );
    expect(
      invoiceStatus({ ...invoice, paidPaise: 450_000 }, "2026-09-01"),
    ).toBe("paid");
  });

  it("refuses a concession larger than what is left", () => {
    expect(() => {
      assertConcession(invoice, 300_000);
    }).not.toThrow();
    expect(() => {
      assertConcession(invoice, 300_001);
    }).toThrow(PreschoolError);
    expect(() => {
      assertConcession(invoice, -1);
    }).toThrow(PreschoolError);
  });
});

describe("allocatePayment", () => {
  const invoices = [
    { id: "b", dueOn: "2026-08-01", duePaise: 300_000 },
    { id: "a", dueOn: "2026-04-01", duePaise: 100_000 },
    { id: "c", dueOn: "2026-12-01", duePaise: 300_000 },
    { id: "paid", dueOn: "2026-04-01", duePaise: 0 },
  ];

  it("pays the oldest Invoice first and leaves the rest partly paid", () => {
    expect(allocatePayment(250_000, invoices)).toEqual([
      { invoiceId: "a", amountPaise: 100_000 },
      { invoiceId: "b", amountPaise: 150_000 },
    ]);
  });

  it("refuses more than the Child owes and says how much that is", () => {
    try {
      allocatePayment(700_001, invoices);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "FEE_OVERPAY",
        details: { owedPaise: 700_000 },
      });
    }
  });

  it("refuses zero and fractions of a paisa", () => {
    expect(() => allocatePayment(0, invoices)).toThrow(PreschoolError);
    expect(() => allocatePayment(10.5, invoices)).toThrow(PreschoolError);
  });
});

describe("numbers", () => {
  it("formats a Receipt number", () => {
    expect(receiptNumber("LS", "2026–27", 42)).toBe("LS/2026-27/00042");
  });

  it("works out royalty from basis points", () => {
    expect(royaltyPaise(1_234_500, 1000)).toBe(123_450);
    expect(royaltyPaise(999, 750)).toBe(75);
    expect(royaltyPaise(500_000, 0)).toBe(0);
  });
});
