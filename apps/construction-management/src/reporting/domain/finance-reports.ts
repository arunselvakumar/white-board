import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { maskIdentifier, panHolderType } from "@/src/shared-kernel/tax-ids";

import {
  column,
  type Cell,
  type ReportBody,
  type ReportColumn,
  type ReportTable,
} from "./report-document";
import type { LedgerFilters } from "./report-job";
import {
  dateLabel,
  financialQuarterOf,
  financialYearRange,
  rangeLabel,
  type DateRange,
} from "./report-period";

/**
 * The finance reports (CM-709, ADR CM-0017 §16) as documents. Money is
 * paise as `bigint` until a cell is written; totals are summed as `bigint`
 * too, so nothing is rounded before the rupees are printed. Builders take
 * rows the finance read model (`src/composition/finance-report-source.ts`)
 * has already resolved to names.
 */

type Mode = NonNullable<LedgerFilters["mode"]>;
type Module = NonNullable<LedgerFilters["module"]>;
type CounterpartyKind = NonNullable<LedgerFilters["counterpartyKind"]>;
type ApprovalStatus = "pending" | "approved" | "rejected";

/** Paise as a cell; a total past a safe integer is a bug, not a rounding. */
export function moneyCell(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("An amount is beyond a safe integer.");
  return number;
}

function moneyOrNull(value: bigint | null): Cell {
  return value == null ? null : moneyCell(value);
}

function sum<T>(rows: readonly T[], of: (row: T) => bigint): bigint {
  return rows.reduce((total, row) => total + of(row), 0n);
}

export const MODE_LABELS: Record<Mode, string> = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
};

export const MODULE_LABELS: Record<Module, string> = {
  account: "Account",
  transaction: "Transaction",
  account_transfer: "Transfer",
  petty_cash_voucher: "Petty Cash",
  other_expense: "Other Expense",
  party_payment: "Party Payment",
  wage_payment: "Wage Payment",
  salary_slip: "Salary",
};

export const COUNTERPARTY_LABELS: Record<CounterpartyKind, string> = {
  contractor: "Contractor",
  supplier: "Supplier",
  other_party: "Other Party",
  labour: "Labour",
  vendor: "Vendor",
  team_member: "Team Member",
  client: "Client",
};

