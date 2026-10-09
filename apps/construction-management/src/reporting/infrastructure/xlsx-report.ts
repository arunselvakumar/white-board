import ExcelJS from "exceljs";

import type {
  Cell,
  ReportColumn,
  ReportDocument,
  ReportTable,
} from "../domain/report-document";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};
const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFD1D5DB" },
};

const NUMBER_FORMATS: Record<ReportColumn["kind"], string | undefined> = {
  text: undefined,
  count: "0",
  days: "0.0",
  hours: "0.00",
  money: "#,##0.00",
};

/** Paise as rupees for a money column; everything else as it is. */
function excelValue(
  col: ReportColumn | undefined,
  value: Cell,
): ExcelJS.CellValue {
  if (value == null) return null;
  if (col?.kind === "money" && typeof value === "number") return value / 100;
  return value;
}

/** Excel sheet names: ≤ 31 characters, no `[]:*?/\`, unique. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1)
    candidate = `${base.slice(0, 28)} ${String(n)}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function addTable(
  workbook: ExcelJS.Workbook,
  document: ReportDocument,
  table: ReportTable,
  used: Set<string>,
): void {
  const { header } = document;
  const sheet = workbook.addWorksheet(sheetName(table.name, used), {
    pageSetup: {
      orientation: "landscape",
      // 8 is A3 (missing from exceljs' enum), 9 is A4.
      paperSize: (document.pageSize === "a3" ? 8 : 9) as ExcelJS.PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const width = table.columns.length;

  const block: [string, string][] = [
    ["Company", header.company],
    ["Report", header.title],
    ["Project", header.project],
    ...(header.address == null
      ? []
      : ([["Address", header.address]] as [string, string][])),
    ["Period", header.period],
    ["Generated at", header.generatedAt],
    ...(table.columns.some((col) => col.kind === "money")
      ? ([["Amounts in", header.currency]] as [string, string][])
      : []),
  ];
  const title = sheet.addRow([header.company]);
  title.font = { bold: true, size: 14 };
  const subtitle = sheet.addRow([`${header.title} - ${table.name}`]);
  subtitle.font = { bold: true, size: 12 };
  for (const [label, value] of block.slice(2)) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  for (const note of document.notes) {
    const row = sheet.addRow([note]);
    row.font = { italic: true, color: { argb: "FF4B5563" } };
  }
  sheet.addRow([]);

  const headRow = sheet.addRow(table.columns.map((col) => col.label));
  headRow.font = { bold: true };
  headRow.alignment = { vertical: "middle", wrapText: true };
  headRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  });
  sheet.views = [{ state: "frozen", ySplit: headRow.number }];
  sheet.pageSetup.printTitlesRow = `${String(headRow.number)}:${String(headRow.number)}`;

  for (const values of table.rows) {
    const row = sheet.addRow(
      values.map((value, index) => excelValue(table.columns[index], value)),
    );
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      if (index > width) return;
      cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    });
  }
  if (table.totals != null) {
    const row = sheet.addRow(
      table.totals.map((value, index) =>
        excelValue(table.columns[index], value),
      ),
    );
    row.font = { bold: true };
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      if (index > width) return;
      cell.fill = TOTAL_FILL;
      cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    });
  }

  table.columns.forEach((col, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = Math.max(4, Math.round(col.width * 1.1));
    const format = NUMBER_FORMATS[col.kind];
    if (format != null) target.numFmt = format;
    if (col.kind !== "text") target.alignment = { horizontal: "right" };
  });
  // The header block's labels need room even when the first column is narrow.
  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 0, 14);
}

/** The document as an .xlsx workbook: one sheet per table (CM-217). */
export async function renderXlsx(
  document: ReportDocument,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = document.header.company || "Construction Management";
  workbook.title = document.header.title;
  const used = new Set<string>();
  for (const table of document.tables)
    addTable(workbook, document, table, used);
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}
