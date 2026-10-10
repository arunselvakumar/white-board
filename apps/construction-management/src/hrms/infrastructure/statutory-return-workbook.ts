import ExcelJS from "exceljs";

import { monthLabel } from "../domain/payslip";
import {
  ESI_REASON_CODES,
  esiAmountText,
  type EcrReturn,
  type EsiReturn,
  type ReturnGap,
} from "../domain/statutory-returns";

/**
 * The PF ECR and ESIC contribution workbooks (CM-320). The rows come from
 * `domain/statutory-returns.ts`, which cites the EPFO and ESIC formats.
 */

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
const RUPEES = "#,##0";
const RUPEES_PAISE = "#,##0.00";

type Header = { company: string; month: string; generatedAt: string };

function header(sheet: ExcelJS.Worksheet, headers: readonly string[]): void {
  const row = sheet.addRow([...headers]);
  row.font = { bold: true };
  row.alignment = { wrapText: true, vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

function totalsRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
  });
}

function widths(sheet: ExcelJS.Worksheet, values: readonly number[]): void {
  values.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function gapsSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  gaps: readonly ReturnGap[],
  none: string,
): void {
  const sheet = workbook.addWorksheet(title);
  header(sheet, ["Member", "Why"]);
  widths(sheet, [28, 48]);
  for (const gap of gaps) sheet.addRow([gap.name, gap.reason]);
  if (gaps.length === 0) sheet.addRow([none]);
}

