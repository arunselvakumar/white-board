import ExcelJS from "exceljs";

import type {
  StockLedgerReport,
  StockLedgerWorkbook,
  StockLedgerWorkbookHeader,
} from "../application/central-inventory-queries";
import { STOCK_ENTRY_LABELS, STOCK_ENTRY_TYPES } from "../domain/stock-ledger";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};
const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFD1D5DB" },
};
const QUANTITY = "#,##0.000";

/**
 * The Central Inventory Stock Ledger as one xlsx sheet (CM-509, ADR
 * CM-0015 §12): a header block, then per location and material the
 * opening, each movement type and the closing, in the material's unit.
 */
export async function renderStockLedgerXlsx(
  report: StockLedgerReport,
  header: StockLedgerWorkbookHeader,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Stock Ledger", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9 as ExcelJS.PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const columns = [
    "Location",
    "Location type",
    "Material",
    "Category",
    "Unit",
    "Opening",
    ...STOCK_ENTRY_TYPES.map((type) => STOCK_ENTRY_LABELS[type]),
    "Closing",
  ];
  const block: [string, string][] = [
    ["Company", header.company],
    ["Report", "Central Inventory Stock Ledger"],
    ["Period", `${report.from} to ${report.to}`],
    ["Locations", header.locations],
    ["Generated at", header.generatedAt],
  ];
  for (const [label, value] of block) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);
  const head = sheet.addRow(columns);
  head.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  for (const line of report.rows) {
    const row = sheet.addRow([
      line.location.name,
      line.location.kind === "project" ? "Project" : "Store",
      line.materialName,
      line.categoryName ?? "",
      line.uomName,
      Number(line.opening),
      ...STOCK_ENTRY_TYPES.map((type) => Number(line.movements[type])),
      Number(line.closing),
    ]);
    for (let index = 6; index <= columns.length; index += 1)
      row.getCell(index).numFmt = QUANTITY;
    row.eachCell((cell) => {
      cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    });
  }
  if (report.rows.length === 0)
    sheet.addRow(["No stock movements in this period."]);
  sheet.columns.forEach((column, index) => {
    column.width = index < 3 ? 28 : index < 5 ? 14 : 13;
  });
  sheet.views = [{ state: "frozen", ySplit: block.length + 2 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export const xlsxStockLedgerWorkbook: StockLedgerWorkbook = {
  render: renderStockLedgerXlsx,
};
