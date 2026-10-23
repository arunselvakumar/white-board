import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
  type ReportTable,
} from "./report-document";
import { dateLabel } from "./report-period";

/**
 * The contracts reports (CM-1111, ADR CM-0023). The source
 * (`src/composition/contracts-report-source.ts`) reads the contracts
 * tables and names, and hands over printable words, quantities (numbers
 * with up to three decimals) and integer paise; the builders only lay
 * them out. `financial` false leaves every money column out, and the
 * notes say so.
 */

const MONEY_LEFT_OUT = "Amounts are left out (they need Financial).";

/** Columns that are money only with Financial; the rest always. */
type Col = { column: ReportColumn; money?: true };

function money(label: string, width?: number): Col {
  return { column: column(label, "money", width), money: true };
}
function plain(label: string, kind: ReportColumn["kind"], width?: number): Col {
  return { column: column(label, kind, width) };
}

/** A table whose money columns drop out without Financial; totals summed. */
function table(input: {
  name: string;
  cols: readonly Col[];
  rows: readonly Cell[][];
  financial: boolean;
  /** Labels of the totals row's text cells, by index among all columns. */
  labels?: Record<number, string>;
  /** Columns not summed (rates, quantities in mixed units), by index among all columns. */
  skip?: readonly number[];
}): ReportTable {
  const keep = input.cols
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => input.financial || col.money !== true);
  const columns = keep.map(({ col }) => col.column);
  const rows = input.rows.map((row) =>
    keep.map(({ index }) => row[index] ?? null),
  );
  const labels: Record<number, string> = {};
  keep.forEach(({ index }, at) => {
    const label = input.labels?.[index];
    if (label != null) labels[at] = label;
  });
  const totals = totalsOf(columns, rows, labels);
  return {
    name: input.name,
    columns,
    rows,
    totals: totals.map((cell, at) =>
      input.skip?.includes(keep[at]?.index ?? -1) === true ? null : cell,
    ),
  };
}