async function bytesOf(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

export const ECR_COLUMNS = [
  "UAN",
  "Member name",
  "Gross wages",
  "EPF wages",
  "EPS wages",
  "EDLI wages",
  "EPF contribution remitted",
  "EPS contribution remitted",
  "EPF-EPS difference remitted",
  "NCP days",
  "Refund of advances",
] as const;

/**
 * The PF ECR as Excel: the ECR's eleven columns in the text file's order
 * with a totals row, then the PF members without a UAN.
 */
export async function pfReturnWorkbook(
  input: Header & { ecr: EcrReturn },
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet("ECR", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9 as ExcelJS.PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  for (const [label, value] of [
    ["Company", input.company],
    ["Report", "PF ECR (Electronic Challan cum Return)"],
    ["Wage month", monthLabel(input.month)],
    ["Generated at", input.generatedAt],
    ["Amounts", "Whole rupees"],
  ] as const) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  if (input.ecr.missingUan.length > 0) {
    const row = sheet.addRow([
      "Missing UAN",
      `${String(input.ecr.missingUan.length)} PF members are not in the ECR: see the Missing UAN sheet.`,
    ]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);
  const headerRow = sheet.rowCount + 1;
  header(sheet, ECR_COLUMNS);
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  widths(sheet, [15, 26, 12, 12, 12, 12, 13, 13, 13, 9, 10]);
  // UAN as text so Excel keeps all 12 digits.
  sheet.getColumn(1).numFmt = "@";
  for (let column = 3; column <= 9; column += 1)
    sheet.getColumn(column).numFmt = RUPEES;
  for (const row of input.ecr.rows)
    sheet.addRow([
      row.uan,
      row.name,
      row.grossWages,
      row.epfWages,
      row.epsWages,
      row.edliWages,
      row.epfContribution,
      row.epsContribution,
      row.epfEpsDifference,
      row.ncpDays,
      row.refundOfAdvances,
    ]);
  if (input.ecr.rows.length > 0) {
    const t = input.ecr.totals;
    totalsRow(
      sheet.addRow([
        "Total",
        `${String(input.ecr.rows.length)} members`,
        t.grossWages,
        t.epfWages,
        t.epsWages,
        t.edliWages,
        t.epfContribution,
        t.epsContribution,
        t.epfEpsDifference,
        t.ncpDays,
        t.refundOfAdvances,
      ]),
    );
  } else sheet.addRow(["No PF members with a UAN this month."]);
  gapsSheet(
    workbook,
    "Missing UAN",
    input.ecr.missingUan,
    "Every PF member has a UAN.",
  );
  return bytesOf(workbook);
}

export const ESI_UPLOAD_COLUMNS = [
  "IP Number (10 Digits)",
  "IP Name( Only alphabets and space )",
  "No of Days for which wages paid/payable during the month",
  "Total Monthly Wages",
  "Reason Code for Zero workings days(numeric only; provide 0 for all other reasons)",
  "Last Working Day( Format DD/MM/YYYY  or DD-MM-YYYY)",
] as const;

/**
 * The ESIC monthly contribution workbook: the upload sheet in the ESIC
 * template's six columns, every cell text and nothing else on it (so it
 * can be saved as `.xls` and uploaded); the contributions with totals; the
 * ESI members without an IP number; and the reason codes.
 */
export async function esiReturnWorkbook(
  input: Header & { esi: EsiReturn },
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";

  const upload = workbook.addWorksheet("MC upload");
  header(upload, ESI_UPLOAD_COLUMNS);
  widths(upload, [16, 28, 16, 14, 22, 18]);
  for (let column = 1; column <= ESI_UPLOAD_COLUMNS.length; column += 1)
    upload.getColumn(column).numFmt = "@";
  for (const row of input.esi.rows)
    upload.addRow([
      row.ipNumber,
      row.name,
      String(row.days),
      esiAmountText(row.wages),
      String(row.reasonCode),
      row.lastWorkingDay ?? "",
    ]);

  const sheet = workbook.addWorksheet("Contributions");
  for (const [label, value] of [
    ["Company", input.company],
    ["Report", "ESI monthly contribution"],
    ["Contribution month", monthLabel(input.month)],
    ["Generated at", input.generatedAt],
    [
      "Upload",
      "Save the MC upload sheet as Excel 97-2003 (.xls) before uploading it on the ESIC portal.",
    ],
  ] as const) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  if (input.esi.missingIpNumber.length > 0) {
    const row = sheet.addRow([
      "Missing IP number",
      `${String(input.esi.missingIpNumber.length)} ESI members are not in the upload: see the Missing IP Number sheet.`,
    ]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);
  const headerRow = sheet.rowCount + 1;
  header(sheet, [
    "IP Number",
    "IP Name",
    "Days paid",
    "Total monthly wages",
    "Employee share",
    "Employer share",
    "Total contribution",
  ]);
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  widths(sheet, [16, 28, 10, 15, 13, 13, 14]);
  sheet.getColumn(1).numFmt = "@";
  for (let column = 4; column <= 7; column += 1)
    sheet.getColumn(column).numFmt = RUPEES_PAISE;
  for (const row of input.esi.rows)
    sheet.addRow([
      row.ipNumber,
      row.name,
      row.days,
      row.wages,
      row.employeeShare,
      row.employerShare,
      Math.round((row.employeeShare + row.employerShare) * 100) / 100,
    ]);
  if (input.esi.rows.length > 0) {
    const t = input.esi.totals;
    totalsRow(
      sheet.addRow([
        "Total",
        `${String(input.esi.rows.length)} members`,
        t.days,
        t.wages,
        t.employeeShare,
        t.employerShare,
        Math.round((t.employeeShare + t.employerShare) * 100) / 100,
      ]),
    );
  } else sheet.addRow(["No ESI members with an IP number this month."]);

  gapsSheet(
    workbook,
    "Missing IP Number",
    input.esi.missingIpNumber,
    "Every ESI member has an IP number.",
  );

  const codes = workbook.addWorksheet("Reason codes");
  header(codes, ["Code", "Reason for zero working days"]);
  widths(codes, [8, 36]);
  for (const item of ESI_REASON_CODES) codes.addRow([item.code, item.reason]);
  codes.addRow([]);
  codes.addRow([
    "",
    "A member paid for no day is given 0; change it if another code applies. Last Working Day is filled only for codes 2, 3, 4, 5, 6 and 10.",
  ]);
  return bytesOf(workbook);
}
