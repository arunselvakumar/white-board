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
 * The procurement reports (CM-903, ADR CM-0021 §5): Purchase Requests,
 * Purchase Orders, Material Received, Material Transfers and the Stock
 * Register, as Excel and PDF tables. The source
 * (`src/composition/procurement-report-source.ts`) applies procurement's
 * rules — statuses, the stock ledger's register — and hands over
 * printable words; these builders only lay them out.
 *
 * Quantities are numbers with up to three decimals. Quantities of
 * different materials are never added up: their units differ.
 */

const day = (date: CalendarDate | null): string | null =>
  date == null ? null : dateLabel(date);

/** What a report covers, as its notes say it. */
export type ProcurementReportScope = {
  /** Without a Project: the Projects (and Stores) the requester may see. */
  central: boolean;
  /**
   * What a central report reads, in words: "every Project and every
   * Central Store", "the Projects you are on", "the Projects you chose".
   */
  covers: string | null;
  /** The filters as printed: `["Status: Approved", "Supplier: Sri Murugan"]`. */
  filters: readonly string[];
};

function scopeNotes(scope: ProcurementReportScope): string[] {
  const notes: string[] = [];
  if (scope.central && scope.covers != null)
    notes.push(`Covers ${scope.covers}.`);
  if (scope.filters.length > 0)
    notes.push(`Filtered by ${scope.filters.join("; ")}.`);
  return notes;
}

/** A count of rows per status, in the order given, then any others. */
function statusTable(
  name: string,
  statuses: readonly string[],
  rows: readonly { status: string }[],
): ReportTable {
  const seen = [
    ...statuses,
    ...[...new Set(rows.map((row) => row.status))].filter(
      (status) => !statuses.includes(status),
    ),
  ];
  return {
    name,
    columns: [column("Status", "text", 18), column("Count", "count", 8)],
    rows: seen.map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
    totals: ["Total", rows.length],
  };
}

/** A totals row that only counts: "Total", "3 requests", blanks after. */
function countTotals(
  columns: readonly ReportColumn[],
  count: number,
  noun: [string, string],
  at = 1,
): Cell[] {
  const totals: Cell[] = columns.map(() => null);
  totals[0] = "Total";
  totals[at] = `${String(count)} ${count === 1 ? noun[0] : noun[1]}`;
  return totals;
}

/** Sums one money column over rows; null when no row has a figure. */
function moneySum(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length === 0
    ? null
    : present.reduce((sum, value) => sum + value, 0);
}

// ---------------------------------------------------------------------------
// Purchase Requests
// ---------------------------------------------------------------------------

export const PURCHASE_REQUEST_STATUSES = [
  "Pending",
  "Approved",
  "Rejected",
] as const;

/** One material line of a Purchase Request. */
export type PurchaseRequestReportRow = {
  number: string;
  requestDate: CalendarDate;
  /** The Project's name (printed on a central report). */
  project: string;
  material: string;
  category: string | null;
  quantity: number;
  orderedQty: number;
  uom: string;
  requiredBy: CalendarDate | null;
  location: string | null;
  /** "Pending", "Approved", "Rejected". */
  status: string;
  /** "Not ordered", "Partially ordered", "Ordered", "Excess ordered". */
  orderStatus: string;
  createdBy: string | null;
  decidedBy: string | null;
  remark: string | null;
};

/**
 * Purchase Requests (CM-903, `modules/06` "Purchase Request report"):
 * one row per material line of each request raised in the period, by
 * Request Date then number, with its status, order status, who raised and
 * who decided it; a count by status.
 */
