import { describe, expect, it } from "vitest";

import {
  buildDuePaymentsReport,
  buildLedgerReport,
  buildOtherExpensesReport,
  buildPartyPaymentsReport,
  buildPettyCashReport,
  buildTdsReport,
  buildTransactionsReport,
  payeeKindLabel,
  type LedgerReportData,
  type LedgerReportEntry,
} from "./finance-reports";
import {
  financialQuarterOf,
  financialYearOf,
  financialYearRange,
} from "./report-period";

function entry(overrides: Partial<LedgerReportEntry>): LedgerReportEntry {
  return {
    date: "2026-09-10",
    documentNumber: "TXN/26-27/00001",
    kind: "payment",
    module: "transaction",
    isReversal: false,
    counterpartyKind: null,
    counterpartyName: null,
    category: null,
    mode: "cash",
    reference: null,
    project: null,
    narration: null,
    amount: -10_000n,
    ...overrides,
  };
}

function ledger(overrides: Partial<LedgerReportData> = {}): LedgerReportData {
  return {
    account: { name: "Company's Cash Account", kind: "cash", holder: null },
    opening: 50_000n,
    closing: 45_000n,
    entries: [
      entry({
        amount: -10_000n,
        counterpartyKind: "contractor",
        counterpartyName: "Velan",
      }),
      entry({ amount: 10_000n, isReversal: true }),
      entry({ amount: -5_000n, kind: "payment", module: "petty_cash_voucher" }),
    ],
    filters: {
      category: null,
      mode: null,
      module: null,
      counterpartyKind: null,
    },
    ...overrides,
  };
}

const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

describe("Ledger", () => {
  it("opens, runs the balance through reversals and closes", () => {
    const body = buildLedgerReport(ledger(), SEPTEMBER);
    const [summary, table] = body.tables;
    expect(summary?.rows).toEqual([
      ["Opening balance", 50_000],
      ["Total credit", 10_000],
      ["Total debit", 15_000],
      ["Closing balance", 45_000],
    ]);
    expect(table?.rows.map((row) => row.at(-1))).toEqual([
      50_000, 40_000, 50_000, 45_000,
    ]);
    expect(table?.rows[1]?.[4]).toBe("Velan (Contractor)");
    expect(table?.rows[2]?.[2]).toBe("Reversal: Payment");
    expect(table?.totals?.slice(-3)).toEqual([10_000, 15_000, 45_000]);
  });

  it("keeps the running balance when filtered", () => {
    const body = buildLedgerReport(
      ledger({
        opening: 2_000n,
        closing: -3_000n,
        entries: [entry({ amount: -5_000n, module: "petty_cash_voucher" })],
        filters: {
          category: null,
          mode: null,
          module: "petty_cash_voucher",
          counterpartyKind: null,
        },
      }),
      SEPTEMBER,
    );
    const table = body.tables[1];
    expect(table?.rows.map((row) => row.at(-1))).toEqual([2_000, -3_000]);
    expect(table?.totals?.at(-1)).toBe(-3_000);
    expect(body.notes.join(" ")).toContain("module Petty Cash");
  });
});

describe("Petty Cash", () => {
  it("totals approved vouchers only and lists closing balances", () => {
    const body = buildPettyCashReport({
      ownOnly: true,
      vouchers: [
        {
          date: "2026-09-02",
          number: "PC/26-27/00001",
          type: "payment",
          direction: "out",
          account: "Prabhu's petty cash",
          category: "Fuel",
          party: "Diesel bunk",
          amount: 1_500n,
          status: "approved",
          description: null,
        },
        {
          date: "2026-09-03",
          number: "PC/26-27/00002",
          type: "receipt",
          direction: "in",
          account: "Prabhu's petty cash",
          category: null,
          party: null,
          amount: 9_000n,
          status: "pending",
          description: null,
        },
      ],
      accounts: [
        {
          name: "Prabhu's petty cash",
          holder: "Prabhu",
          closing: 8_500n,
          pending: 9_000n,
        },
      ],
    });
    const [vouchers, balances] = body.tables;
    expect(vouchers?.totals?.slice(6, 8)).toEqual([0, 1_500]);
    expect(vouchers?.rows[1]?.[8]).toBe("Pending");
    expect(balances?.rows).toEqual([
      ["Prabhu's petty cash", "Prabhu", 8_500, 9_000],
    ]);
    expect(body.notes.join(" ")).toContain("Only your own");
  });
});

describe("Transactions and Other Expenses", () => {
  it("split Payment In and Out and total approved rows", () => {
    const body = buildTransactionsReport({
      transactions: [
        {
          date: "2026-09-01",
          number: "TXN/26-27/00001",
          type: "payment_in",
          account: "Bank",
          category: null,
          mode: "online",
          reference: "UTR1",
          party: "Owner",
          amount: 100_000n,
          status: "approved",
          description: null,
        },
        {
          date: "2026-09-02",
          number: "TXN/26-27/00002",
          type: "payment_out",
          account: "Bank",
          category: null,
          mode: "cheque",
          reference: "000123",
          party: null,
          amount: 7_000n,
          status: "rejected",
          description: null,
        },
      ],
      transfers: [
        {
          date: "2026-09-03",
          number: "TXN/26-27/00003",
          from: "Bank",
          to: "Cash",
          mode: "cash",
          reference: null,
          amount: 2_000n,
          status: "approved",
          description: null,
        },
      ],
    });
    expect(body.tables[0]?.totals?.slice(8, 10)).toEqual([100_000, 0]);
    expect(body.tables[1]?.totals?.[6]).toBe(2_000);
    const expenses = buildOtherExpensesReport([
      {
        date: "2026-09-04",
        number: "EXP/26-27/00001",
        category: "Fuel",
        payee: "Bunk",
        account: "Cash",
        mode: "cash",
        reference: null,
        amount: 3_000n,
        status: "approved",
        description: null,
      },
    ]);
    expect(expenses.tables[0]?.totals?.[7]).toBe(3_000);
  });
});