const count = (n: number, one: string, many: string) =>
  `${String(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// BOQ vs executed
// ---------------------------------------------------------------------------

export type BoqExecutedRow = {
  section: string;
  itemNo: string;
  description: string;
  unit: string;
  /** The BOQ quantity now (after approved Variations). */
  boqQuantity: number;
  /** Checked client-side measurements up to the date. */
  executed: number;
  /** On approved client RA bills dated up to the date. */
  billed: number;
  /** Paise per unit. */
  rate: number;
};

/**
 * BOQ vs executed (CM-1111): each BOQ item's quantity against the work
 * measured and checked on the client side up to the date, and what
 * approved client bills took; balance and % executed. Amounts at the BOQ
 * rate with Financial.
 */
export function buildBoqExecutedReport(input: {
  asOn: CalendarDate;
  rows: readonly BoqExecutedRow[];
  financial: boolean;
}): ReportBody {
  const cols: Col[] = [
    plain("Section", "text", 18),
    plain("Item No.", "text", 8),
    plain("Description", "text", 30),
    plain("Unit", "text", 7),
    plain("BOQ Qty", "quantity", 10),
    plain("Executed", "quantity", 10),
    plain("Billed", "quantity", 10),
    plain("Balance", "quantity", 10),
    plain("% Executed", "percent", 9),
    money("Rate", 10),
    money("BOQ Amount"),
    money("Executed Amount"),
    money("Billed Amount"),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    row.section,
    row.itemNo,
    row.description,
    row.unit,
    row.boqQuantity,
    row.executed,
    row.billed,
    round3(row.boqQuantity - row.executed),
    row.boqQuantity === 0
      ? null
      : Math.round((row.executed / row.boqQuantity) * 10_000) / 100,
    row.rate,
    Math.round(row.boqQuantity * row.rate),
    Math.round(row.executed * row.rate),
    Math.round(row.billed * row.rate),
  ]);
  return {
    title: "BOQ vs Executed",
    notes: [
      `Executed: client-side measurements checked (joint) up to ${dateLabel(input.asOn)}. Billed: on approved client RA bills dated up to then. Quantities after approved Variations.`,
      ...(input.financial ? [] : [MONEY_LEFT_OUT]),
    ],
    tables: [
      table({
        name: "BOQ vs executed",
        cols,
        rows,
        financial: input.financial,
        labels: { 0: "Total", 2: count(rows.length, "item", "items") },
        // Quantities in different units, and rates, are not summed.
        skip: [4, 5, 6, 7, 9],
      }),
    ],
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Work Order register
// ---------------------------------------------------------------------------

export type WorkOrderRegisterRow = {
  number: string | null;
  orderDate: CalendarDate;
  contractor: string;
  department: string | null;
  /** "Draft", "Pending approval", "Issued", "Closed", "Cancelled". */
  status: string;
  revision: number;
  retentionPercent: number;
  /** Paise: Σ quantity × rate of its lines. */
  value: number;
  /** Paise: Σ gross of its approved RA bills. */
  billed: number;
};

/** Work Order register (CM-1111): the Work Orders dated in the period. */
export function buildWorkOrderRegister(input: {
  rows: readonly WorkOrderRegisterRow[];
  financial: boolean;
}): ReportBody {
  const cols: Col[] = [
    plain("WO No.", "text", 16),
    plain("Order Date", "text", 12),
    plain("Contractor", "text", 22),
    plain("Department", "text", 14),
    plain("Status", "text", 13),
    plain("Revision", "count", 8),
    plain("Retention %", "percent", 9),
    money("Value"),
    money("Billed to Date"),
    money("Balance"),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    row.number ?? "Draft",
    dateLabel(row.orderDate),
    row.contractor,
    row.department,
    row.status,
    row.revision,
    row.retentionPercent,
    row.value,
    row.billed,
    row.value - row.billed,
  ]);
  return {
    title: "Work Order Register",
    notes: [
      "Work Orders with an Order Date in the period, oldest first. Billed to Date: Σ gross of their approved RA bills (escalation bills not counted).",
      ...(input.financial ? [] : [MONEY_LEFT_OUT]),
    ],
    tables: [
      table({
        name: "Work Orders",
        cols,
        rows,
        financial: input.financial,
        labels: {
          0: "Total",
          1: count(rows.length, "Work Order", "Work Orders"),
        },
        skip: [5],
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// RA bill registers (both sides)
// ---------------------------------------------------------------------------

export type BillRegisterRow = {
  number: string | null;
  ordinal: number | null;
  /** "RA" or "Escalation". */
  type: string;
  billDate: CalendarDate;
  /** The Contractor or the Client. */
  party: string;
  /** Contractor side only. */
  workOrder: string | null;
  /** "Draft", "Pending approval", "Approved", "Rejected", "Reversed". */
  status: string;
  gross: number;
  gst: number;
  deductions: number;
  net: number;
};

/**
 * RA Bill Register (CM-1111), one per side: the bills dated in the
 * period, with a summary of the approved ones by status.
 */
export function buildBillRegister(input: {
  side: "contractor" | "client";
  rows: readonly BillRegisterRow[];
  financial: boolean;
}): ReportBody {
  const contractor = input.side === "contractor";
  const cols: Col[] = [
    plain("Bill No.", "text", 16),
    plain("RA No.", "count", 7),
    plain("Type", "text", 10),
    plain("Bill Date", "text", 12),
    plain(contractor ? "Contractor" : "Client", "text", 22),
    ...(contractor ? [plain("WO No.", "text", 16)] : []),
    plain("Status", "text", 14),
    money("Gross"),
    money("GST", 11),
    money("Deductions"),
    money("Net"),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    row.number ?? "Draft",
    row.ordinal,
    row.type,
    dateLabel(row.billDate),
    row.party,
    ...(contractor ? [row.workOrder] : []),
    row.status,
    row.gross,
    row.gst,
    row.deductions,
    row.net,
  ]);
  const statuses = [...new Set(input.rows.map((row) => row.status))];
  const byStatus: Cell[][] = statuses.map((status) => {
    const of = input.rows.filter((row) => row.status === status);
    return [
      status,
      of.length,
      of.reduce((sum, row) => sum + row.gross, 0),
      of.reduce((sum, row) => sum + row.net, 0),
    ];
  });
  return {
    title: contractor
      ? "RA Bill Register (Contractors)"
      : "RA Bill Register (Client)",
    notes: [
      `${contractor ? "Contractor" : "Client"} RA and escalation bills with a Bill Date in the period, oldest first. Net = gross + GST − deductions; TDS is taken at payment.`,
      ...(input.financial ? [] : [MONEY_LEFT_OUT]),
    ],
    tables: [
      table({
        name: "Bills",
        cols,
        rows,
        financial: input.financial,
        labels: { 0: "Total", 3: count(rows.length, "bill", "bills") },
        skip: [1],
      }),
      table({
        name: "By status",
        cols: [
          plain("Status", "text", 18),
          plain("Bills", "count", 8),
          money("Gross"),
          money("Net"),
        ],
        rows: byStatus,
        financial: input.financial,
        labels: { 0: "Total" },
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Deductions register
// ---------------------------------------------------------------------------

export type DeductionRegisterRow = {
  billDate: CalendarDate;
  billNumber: string;
  contractor: string;
  workOrder: string | null;
  /** "Retention", "Mobilisation advance recovery", … */
  kind: string;
  /** The Material, the advance or the typed description. */
  detail: string | null;
  amount: number;
};

/**
 * Deductions register (CM-1111): every deduction on approved Contractor
 * Bills dated in the period, with a total per kind.
 */
export function buildDeductionsRegister(input: {
  rows: readonly DeductionRegisterRow[];
}): ReportBody {
  const cols: Col[] = [
    plain("Bill Date", "text", 12),
    plain("Bill No.", "text", 16),
    plain("Contractor", "text", 22),
    plain("WO No.", "text", 16),
    plain("Deduction", "text", 26),
    plain("Detail", "text", 30),
    money("Amount"),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    dateLabel(row.billDate),
    row.billNumber,
    row.contractor,
    row.workOrder,
    row.kind,
    row.detail,
    row.amount,
  ]);
  const kinds = [...new Set(input.rows.map((row) => row.kind))];
  return {
    title: "Deductions Register",
    notes: [
      "Deductions on approved Contractor Bills with a Bill Date in the period. TDS is not a bill deduction: it is taken when the bill is paid.",
    ],
    tables: [
      table({
        name: "Deductions",
        cols,
        rows,
        financial: true,
        labels: {
          0: "Total",
          1: count(rows.length, "deduction", "deductions"),
        },
      }),
      table({
        name: "By kind",
        cols: [
          plain("Deduction", "text", 26),
          plain("Lines", "count", 8),
          money("Amount"),
        ],
        rows: kinds.map((kind) => {
          const of = input.rows.filter((row) => row.kind === kind);
          return [
            kind,
            of.length,
            of.reduce((sum, row) => sum + row.amount, 0),
          ];
        }),
        financial: true,
        labels: { 0: "Total" },
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Retention register
// ---------------------------------------------------------------------------

export type RetentionRegisterRow = {
  /** The Work Order (contractor side) or "Client contract". */
  contract: string;
  party: string;
  retentionPercent: number;
  /** Paise deducted on approved bills dated up to the date. */
  held: number;
  /** Paise released up to the date. */
  released: number;
};

/**
 * Retention register (CM-1111): retention held from each Contractor per
 * Work Order and, with Client Bills Financial, retention the Client holds
 * on the client contract, as on the date.
 */
export function buildRetentionRegister(input: {
  asOn: CalendarDate;
  contractor: readonly RetentionRegisterRow[];
  /** Null when the requester may not see the client side. */
  client: readonly RetentionRegisterRow[] | null;
}): ReportBody {
  const cols = (party: string): Col[] => [
    plain("Contract", "text", 18),
    plain(party, "text", 24),
    plain("Retention %", "percent", 9),
    money("Held"),
    money("Released"),
    money("Balance"),
  ];
  const rowsOf = (rows: readonly RetentionRegisterRow[]): Cell[][] =>
    rows.map((row) => [
      row.contract,
      row.party,
      row.retentionPercent,
      row.held,
      row.released,
      row.held - row.released,
    ]);
  return {
    title: "Retention Register",
    notes: [
      `As on ${dateLabel(input.asOn)}: retention deducted on approved bills dated up to then, less what was released up to then.`,
      ...(input.client == null
        ? ["The client side is left out (it needs Client Bills Financial)."]
        : []),
    ],
    tables: [
      table({
        name: "Held from Contractors",
        cols: cols("Contractor"),
        rows: rowsOf(input.contractor),
        financial: true,
        labels: { 0: "Total" },
      }),
      ...(input.client == null
        ? []
        : [
            table({
              name: "Held by the Client",
              cols: cols("Client"),
              rows: rowsOf(input.client),
              financial: true,
              labels: { 0: "Total" },
            }),
          ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Material reconciliation
// ---------------------------------------------------------------------------

export type MaterialReconciliationRow = {
  workOrder: string;
  contractor: string;
  material: string;
  unit: string;
  /** "Free issue" or "At cost". */
  basis: string;
  theoretical: number;
  wastagePercent: number;
  allowed: number;
  issued: number;
  /** issued − allowed when above, else 0. */
  excess: number;
  /** "Under-use" when issued is below theoretical × (1 − wastage). */
  flag: string | null;
  /** Paise per unit; null without a penal rate. */
  penalRate: number | null;
  /** Paise: excess × penal rate. */
  recoveryDue: number;
  /** Paise recovered on approved bills. */
  recovered: number;
};

/**
 * Material reconciliation (CM-1111): each issued Work Order's materials,
 * cumulative to its last approved RA bill dated up to the date: theoretical
 * from the billed quantities, allowed with wastage, issued up to the date,
 * excess and the recovery due at the penal rate.
 */
export function buildMaterialReconciliationReport(input: {
  asOn: CalendarDate;
  rows: readonly MaterialReconciliationRow[];
  financial: boolean;
}): ReportBody {
  const cols: Col[] = [
    plain("WO No.", "text", 16),
    plain("Contractor", "text", 20),
    plain("Material", "text", 22),
    plain("Unit", "text", 7),
    plain("Basis", "text", 10),
    plain("Theoretical", "quantity", 11),
    plain("Wastage %", "percent", 9),
    plain("Allowed", "quantity", 11),
    plain("Issued", "quantity", 11),
    plain("Excess", "quantity", 10),
    plain("Flag", "text", 10),
    money("Penal Rate", 10),
    money("Recovery Due"),
    money("Recovered"),
    money("Balance"),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    row.workOrder,
    row.contractor,
    row.material,
    row.unit,
    row.basis,
    row.theoretical,
    row.wastagePercent,
    row.allowed,
    row.issued,
    row.excess,
    row.flag,
    row.penalRate,
    row.recoveryDue,
    row.recovered,
    Math.max(0, row.recoveryDue - row.recovered),
  ]);
  const built = table({
    name: "Reconciliation",
    cols,
    rows,
    financial: input.financial,
    labels: { 0: "Total" },
    // Materials in different units, and rates, are not summed.
    skip: [5, 7, 8, 9, 11],
  });
  return {
    title: "Material Reconciliation",
    notes: [
      `Issued Work Orders' materials as on ${dateLabel(input.asOn)}: theoretical = billed quantity × coefficient over approved RA bills dated up to then; allowed = theoretical × (1 + wastage); issued = deliveries to the Contractor up to then.`,
      ...(input.financial ? [] : [MONEY_LEFT_OUT]),
    ],
    tables: [built],
  };
}