export function buildPurchaseRequestReport(input: {
  rows: readonly PurchaseRequestReportRow[];
  scope: ProcurementReportScope;
}): ReportBody {
  const central = input.scope.central;
  const columns: ReportColumn[] = [
    column("PR No.", "text", 14),
    column("Request Date", "text", 11),
  ];
  if (central) columns.push(column("Project", "text", 16));
  columns.push(
    column("Material", "text", 22),
    column("Category", "text", 14),
    column("Quantity", "quantity", 9),
    column("Ordered", "quantity", 9),
    column("Unit", "text", 7),
    column("Required By", "text", 11),
    column("Location", "text", 14),
    column("Status", "text", 10),
    column("Order Status", "text", 13),
    column("Created By", "text", 15),
    column("Decided By", "text", 15),
    column("Remark", "text", 18),
  );
  const sorted = [...input.rows].sort(
    (a, b) =>
      a.requestDate.localeCompare(b.requestDate) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  const rows: Cell[][] = sorted.map((row) => {
    const cells: Cell[] = [row.number, dateLabel(row.requestDate)];
    if (central) cells.push(row.project);
    cells.push(
      row.material,
      row.category,
      row.quantity,
      row.orderedQty,
      row.uom,
      day(row.requiredBy),
      row.location,
      row.status,
      row.orderStatus,
      row.createdBy,
      row.decidedBy,
      row.remark,
    );
    return cells;
  });
  // One status per request, not per line.
  const requests = new Map<string, { status: string }>();
  for (const row of sorted) requests.set(row.number, { status: row.status });
  return {
    title: "Purchase Request Report",
    notes: [
      "One row per material of each Purchase Request raised in the period, by Request Date.",
      ...scopeNotes(input.scope),
    ],
    tables: [
      {
        name: "Purchase Requests",
        columns,
        rows,
        totals: countTotals(columns, requests.size, ["request", "requests"]),
      },
      statusTable("By status", PURCHASE_REQUEST_STATUSES, [
        ...requests.values(),
      ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Purchase Orders
// ---------------------------------------------------------------------------

export type PurchaseOrderReportLine = {
  material: string;
  uom: string;
  ordered: number;
  received: number;
  /** Paise per unit. */
  unitRate: number;
  gstRate: number;
  /** Paise, with GST. */
  total: number;
};

export type PurchaseOrderReportRow = {
  number: string;
  orderDate: CalendarDate;
  /** The Project or Central Store it is for. */
  place: string;
  supplier: string;
  purchaseRequest: string | null;
  expectedDelivery: CalendarDate;
  /** "Pending", "Approved", "Rejected". */
  status: string;
  /** "Not received", "Partially received", "Received", or "Closed". */
  receiptStatus: string;
  /** Paise. */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  lines: readonly PurchaseOrderReportLine[];
};

export const PURCHASE_ORDER_STATUSES = PURCHASE_REQUEST_STATUSES;

/**
 * Purchase Orders (CM-903): each order in the period by PO Date with its
 * supplier, status, receipt status and value (taxable, CGST, SGST, IGST,
 * total), then each line ordered and received. The Purchase Order menu
 * has no Financial: amounts show to everyone who may report on POs, as
 * the PO screens show them; `financial` false leaves them out all the
 * same, for a caller that must.
 */
export function buildPurchaseOrderReport(input: {
  rows: readonly PurchaseOrderReportRow[];
  financial: boolean;
  scope: ProcurementReportScope;
}): ReportBody {
  const { central } = input.scope;
  const money = input.financial;
  const sorted = [...input.rows].sort(
    (a, b) =>
      a.orderDate.localeCompare(b.orderDate) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  const columns: ReportColumn[] = [
    column("PO No.", "text", 14),
    column("PO Date", "text", 11),
  ];
  if (central) columns.push(column("Project / Store", "text", 16));
  columns.push(
    column("Supplier", "text", 20),
    column("PR No.", "text", 13),
    column("Expected Delivery", "text", 11),
    column("Status", "text", 10),
    column("Receipt Status", "text", 14),
    column("Lines", "count", 6),
  );
  if (money)
    columns.push(
      column("Taxable", "money"),
      column("CGST", "money", 10),
      column("SGST", "money", 10),
      column("IGST", "money", 10),
      column("Total", "money"),
    );
  const rows: Cell[][] = sorted.map((order) => {
    const cells: Cell[] = [order.number, dateLabel(order.orderDate)];
    if (central) cells.push(order.place);
    cells.push(
      order.supplier,
      order.purchaseRequest,
      dateLabel(order.expectedDelivery),
      order.status,
      order.receiptStatus,
      order.lines.length,
    );
    if (money)
      cells.push(
        order.taxable,
        order.cgst,
        order.sgst,
        order.igst,
        order.grandTotal,
      );
    return cells;
  });
  const orderTotals = totalsOf(columns, rows, {
    0: "Total",
    1: `${String(sorted.length)} ${sorted.length === 1 ? "order" : "orders"}`,
  });

  const lineColumns: ReportColumn[] = [
    column("PO No.", "text", 14),
    column("Material", "text", 22),
    column("Unit", "text", 7),
    column("Ordered", "quantity", 9),
    column("Received", "quantity", 9),
    column("Pending", "quantity", 9),
  ];
  if (money)
    lineColumns.push(
      column("Rate", "money", 10),
      column("GST %", "percent", 6),
      column("Total", "money"),
    );
  const lineRows: Cell[][] = sorted.flatMap((order) =>
    order.lines.map((line) => {
      const cells: Cell[] = [
        order.number,
        line.material,
        line.uom,
        line.ordered,
        line.received,
        Math.max(0, Math.round((line.ordered - line.received) * 1000) / 1000),
      ];
      if (money) cells.push(line.unitRate, line.gstRate, line.total);
      return cells;
    }),
  );
  const lineTotals = countTotals(lineColumns, lineRows.length, [
    "line",
    "lines",
  ]);
  if (money)
    lineTotals[lineColumns.length - 1] = moneySum(
      sorted.flatMap((order) => order.lines.map((line) => line.total)),
    );

  return {
    title: "Purchase Order Report",
    notes: [
      "Purchase Orders by PO Date; Pending is what is still to be received of each line.",
      ...scopeNotes(input.scope),
      ...(money ? [] : ["Amounts are left out."]),
    ],
    tables: [
      { name: "Purchase Orders", columns, rows, totals: orderTotals },
      {
        name: "Lines",
        columns: lineColumns,
        rows: lineRows,
        totals: lineTotals,
      },
      statusTable("By status", PURCHASE_ORDER_STATUSES, sorted),
    ],
  };
}

// ---------------------------------------------------------------------------
// Material Received
// ---------------------------------------------------------------------------

export type MaterialReceivedReportLine = {
  material: string;
  uom: string;
  quantity: number;
  /** Paise; null without Financial. */
  unitRate: number | null;
  gstRate: number;
  total: number | null;
};

export type MaterialReceivedReportRow = {
  number: string;
  receiptDate: CalendarDate;
  place: string;
  supplier: string;
  purchaseOrder: string | null;
  invoiceNo: string | null;
  invoiceDate: CalendarDate | null;
  challanNo: string | null;
  grnDcNo: string | null;
  vehicleNo: string | null;
  enteredBy: string | null;
  /** Paise; null without Financial. */
  taxable: number | null;
  gst: number | null;
  total: number | null;
  invoiceAmount: number | null;
  lines: readonly MaterialReceivedReportLine[];
};

/**
 * Material Received (CM-903): each Goods Received Note of the period by
 * GR Date with its supplier, PO, invoice, challan and vehicle, then each
 * material received; rates, GST, value and the invoice amount with
 * Material Received Financial.
 */
export function buildMaterialReceivedReport(input: {
  rows: readonly MaterialReceivedReportRow[];
  financial: boolean;
  /** Without View all: only the receipts the requester entered. */
  own: boolean;
  scope: ProcurementReportScope;
}): ReportBody {
  const { central } = input.scope;
  const money = input.financial;
  const sorted = [...input.rows].sort(
    (a, b) =>
      a.receiptDate.localeCompare(b.receiptDate) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  const columns: ReportColumn[] = [
    column("GRN No.", "text", 14),
    column("GR Date", "text", 11),
  ];
  if (central) columns.push(column("Project / Store", "text", 16));
  columns.push(
    column("Supplier", "text", 20),
    column("PO No.", "text", 13),
    column("Invoice No.", "text", 12),
    column("Invoice Date", "text", 11),
    column("Challan No.", "text", 12),
    column("GRN/DC No.", "text", 12),
    column("Vehicle No.", "text", 11),
    column("Entered By", "text", 15),
    column("Lines", "count", 6),
  );
  if (money)
    columns.push(
      column("Taxable", "money"),
      column("GST", "money", 10),
      column("Total", "money"),
      column("Invoice Amount", "money"),
    );
  const rows: Cell[][] = sorted.map((receipt) => {
    const cells: Cell[] = [receipt.number, dateLabel(receipt.receiptDate)];
    if (central) cells.push(receipt.place);
    cells.push(
      receipt.supplier,
      receipt.purchaseOrder,
      receipt.invoiceNo,
      day(receipt.invoiceDate),
      receipt.challanNo,
      receipt.grnDcNo,
      receipt.vehicleNo,
      receipt.enteredBy,
      receipt.lines.length,
    );
    if (money)
      cells.push(
        receipt.taxable,
        receipt.gst,
        receipt.total,
        receipt.invoiceAmount,
      );
    return cells;
  });
  const lineColumns: ReportColumn[] = [
    column("GRN No.", "text", 14),
    column("Material", "text", 22),
    column("Unit", "text", 7),
    column("Quantity", "quantity", 9),
  ];
  if (money)
    lineColumns.push(
      column("Rate", "money", 10),
      column("GST %", "percent", 6),
      column("Total", "money"),
    );
  const lineRows: Cell[][] = sorted.flatMap((receipt) =>
    receipt.lines.map((line) => {
      const cells: Cell[] = [
        receipt.number,
        line.material,
        line.uom,
        line.quantity,
      ];
      if (money) cells.push(line.unitRate, line.gstRate, line.total);
      return cells;
    }),
  );
  const lineTotals = countTotals(lineColumns, lineRows.length, [
    "line",
    "lines",
  ]);
  if (money)
    lineTotals[lineColumns.length - 1] = moneySum(
      sorted.flatMap((receipt) => receipt.lines.map((line) => line.total)),
    );
  return {
    title: "Material Received Report",
    notes: [
      "Goods Received Notes by GR Date.",
      ...scopeNotes(input.scope),
      ...(input.own
        ? [
            "Only the receipts you entered: you do not have View all on Material Received.",
          ]
        : []),
      ...(money
        ? []
        : [
            "Rates and amounts are left out: they need Financial on Material Received.",
          ]),
    ],
    tables: [
      {
        name: "Receipts",
        columns,
        rows,
        totals: totalsOf(columns, rows, {
          0: "Total",
          1: `${String(sorted.length)} ${sorted.length === 1 ? "receipt" : "receipts"}`,
        }),
      },
      {
        name: "Materials",
        columns: lineColumns,
        rows: lineRows,
        totals: lineTotals,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Material Transfers
// ---------------------------------------------------------------------------

export const TRANSFER_REPORT_STATUSES = [
  "Pending",
  "In transit",
  "Delivered",
  "Rejected",
] as const;

export type MaterialTransferReportLine = {
  material: string;
  uom: string;
  quantity: number;
};

export type MaterialTransferReportRow = {
  number: string;
  transferDate: CalendarDate;
  /** "Project to Store". */
  type: string;
  from: string;
  to: string;
  /** "Pending", "In transit", "Delivered", "Rejected". */
  status: string;
  sentBy: string | null;
  /** The receiver's name on the transfer, else who marked it delivered. */
  receivedBy: string | null;
  deliveredOn: CalendarDate | null;
  remark: string | null;
  lines: readonly MaterialTransferReportLine[];
};

/**
 * Material Transfers (CM-903, `modules/06` "Material Transfer report"):
 * Transfer Number, Date, Type, from and to, Status, Sent By, Received By
 * and Remark for each transfer of the period, then each material sent.
 */
export function buildMaterialTransferReport(input: {
  rows: readonly MaterialTransferReportRow[];
  scope: ProcurementReportScope;
}): ReportBody {
  const sorted = [...input.rows].sort(
    (a, b) =>
      a.transferDate.localeCompare(b.transferDate) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  const columns: ReportColumn[] = [
    column("Transfer No.", "text", 14),
    column("Transfer Date", "text", 11),
    column("Type", "text", 15),
    column("From", "text", 16),
    column("To", "text", 16),
    column("Status", "text", 10),
    column("Sent By", "text", 15),
    column("Received By", "text", 15),
    column("Delivered On", "text", 11),
    column("Lines", "count", 6),
    column("Remark", "text", 18),
  ];
  const rows: Cell[][] = sorted.map((transfer) => [
    transfer.number,
    dateLabel(transfer.transferDate),
    transfer.type,
    transfer.from,
    transfer.to,
    transfer.status,
    transfer.sentBy,
    transfer.receivedBy,
    day(transfer.deliveredOn),
    transfer.lines.length,
    transfer.remark,
  ]);
  const lineColumns: ReportColumn[] = [
    column("Transfer No.", "text", 14),
    column("Material", "text", 22),
    column("Unit", "text", 7),
    column("Quantity", "quantity", 9),
  ];
  const lineRows: Cell[][] = sorted.flatMap((transfer) =>
    transfer.lines.map((line) => [
      transfer.number,
      line.material,
      line.uom,
      line.quantity,
    ]),
  );
  return {
    title: "Material Transfer Report",
    notes: [
      "Material Transfers by Transfer Date; Received By is the receiver named on the transfer, else who marked it delivered.",
      ...scopeNotes(input.scope),
    ],
    tables: [
      {
        name: "Transfers",
        columns,
        rows,
        totals: countTotals(columns, sorted.length, ["transfer", "transfers"]),
      },
      {
        name: "Materials",
        columns: lineColumns,
        rows: lineRows,
        totals: countTotals(lineColumns, lineRows.length, ["line", "lines"]),
      },
      statusTable("By status", TRANSFER_REPORT_STATUSES, sorted),
    ],
  };
}

// ---------------------------------------------------------------------------
// Stock Register
// ---------------------------------------------------------------------------

/** One material at one Project or Store, as the Stock Register screen reads it. */
export type StockRegisterReportRow = {
  place: string;
  material: string;
  category: string | null;
  uom: string;
  opening: number;
  received: number;
  transferredIn: number;
  transferredOut: number;
  issued: number;
  receivedFromStore: number;
  consumed: number;
  missing: number;
  /** Signed. */
  adjustment: number;
  closing: number;
};

/**
 * Stock Register (CM-903, `modules/06` "Stock Register"): per material
 * at each Project or Store, the stock before the period, what moved in it
 * by entry type (outflows as positive quantities, an adjustment with its
 * sign) and the stock at its end — the figures of the Project's Stock
 * Register screen, so closing on today equals Current Inventory.
 */
export function buildStockRegisterReport(input: {
  rows: readonly StockRegisterReportRow[];
  scope: ProcurementReportScope;
}): ReportBody {
  const { central } = input.scope;
  const sorted = [...input.rows].sort(
    (a, b) =>
      a.place.localeCompare(b.place, "en", { sensitivity: "base" }) ||
      a.material.localeCompare(b.material, "en", { sensitivity: "base" }),
  );
  const columns: ReportColumn[] = [];
  if (central) columns.push(column("Project / Store", "text", 16));
  columns.push(
    column("Material", "text", 22),
    column("Category", "text", 14),
    column("Unit", "text", 7),
    column("Opening", "quantity", 9),
    column("Received", "quantity", 9),
    column("Transferred in", "quantity", 9),
    column("Transferred out", "quantity", 9),
    column("Issued", "quantity", 9),
    column("Received from store", "quantity", 9),
    column("Consumed", "quantity", 9),
    column("Missing", "quantity", 9),
    column("Adjustment", "quantity", 9),
    column("Closing", "quantity", 9),
  );
  const rows: Cell[][] = sorted.map((row) => [
    ...(central ? [row.place] : []),
    row.material,
    row.category,
    row.uom,
    row.opening,
    row.received,
    row.transferredIn,
    row.transferredOut,
    row.issued,
    row.receivedFromStore,
    row.consumed,
    row.missing,
    row.adjustment,
    row.closing,
  ]);
  const totals = columns.map((): Cell => null);
  totals[0] = "Total";
  totals[1] = `${String(rows.length)} ${rows.length === 1 ? "row" : "rows"}`;
  return {
    title: "Stock Register",
    notes: [
      "Opening is the stock before the period; outflows show as positive quantities and an adjustment keeps its sign; Closing is the stock at the end of the period.",
      "Materials that held no stock and did not move in the period are left out. Quantities of different materials are not added up.",
      ...scopeNotes(input.scope),
    ],
    tables: [{ name: "Stock Register", columns, rows, totals }],
  };
}