const ENTRY_KIND_LABELS = {
  opening: "Opening balance",
  receipt: "Receipt",
  payment: "Payment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
} as const;

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function partyLabel(
  kind: CounterpartyKind | null,
  name: string | null,
): string | null {
  if (name == null || name.trim() === "") return null;
  return kind == null ? name : `${name} (${COUNTERPARTY_LABELS[kind]})`;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type LedgerReportEntry = {
  date: CalendarDate;
  documentNumber: string | null;
  kind: keyof typeof ENTRY_KIND_LABELS;
  module: Module;
  /** This entry cancels an earlier one (a correction, CM-0017 §4). */
  isReversal: boolean;
  counterpartyKind: CounterpartyKind | null;
  counterpartyName: string | null;
  category: string | null;
  mode: Mode | null;
  reference: string | null;
  project: string | null;
  narration: string | null;
  /** Paise, signed: + into the account. */
  amount: bigint;
};

export type LedgerReportData = {
  account: {
    name: string;
    kind: "cash" | "bank" | "petty_cash";
    /** Petty cash: the Team Member who holds it. */
    holder: string | null;
  };
  /** Matching entries before the period. */
  opening: bigint;
  /** Matching entries up to the period's end. */
  closing: bigint;
  /** The period's entries that pass the filters, oldest first. */
  entries: LedgerReportEntry[];
  /** The filters as printed, null when not set. */
  filters: {
    category: string | null;
    mode: Mode | null;
    module: Module | null;
    counterpartyKind: CounterpartyKind | null;
  };
};

const ACCOUNT_KIND_LABELS = {
  cash: "Cash",
  bank: "Bank",
  petty_cash: "Petty Cash",
} as const;

/**
 * The Ledger (CM-0017 §16): the opening balance, every entry of the period
 * with its running balance, Credit (money in) and Debit (money out), and
 * the closing balance. Reversals are listed as entries, so a corrected
 * payment shows its reversal and nets out. Filters apply to the opening
 * too (as on the account's statement), so closing = opening + credit −
 * debit always holds.
 */
export function buildLedgerReport(
  data: LedgerReportData,
  range: DateRange,
): ReportBody {
  const filtered = Object.values(data.filters).some((value) => value != null);
  const columns: ReportColumn[] = [
    column("Date", "text", 11),
    column("Document No.", "text", 16),
    column("Type", "text", 14),
    column("Module", "text", 12),
    column("Paid To / Received From", "text", 20),
    column("Category", "text", 14),
    column("Mode", "text", 8),
    column("Reference", "text", 12),
    column("Project", "text", 14),
    column("Narration", "text", 20),
    column("Credit", "money"),
    column("Debit", "money"),
    column("Balance", "money", 13),
  ];
  let running = data.opening;
  const rows: Cell[][] = [
    [
      dateLabel(range.from),
      null,
      "Opening balance",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      moneyCell(data.opening),
    ],
  ];
  for (const entry of data.entries) {
    running += entry.amount;
    const type = ENTRY_KIND_LABELS[entry.kind];
    rows.push([
      dateLabel(entry.date),
      entry.documentNumber,
      entry.isReversal ? `Reversal: ${type}` : type,
      MODULE_LABELS[entry.module],
      partyLabel(entry.counterpartyKind, entry.counterpartyName),
      entry.category,
      entry.mode == null ? null : MODE_LABELS[entry.mode],
      entry.reference,
      entry.project,
      entry.narration,
      entry.amount > 0n ? moneyCell(entry.amount) : null,
      entry.amount < 0n ? moneyCell(-entry.amount) : null,
      moneyCell(running),
    ]);
  }
  const credit = sum(data.entries, (entry) =>
    entry.amount > 0n ? entry.amount : 0n,
  );
  const debit = sum(data.entries, (entry) =>
    entry.amount < 0n ? -entry.amount : 0n,
  );
  const totals: Cell[] = columns.map(() => null);
  totals[0] = "Total";
  totals[10] = moneyCell(credit);
  totals[11] = moneyCell(debit);
  totals[12] = moneyCell(data.closing);

  const summaryColumns = [
    column("Figure", "text", 24),
    column("Amount", "money", 16),
  ];
  const summary: ReportTable = {
    name: "Summary",
    columns: summaryColumns,
    rows: [
      ["Opening balance", moneyCell(data.opening)],
      ["Total credit", moneyCell(credit)],
      ["Total debit", moneyCell(debit)],
      ["Closing balance", moneyCell(data.closing)],
    ],
    totals: null,
  };

  const notes = [
    `Account: ${data.account.name} (${ACCOUNT_KIND_LABELS[data.account.kind]})${
      data.account.holder == null ? "" : `, held by ${data.account.holder}`
    }.`,
    "Credit is money into the account, Debit money out. Only approved documents post entries; a correction shows as a reversal and a new entry.",
  ];
  if (filtered) {
    const parts = [
      data.filters.category == null
        ? null
        : `category ${data.filters.category}`,
      data.filters.mode == null
        ? null
        : `mode ${MODE_LABELS[data.filters.mode]}`,
      data.filters.module == null
        ? null
        : `module ${MODULE_LABELS[data.filters.module]}`,
      data.filters.counterpartyKind == null
        ? null
        : `Paid To / Received From ${COUNTERPARTY_LABELS[data.filters.counterpartyKind]}`,
    ].filter((part) => part != null);
    notes.push(
      `Filtered by ${parts.join(", ")}: the opening, the running balance and the closing count the matching entries only, as the account's statement does.`,
    );
  }
  return {
    title: "Ledger",
    notes,
    tables: [summary, { name: "Ledger", columns, rows, totals }],
  };
}

// ---------------------------------------------------------------------------
// Petty Cash
// ---------------------------------------------------------------------------

export type PettyCashReportVoucher = {
  date: CalendarDate;
  number: string;
  type: "payment" | "receipt" | "transfer";
  /** From the listed account's side: a transfer is out of one, into the other. */
  direction: "in" | "out";
  account: string;
  category: string | null;
  /** Paid To / Received From, or the other account of a transfer. */
  party: string | null;
  amount: bigint;
  status: ApprovalStatus;
  description: string | null;
};

export type PettyCashReportAccount = {
  name: string;
  holder: string;
  /** Approved entries up to the period's end (the whole account). */
  closing: bigint;
  /** What the pending vouchers would add (+) or take (−) today. */
  pending: bigint;
};

const VOUCHER_TYPE_LABELS = {
  payment: "Payment",
  receipt: "Receipt",
  transfer: "Transfer",
} as const;

/**
 * Petty Cash (CM-0017 §9, §16): the Project's vouchers in the period on
 * the accounts the requester may see, with their status; totals count
 * approved vouchers only (only they move balances), and each account's
 * closing balance on the period's end.
 */
export function buildPettyCashReport(input: {
  vouchers: readonly PettyCashReportVoucher[];
  accounts: readonly PettyCashReportAccount[];
  /** True when the requester saw only their own account. */
  ownOnly: boolean;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Date", "text", 11),
    column("Voucher No", "text", 15),
    column("Type", "text", 9),
    column("Category", "text", 14),
    column("Account", "text", 16),
    column("Paid To / Received From", "text", 20),
    column("Credit", "money"),
    column("Debit", "money"),
    column("Status", "text", 9),
    column("Description", "text", 22),
  ];
  const rows: Cell[][] = input.vouchers.map((voucher) => [
    dateLabel(voucher.date),
    voucher.number,
    VOUCHER_TYPE_LABELS[voucher.type],
    voucher.category,
    voucher.account,
    voucher.party,
    voucher.direction === "in" ? moneyCell(voucher.amount) : null,
    voucher.direction === "out" ? moneyCell(voucher.amount) : null,
    STATUS_LABELS[voucher.status],
    voucher.description,
  ]);
  const approved = input.vouchers.filter((v) => v.status === "approved");
  const totals: Cell[] = columns.map(() => null);
  totals[0] = "Total";
  totals[6] = moneyCell(
    sum(approved, (v) => (v.direction === "in" ? v.amount : 0n)),
  );
  totals[7] = moneyCell(
    sum(approved, (v) => (v.direction === "out" ? v.amount : 0n)),
  );
  const balanceColumns = [
    column("Account", "text", 20),
    column("Holder", "text", 18),
    column("Closing balance", "money", 14),
    column("Pending", "money", 14),
  ];
  return {
    title: "Petty Cash",
    notes: [
      "Credit is cash into the account, Debit cash out. Totals count approved vouchers only; pending and rejected vouchers are listed with their status.",
      "Closing balances are each account's approved entries up to the period's end, on every Project.",
      ...(input.ownOnly
        ? ["Only your own petty-cash account is included."]
        : []),
    ],
    tables: [
      { name: "Vouchers", columns, rows, totals },
      {
        name: "Closing balances",
        columns: balanceColumns,
        rows: input.accounts.map((account) => [
          account.name,
          account.holder,
          moneyCell(account.closing),
          moneyCell(account.pending),
        ]),
        totals: [
          "Total",
          null,
          moneyCell(sum(input.accounts, (a) => a.closing)),
          moneyCell(sum(input.accounts, (a) => a.pending)),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TransactionsReportRow = {
  date: CalendarDate;
  number: string;
  type: "payment_in" | "payment_out";
  account: string;
  category: string | null;
  mode: Mode;
  reference: string | null;
  party: string | null;
  amount: bigint;
  status: ApprovalStatus;
  description: string | null;
};

export type TransfersReportRow = {
  date: CalendarDate;
  number: string;
  from: string;
  to: string;
  mode: Mode;
  reference: string | null;
  amount: bigint;
  status: ApprovalStatus;
  description: string | null;
};

/**
 * Transactions (CM-0017 §5, §16): the Project's Transactions and transfers
 * in the period with their status; totals count approved ones only.
 */
export function buildTransactionsReport(input: {
  transactions: readonly TransactionsReportRow[];
  transfers: readonly TransfersReportRow[];
}): ReportBody {
  const txColumns: ReportColumn[] = [
    column("Date", "text", 11),
    column("No.", "text", 16),
    column("Type", "text", 11),
    column("Account", "text", 16),
    column("Category", "text", 14),
    column("Mode", "text", 8),
    column("Reference", "text", 12),
    column("Paid To / Received From", "text", 20),
    column("Payment In", "money"),
    column("Payment Out", "money"),
    column("Status", "text", 9),
    column("Description", "text", 20),
  ];
  const approved = input.transactions.filter((t) => t.status === "approved");
  const txTotals: Cell[] = txColumns.map(() => null);
  txTotals[0] = "Total";
  txTotals[8] = moneyCell(
    sum(approved, (t) => (t.type === "payment_in" ? t.amount : 0n)),
  );
  txTotals[9] = moneyCell(
    sum(approved, (t) => (t.type === "payment_out" ? t.amount : 0n)),
  );
  const transferColumns: ReportColumn[] = [
    column("Date", "text", 11),
    column("No.", "text", 16),
    column("From account", "text", 18),
    column("To account", "text", 18),
    column("Mode", "text", 8),
    column("Reference", "text", 12),
    column("Amount", "money"),
    column("Status", "text", 9),
    column("Description", "text", 20),
  ];
  const transfersApproved = input.transfers.filter(
    (t) => t.status === "approved",
  );
  return {
    title: "Transactions",
    notes: [
      "Totals count approved Transactions and transfers only; pending and rejected ones are listed with their status.",
    ],
    tables: [
      {
        name: "Transactions",
        columns: txColumns,
        rows: input.transactions.map((t) => [
          dateLabel(t.date),
          t.number,
          t.type === "payment_in" ? "Payment In" : "Payment Out",
          t.account,
          t.category,
          MODE_LABELS[t.mode],
          t.reference,
          t.party,
          t.type === "payment_in" ? moneyCell(t.amount) : null,
          t.type === "payment_out" ? moneyCell(t.amount) : null,
          STATUS_LABELS[t.status],
          t.description,
        ]),
        totals: txTotals,
      },
      {
        name: "Transfers",
        columns: transferColumns,
        rows: input.transfers.map((t) => [
          dateLabel(t.date),
          t.number,
          t.from,
          t.to,
          MODE_LABELS[t.mode],
          t.reference,
          moneyCell(t.amount),
          STATUS_LABELS[t.status],
          t.description,
        ]),
        totals: [
          "Total",
          null,
          null,
          null,
          null,
          null,
          moneyCell(sum(transfersApproved, (t) => t.amount)),
          null,
          null,
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Contractor and Supplier Payments
// ---------------------------------------------------------------------------

/** One party's movement on the Project in the period, from its party entries. */
export type PartyReportParty = {
  id: string;
  name: string;
  /** Every entry before the period. */
  opening: bigint;
  /** Bills from the party in the period (net of corrections). */
  invoiced: bigint;
  /** Money paid in the period (positive; cancellations net out). */
  paid: bigint;
  tds: bigint;
  writtenOff: bigint;
  /** Every entry up to the period's end. */
  closing: bigint;
};

export type PartyReportInvoice = {
  partyId: string;
  number: string;
  date: CalendarDate;
  dueDate: CalendarDate | null;
  amount: bigint;
  /** The TDS share of what was allocated to it. */
  tds: bigint;
  /** Money allocated to it (allocated − TDS share). */
  paid: bigint;
  writtenOff: bigint;
  balance: bigint;
};

export type PartyReportPayment = {
  partyId: string;
  number: string;
  date: CalendarDate;
  account: string;
  mode: Mode;
  reference: string | null;
  amount: bigint;
  tds: bigint;
};

/**
 * Contractor Payments and Supplier Payments (CM-0017 §6, §7, §16): per
 * party on the Project, the opening, what was invoiced, paid, deducted as
 * TDS and written off in the period, and the closing balance (+ the
 * Company owes the party); then the invoices of the period with what
 * settled them by the period's end, and the payments of the period.
 */
export function buildPartyPaymentsReport(input: {
  partyType: "contractor" | "supplier";
  parties: readonly PartyReportParty[];
  invoices: readonly PartyReportInvoice[];
  payments: readonly PartyReportPayment[];
}): ReportBody {
  const noun = input.partyType === "contractor" ? "Contractor" : "Supplier";
  const parties = [...input.parties].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const nameOf = new Map(parties.map((party) => [party.id, party.name]));
  const order = new Map(parties.map((party, index) => [party.id, index]));
  const byParty = <T extends { partyId: string; date: string; number: string }>(
    rows: readonly T[],
  ) =>
    [...rows].sort(
      (a, b) =>
        (order.get(a.partyId) ?? 0) - (order.get(b.partyId) ?? 0) ||
        a.date.localeCompare(b.date) ||
        a.number.localeCompare(b.number),
    );

  const summaryColumns: ReportColumn[] = [
    column(noun, "text", 22),
    column("Opening", "money"),
    column("Invoiced", "money"),
    column("Paid", "money"),
    column("TDS", "money"),
    column("Written off", "money"),
    column("Closing balance", "money", 13),
  ];
  const invoiceColumns: ReportColumn[] = [
    column(noun, "text", 20),
    column("Invoice No.", "text", 14),
    column("Date", "text", 11),
    column("Due date", "text", 11),
    column("Amount", "money"),
    column("TDS", "money"),
    column("Paid", "money"),
    column("Written off", "money"),
    column("Balance", "money"),
  ];
  const paymentColumns: ReportColumn[] = [
    column(noun, "text", 20),
    column("Payment No.", "text", 16),
    column("Date", "text", 11),
    column("Account", "text", 16),
    column("Mode", "text", 8),
    column("Reference", "text", 14),
    column("Amount", "money"),
    column("TDS", "money"),
  ];
  const invoices = byParty(input.invoices);
  const payments = byParty(input.payments);
  return {
    title: `${noun} Payments`,
    notes: [
      "Balances are per party on this Project: positive means the Company owes the party, negative is an advance with them.",
      "An invoice is settled by money paid plus TDS; Paid and TDS show its share of each payment allocated to it by the period's end.",
    ],
    tables: [
      {
        name: "Summary",
        columns: summaryColumns,
        rows: parties.map((party) => [
          party.name,
          moneyCell(party.opening),
          moneyCell(party.invoiced),
          moneyCell(party.paid),
          moneyCell(party.tds),
          moneyCell(party.writtenOff),
          moneyCell(party.closing),
        ]),
        totals: [
          "Total",
          moneyCell(sum(parties, (p) => p.opening)),
          moneyCell(sum(parties, (p) => p.invoiced)),
          moneyCell(sum(parties, (p) => p.paid)),
          moneyCell(sum(parties, (p) => p.tds)),
          moneyCell(sum(parties, (p) => p.writtenOff)),
          moneyCell(sum(parties, (p) => p.closing)),
        ],
      },
      {
        name: "Invoices",
        columns: invoiceColumns,
        rows: invoices.map((invoice) => [
          nameOf.get(invoice.partyId) ?? null,
          invoice.number,
          dateLabel(invoice.date),
          invoice.dueDate == null ? null : dateLabel(invoice.dueDate),
          moneyCell(invoice.amount),
          moneyCell(invoice.tds),
          moneyCell(invoice.paid),
          moneyCell(invoice.writtenOff),
          moneyCell(invoice.balance),
        ]),
        totals: [
          "Total",
          null,
          null,
          null,
          moneyCell(sum(invoices, (i) => i.amount)),
          moneyCell(sum(invoices, (i) => i.tds)),
          moneyCell(sum(invoices, (i) => i.paid)),
          moneyCell(sum(invoices, (i) => i.writtenOff)),
          moneyCell(sum(invoices, (i) => i.balance)),
        ],
      },
      {
        name: "Payments",
        columns: paymentColumns,
        rows: payments.map((payment) => [
          nameOf.get(payment.partyId) ?? null,
          payment.number,
          dateLabel(payment.date),
          payment.account,
          MODE_LABELS[payment.mode],
          payment.reference,
          moneyCell(payment.amount),
          moneyCell(payment.tds),
        ]),
        totals: [
          "Total",
          null,
          null,
          null,
          null,
          null,
          moneyCell(sum(payments, (p) => p.amount)),
          moneyCell(sum(payments, (p) => p.tds)),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Other Expenses
// ---------------------------------------------------------------------------

export type OtherExpenseReportRow = {
  date: CalendarDate;
  number: string;
  category: string | null;
  payee: string | null;
  account: string;
  mode: Mode;
  reference: string | null;
  amount: bigint;
  status: ApprovalStatus;
  description: string | null;
};

/** Other Expenses (CM-0017 §10, §16); totals count approved ones only. */
export function buildOtherExpensesReport(
  rows: readonly OtherExpenseReportRow[],
): ReportBody {
  const columns: ReportColumn[] = [
    column("Date", "text", 11),
    column("No.", "text", 16),
    column("Category", "text", 14),
    column("Payee", "text", 18),
    column("Account", "text", 16),
    column("Mode", "text", 8),
    column("Reference", "text", 12),
    column("Amount", "money"),
    column("Status", "text", 9),
    column("Description", "text", 22),
  ];
  const approved = rows.filter((row) => row.status === "approved");
  const totals: Cell[] = columns.map(() => null);
  totals[0] = "Total";
  totals[7] = moneyCell(sum(approved, (row) => row.amount));
  return {
    title: "Other Expenses",
    notes: [
      "Totals count approved expenses only; pending and rejected ones are listed with their status.",
    ],
    tables: [
      {
        name: "Other Expenses",
        columns,
        rows: rows.map((row) => [
          dateLabel(row.date),
          row.number,
          row.category,
          row.payee,
          row.account,
          MODE_LABELS[row.mode],
          row.reference,
          moneyCell(row.amount),
          STATUS_LABELS[row.status],
          row.description,
        ]),
        totals,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// TDS 194C
// ---------------------------------------------------------------------------

export type TdsReportPayment = {
  contractorId: string;
  contractor: string;
  pan: string | null;
  date: CalendarDate;
  number: string;
  project: string | null;
  base: bigint | null;
  /** Percent as stored, e.g. `"1.00"`. */
  rate: string | null;
  tds: bigint;
  overridden: boolean;
};

/** The payee kind TDS 194C uses (CM-0017 §8): the PAN's fourth letter. */
export function payeeKindLabel(pan: string | null): string {
  if (pan == null || pan.trim() === "") return "No PAN (206AA)";
  const holder = panHolderType(pan);
  if (holder == null) return "No PAN (206AA)";
  return holder === "individual" || holder === "huf"
    ? "Individual / HUF"
    : "Other";
}

function maskedPan(pan: string | null): string | null {
  return pan == null || pan.trim() === "" ? null : maskIdentifier(pan.trim());
}

/**
 * TDS 194C (CM-0017 §8): per Contractor, each payment of the financial
 * year with its base, rate, TDS and whether it was overridden, then the
 * totals by quarter for filing (Q1 April–June … Q4 January–March). PANs
 * show their last four characters.
 */
export function buildTdsReport(input: {
  fy: string;
  payments: readonly TdsReportPayment[];
  /** True when rows are limited to the requester's Projects. */
  limited: boolean;
}): ReportBody {
  const payments = [...input.payments].sort(
    (a, b) =>
      a.contractor.localeCompare(b.contractor) ||
      a.date.localeCompare(b.date) ||
      a.number.localeCompare(b.number),
  );
  const columns: ReportColumn[] = [
    column("Contractor", "text", 20),
    column("PAN", "text", 11),
    column("Payee kind", "text", 13),
    column("Date", "text", 11),
    column("Payment No.", "text", 16),
    column("Project", "text", 16),
    column("Base", "money"),
    column("Rate", "text", 7),
    column("TDS", "money"),
    column("Overridden", "text", 9),
  ];
  type Quarters = { name: string; pan: string | null; q: bigint[] };
  const byContractor = new Map<string, Quarters>();
  for (const payment of payments) {
    let row = byContractor.get(payment.contractorId);
    if (row == null) {
      row = { name: payment.contractor, pan: payment.pan, q: [0n, 0n, 0n, 0n] };
      byContractor.set(payment.contractorId, row);
    }
    const index = financialQuarterOf(payment.date) - 1;
    row.q[index] = (row.q[index] ?? 0n) + payment.tds;
  }
  const quarters = [...byContractor.values()];
  const quarterTotal = (index: number) =>
    sum(quarters, (row) => row.q[index] ?? 0n);
  const range = financialYearRange(input.fy);
  return {
    title: "TDS 194C",
    notes: [
      `Financial year ${input.fy}: ${rangeLabel(range)}. Section 194C (393 under the Income-tax Act, 2025).`,
      "TDS reduces the Contractor's invoices like money paid; the account moved only by the money paid. Cancelled payments are left out.",
      ...(input.limited
        ? ["Only payments on the Projects you are on are included."]
        : []),
    ],
    tables: [
      {
        name: "Payments",
        columns,
        rows: payments.map((payment) => [
          payment.contractor,
          maskedPan(payment.pan),
          payeeKindLabel(payment.pan),
          dateLabel(payment.date),
          payment.number,
          payment.project,
          moneyOrNull(payment.base),
          payment.rate == null ? null : `${payment.rate}%`,
          moneyCell(payment.tds),
          payment.overridden ? "Yes" : "No",
        ]),
        totals: [
          "Total",
          null,
          null,
          null,
          null,
          null,
          moneyCell(sum(payments, (p) => p.base ?? 0n)),
          null,
          moneyCell(sum(payments, (p) => p.tds)),
          null,
        ],
      },
      {
        name: "Quarterly totals",
        columns: [
          column("Contractor", "text", 22),
          column("PAN", "text", 11),
          column("Q1 (Apr-Jun)", "money"),
          column("Q2 (Jul-Sep)", "money"),
          column("Q3 (Oct-Dec)", "money"),
          column("Q4 (Jan-Mar)", "money"),
          column("FY total", "money"),
        ],
        rows: quarters.map((row) => [
          row.name,
          maskedPan(row.pan),
          ...row.q.map(moneyCell),
          moneyCell(row.q.reduce((a, b) => a + b, 0n)),
        ]),
        totals: [
          "Total",
          null,
          moneyCell(quarterTotal(0)),
          moneyCell(quarterTotal(1)),
          moneyCell(quarterTotal(2)),
          moneyCell(quarterTotal(3)),
          moneyCell(sum(quarters, (row) => row.q.reduce((a, b) => a + b, 0n))),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Due Payments
// ---------------------------------------------------------------------------

export const DUE_AGEING_BUCKETS = [
  "not_due",
  "days_0_30",
  "days_31_60",
  "days_61_90",
  "days_90_plus",
] as const;

export type DueAgeing = Record<(typeof DUE_AGEING_BUCKETS)[number], bigint>;

const DUE_AGEING_LABELS: Record<keyof DueAgeing, string> = {
  not_due: "Not due",
  days_0_30: "0-30 days",
  days_31_60: "31-60 days",
  days_61_90: "61-90 days",
  days_90_plus: "90+ days",
};

const PARTY_TYPE_LABELS = {
  contractor: "Contractor",
  supplier: "Supplier",
  other_party: "Other Party",
  client: "Client",
} as const;

export type DueReportParty = {
  name: string;
  partyType: keyof typeof PARTY_TYPE_LABELS;
  direction: "payable" | "receivable";
  invoiced: bigint;
  paid: bigint;
  writtenOff: bigint;
  due: bigint;
  ageing: DueAgeing;
};

/**
 * Due Payments (CM-0017 §16): per party with something left on its
 * invoices on the day asked, what was invoiced, paid (with TDS) and
 * written off, what is due, and the due split by days past the due date.
 * Bills from parties are payables; Other Party sales invoices and Client
 * Bills' invoices (CM-1107) are receivables, in a second table.
 */
export function buildDuePaymentsReport(input: {
  asOn: CalendarDate;
  parties: readonly DueReportParty[];
  central: boolean;
  /** True when a central report covers only the requester's Projects. */
  limited: boolean;
}): ReportBody {
  const open = input.parties
    .filter((party) => party.due > 0n)
    .sort(
      (a, b) =>
        a.partyType.localeCompare(b.partyType) || a.name.localeCompare(b.name),
    );
  const table = (
    name: string,
    paidLabel: string,
    rows: readonly DueReportParty[],
  ): ReportTable => ({
    name,
    columns: [
      column("Party", "text", 22),
      column("Type", "text", 11),
      column("Invoiced", "money"),
      column(paidLabel, "money"),
      column("Written off", "money"),
      column("Due", "money"),
      ...DUE_AGEING_BUCKETS.map((bucket) =>
        column(DUE_AGEING_LABELS[bucket], "money"),
      ),
    ],
    rows: rows.map((party) => [
      party.name,
      PARTY_TYPE_LABELS[party.partyType],
      moneyCell(party.invoiced),
      moneyCell(party.paid),
      moneyCell(party.writtenOff),
      moneyCell(party.due),
      ...DUE_AGEING_BUCKETS.map((bucket) => moneyCell(party.ageing[bucket])),
    ]),
    totals: [
      "Total",
      null,
      moneyCell(sum(rows, (p) => p.invoiced)),
      moneyCell(sum(rows, (p) => p.paid)),
      moneyCell(sum(rows, (p) => p.writtenOff)),
      moneyCell(sum(rows, (p) => p.due)),
      ...DUE_AGEING_BUCKETS.map((bucket) =>
        moneyCell(sum(rows, (p) => p.ageing[bucket])),
      ),
    ],
  });
  return {
    title: "Due Payments",
    notes: [
      `Balances on ${dateLabel(input.asOn)}: invoices dated by then, less what was allocated to them (money and TDS) and written off by then.`,
      "Ageing is by days past the due date; an invoice with no due date is never overdue, as on the party screens.",
      ...(input.central
        ? [
            input.limited
              ? "Every party across the Projects you are on."
              : "Every party across every Project and Store.",
          ]
        : []),
    ],
    tables: [
      table(
        "Payables",
        "Paid",
        open.filter((party) => party.direction === "payable"),
      ),
      table(
        "Receivables",
        "Received",
        open.filter((party) => party.direction === "receivable"),
      ),
    ],
  };
}