describe("Contractor Payments", () => {
  it("summarises each party and lists invoices and payments by party", () => {
    const body = buildPartyPaymentsReport({
      partyType: "contractor",
      parties: [
        {
          id: "b",
          name: "Velan",
          opening: 0n,
          invoiced: 100_000n,
          paid: 49_000n,
          tds: 1_000n,
          writtenOff: 0n,
          closing: 50_000n,
        },
        {
          id: "a",
          name: "Arasu",
          opening: 5_000n,
          invoiced: 0n,
          paid: 0n,
          tds: 0n,
          writtenOff: 0n,
          closing: 5_000n,
        },
      ],
      invoices: [
        {
          partyId: "b",
          number: "B-1",
          date: "2026-09-01",
          dueDate: null,
          amount: 100_000n,
          tds: 1_000n,
          paid: 49_000n,
          writtenOff: 0n,
          balance: 50_000n,
        },
      ],
      payments: [
        {
          partyId: "b",
          number: "PAY/26-27/00001",
          date: "2026-09-05",
          account: "Bank",
          mode: "online",
          reference: "UTR",
          amount: 49_000n,
          tds: 1_000n,
        },
      ],
    });
    const [summary, invoices, payments] = body.tables;
    expect(body.title).toBe("Contractor Payments");
    expect(summary?.rows.map((row) => row[0])).toEqual(["Arasu", "Velan"]);
    expect(summary?.totals).toEqual([
      "Total",
      5_000,
      100_000,
      49_000,
      1_000,
      0,
      55_000,
    ]);
    expect(invoices?.rows[0]?.[0]).toBe("Velan");
    expect(payments?.totals?.slice(6)).toEqual([49_000, 1_000]);
  });
});

describe("TDS 194C", () => {
  it("masks PANs, names the payee kind and totals by quarter", () => {
    const base = {
      contractorId: "c1",
      contractor: "Velan",
      pan: "ABCPV1234K",
      project: "Tambaram",
      rate: "1.00",
      overridden: false,
    };
    const body = buildTdsReport({
      fy: "2026-27",
      limited: false,
      payments: [
        {
          ...base,
          date: "2026-05-10",
          number: "PAY/1",
          base: 50_000_00n,
          tds: 500_00n,
        },
        {
          ...base,
          date: "2026-10-01",
          number: "PAY/2",
          base: 40_000_00n,
          tds: 400_00n,
          overridden: true,
        },
        {
          ...base,
          date: "2027-03-31",
          number: "PAY/3",
          base: 10_000_00n,
          tds: 100_00n,
        },
      ],
    });
    const [payments, quarters] = body.tables;
    expect(payments?.rows[0]?.slice(0, 3)).toEqual([
      "Velan",
      "XXXXXX234K",
      "Individual / HUF",
    ]);
    expect(payments?.rows[1]?.[9]).toBe("Yes");
    expect(quarters?.rows).toEqual([
      ["Velan", "XXXXXX234K", 500_00, 0, 400_00, 100_00, 1_000_00],
    ]);
    expect(payeeKindLabel("AAACV1234K")).toBe("Other");
    expect(payeeKindLabel(null)).toBe("No PAN (206AA)");
  });

  it("knows financial years and quarters", () => {
    expect(financialYearRange("2026-27")).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
    expect(() => financialYearRange("2026-28")).toThrow();
    expect(financialYearOf("2027-03-31")).toBe("2026-27");
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
    expect(financialQuarterOf("2026-06-30")).toBe(1);
    expect(financialQuarterOf("2026-07-01")).toBe(2);
    expect(financialQuarterOf("2026-12-31")).toBe(3);
    expect(financialQuarterOf("2027-01-01")).toBe(4);
  });
});

describe("Due Payments", () => {
  it("keeps parties with something due, payables and receivables apart", () => {
    const ageing = {
      not_due: 10n,
      days_0_30: 20n,
      days_31_60: 0n,
      days_61_90: 0n,
      days_90_plus: 70n,
    };
    const body = buildDuePaymentsReport({
      asOn: "2026-10-11",
      central: true,
      limited: true,
      parties: [
        {
          name: "Velan",
          partyType: "contractor",
          direction: "payable",
          invoiced: 200n,
          paid: 100n,
          writtenOff: 0n,
          due: 100n,
          ageing,
        },
        {
          name: "Paid up",
          partyType: "supplier",
          direction: "payable",
          invoiced: 50n,
          paid: 50n,
          writtenOff: 0n,
          due: 0n,
          ageing: { ...ageing, not_due: 0n, days_0_30: 0n, days_90_plus: 0n },
        },
        {
          name: "Buyer",
          partyType: "other_party",
          direction: "receivable",
          invoiced: 30n,
          paid: 0n,
          writtenOff: 0n,
          due: 30n,
          ageing: { ...ageing, not_due: 30n, days_0_30: 0n, days_90_plus: 0n },
        },
      ],
    });
    const [payables, receivables] = body.tables;
    expect(payables?.rows).toEqual([
      ["Velan", "Contractor", 200, 100, 0, 100, 10, 20, 0, 0, 70],
    ]);
    expect(receivables?.rows[0]?.[0]).toBe("Buyer");
    expect(receivables?.columns[3]?.label).toBe("Received");
    expect(body.notes.join(" ")).toContain("Projects you are on");
  });
});
