/**
 * A report as data (CM-217): a header block and one or more tables, each
 * with a totals row. The Excel and PDF renderers print the same document,
 * so both files always agree.
 */

/** How a column's cells are written and summed. */
export type ColumnKind =
  /** Free text. */
  | "text"
  /** Whole numbers: heads, days counted. */
  | "count"
  /** Days in halves: 12.5. */
  | "days"
  /** Hours with two decimals. */
  | "hours"
  /** Integer paise; printed as rupees. */
  | "money";

export type ReportColumn = {
  label: string;
  kind: ColumnKind;
  /** Relative width, roughly in characters. */
  width: number;
};

export type Cell = string | number | null;

export type ReportTable = {
  /** Sheet name in Excel, section heading in the PDF. */
  name: string;
  columns: ReportColumn[];
  rows: Cell[][];
  /** The totals row, aligned with `columns`; null when a table has none. */
  totals: Cell[] | null;
};

/** What a report builder returns: everything but the Company header. */
export type ReportBody = {
  title: string;
  /** Printed under the header: scope, rules, what is left out. */
  notes: string[];
  tables: ReportTable[];
};

/** The standard report header (`modules/11` rendering conventions). */
export type ReportHeader = {
  company: string;
  title: string;
  /** "All projects" for a central report. */
  project: string;
  address: string | null;
  /** "01 Sep 2026 to 30 Sep 2026" or "September 2026". */
  period: string;
  /** In the Company's time zone, with the zone named. */
  generatedAt: string;
  /** ISO 4217, for "Amounts in INR". */
  currency: string;
};

export type ReportDocument = {
  header: ReportHeader;
  notes: string[];
  tables: ReportTable[];
  /** Wide registers print on A3; everything else on A4. Always landscape. */
  pageSize: "a4" | "a3";
  /** Download name without extension. */
  fileName: string;
};

export function column(
  label: string,
  kind: ColumnKind,
  width: number = kind === "text" ? 16 : kind === "money" ? 12 : 7,
): ReportColumn {
  return { label, kind, width };
}

/**
 * Sums the numeric columns of `rows` (hours and days exactly, in
 * hundredths); text columns take `labels[index]` or stay empty.
 */
export function totalsOf(
  columns: readonly ReportColumn[],
  rows: readonly Cell[][],
  labels: Record<number, string> = {},
): Cell[] {
  return columns.map((col, index) => {
    if (col.kind === "text") return labels[index] ?? null;
    let sum = 0;
    let any = false;
    for (const row of rows) {
      const value = row[index];
      if (typeof value !== "number") continue;
      any = true;
      sum +=
        col.kind === "money" || col.kind === "count"
          ? value
          : Math.round(value * 100);
    }
    if (!any) return col.kind === "money" ? null : 0;
    return col.kind === "money" || col.kind === "count" ? sum : sum / 100;
  });
}