// ---------------------------------------------------------------------------
// Variations
// ---------------------------------------------------------------------------

export type VariationRegisterRow = {
  number: string;
  raisedOn: CalendarDate;
  /** "Extra item", "Quantity", "Rate". */
  kind: string;
  status: string;
  itemNo: string | null;
  description: string | null;
  unit: string | null;
  previousQuantity: number | null;
  newQuantity: number | null;
  previousRate: number | null;
  newRate: number | null;
  /** Paise: new value − previous value of the item. */
  valueChange: number;
  reason: string;
  decidedBy: string | null;
};

/** Variations register (CM-1111): the Variations raised in the period. */
export function buildVariationsRegister(input: {
  rows: readonly VariationRegisterRow[];
  financial: boolean;
}): ReportBody {
  const cols: Col[] = [
    plain("Variation No.", "text", 14),
    plain("Raised On", "text", 12),
    plain("Kind", "text", 10),
    plain("Status", "text", 14),
    plain("Item No.", "text", 8),
    plain("Description", "text", 26),
    plain("Unit", "text", 7),
    plain("Previous Qty", "quantity", 10),
    plain("New Qty", "quantity", 10),
    money("Previous Rate", 11),
    money("New Rate", 11),
    money("Value Change"),
    plain("Reason", "text", 26),
    plain("Decided By", "text", 16),
  ];
  const rows: Cell[][] = input.rows.map((row) => [
    row.number,
    dateLabel(row.raisedOn),
    row.kind,
    row.status,
    row.itemNo,
    row.description,
    row.unit,
    row.previousQuantity,
    row.newQuantity,
    row.previousRate,
    row.newRate,
    row.valueChange,
    row.reason,
    row.decidedBy,
  ]);
  const built = table({
    name: "Variations",
    cols,
    rows,
    financial: input.financial,
    labels: { 0: "Total", 1: count(rows.length, "Variation", "Variations") },
    skip: [7, 8, 9, 10],
  });
  return {
    title: "Variations Register",
    notes: [
      "Variations raised in the period, oldest first. Value change = new quantity × new rate − previous quantity × previous rate of the BOQ item.",
      ...(input.financial ? [] : [MONEY_LEFT_OUT]),
    ],
    tables: [built],
  };
}
