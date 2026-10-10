import ExcelJS from "exceljs";

import type {
  SalarySlipRecord,
  SkippedMember,
} from "../application/salary-run-handlers";
import { monthLabel } from "../domain/payslip";

/**
 * The team salary report (CM-317, `hrms/salaries/report/team`): one row
 * per regular slip of the month with its Attendance Details, earnings,
 * deductions, net and employer contributions, a totals row, the
 * advances paid that month, and the members without a slip. Amounts are
 * rupees; without Financial the amount columns are blank.
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
const MONEY = "#,##0.00";
const DAYS = "0.0";

const STATUS: Record<string, string> = {
  calculated: "Calculated",
  approved: "Approved",
  paid: "Paid",
};

type Column = {
  header: string;
  width: number;
  kind: "text" | "days" | "money";
  value: (record: SalarySlipRecord) => string | number | null;
};

const COLUMNS: Column[] = [
  { header: "Member", width: 24, kind: "text", value: (r) => r.member.name },
  {
    header: "Designation",
    width: 18,
    kind: "text",
    value: (r) => r.member.designationName,
  },
  {
    header: "Status",
    width: 11,
    kind: "text",
    value: (r) => STATUS[r.slip.status] ?? r.slip.status,
  },
  {
    header: "Working days",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.workingDays,
  },
  {
    header: "Present",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.present,
  },
  {
    header: "Half days",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.halfDays,
  },
  {
    header: "Absent",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.absent,
  },
  {
    header: "Paid leave",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.paidLeave,
  },
  {
    header: "Unpaid leave",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.unpaidLeave,
  },
  {
    header: "Week off",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.weekOff,
  },
  {
    header: "Holidays",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.holidays,
  },
  {
    header: "Payable days",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.payable,
  },
  {
    header: "OT hours",
    width: 9,
    kind: "days",
    value: (r) => r.slip.days.overtimeHours,
  },
  {
    header: "Gross",
    width: 13,
    kind: "money",
    value: (r) => r.slip.money.grossEarnings,
  },
  {
    header: "PF",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.pfEmployee,
  },
  {
    header: "ESI",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.esiEmployee,
  },
  {
    header: "PT",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.professionalTax,
  },
  {
    header: "Absent deduction",
    width: 12,
    kind: "money",
    value: (r) => r.slip.money.absentDeduction,
  },
  {
    header: "Unpaid leave deduction",
    width: 12,
    kind: "money",
    value: (r) => r.slip.money.unpaidLeaveDeduction,
  },
  {
    header: "Other deductions",
    width: 12,
    kind: "money",
    value: (r) => r.slip.money.otherDeductions,
  },
  {
    header: "Advance recovered",
    width: 12,
    kind: "money",
    value: (r) => r.slip.money.advanceRecovered,
  },
  {
    header: "Net payable",
    width: 13,
    kind: "money",
    value: (r) => r.slip.money.netPayable,
  },
  {
    header: "Employer EPF",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.pfEmployer,
  },
  {
    header: "Employer EPS",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.epsEmployer,
  },
  {
    header: "Employer ESI",
    width: 11,
    kind: "money",
    value: (r) => r.slip.money.esiEmployer,
  },
  {
    header: "Paid on",
    width: 12,
    kind: "text",
    value: (r) => r.slip.payment?.date ?? null,
  },
  {
    header: "Mode",
    width: 8,
    kind: "text",
    value: (r) =>
      r.slip.payment == null
        ? null
        : r.slip.payment.mode === "bank"
          ? "Bank"
          : "Cash",
  },
  {
    header: "Reference",
    width: 16,
    kind: "text",
    value: (r) => r.slip.payment?.reference ?? null,
  },
];

function header(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.alignment = { wrapText: true, vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

function cellValue(
  column: Column,
  record: SalarySlipRecord,
): string | number | null {
  if (column.kind === "money")
    return record.amountsVisible
      ? (column.value(record) as number) / 100
      : null;
  return column.value(record);
}

export async function teamSalaryWorkbook(input: {
  company: string;
  month: string;
  records: readonly SalarySlipRecord[];
  skipped: readonly SkippedMember[];
  financial: boolean;
  generatedAt: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet("Team salary", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9 as ExcelJS.PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const regular = input.records.filter(
    (record) => record.slip.kind === "regular",
  );
  const block: [string, string][] = [
    ["Company", input.company],
    ["Report", "Team salary"],
    ["Month", monthLabel(input.month)],
    ["Generated at", input.generatedAt],
    ...(input.financial
      ? ([["Amounts", "Rupees"]] as [string, string][])
      : ([["Amounts", "Hidden: needs Financial on Salary Management"]] as [
          string,
          string,
        ][])),
  ];
  for (const [label, value] of block) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);
  const headerRow = sheet.rowCount + 1;
  header(
    sheet,
    COLUMNS.map((column) => column.header),
  );
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  COLUMNS.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = column.width;
    if (column.kind === "money") col.numFmt = MONEY;
    if (column.kind === "days") col.numFmt = DAYS;
  });
  for (const record of regular)
    sheet.addRow(COLUMNS.map((column) => cellValue(column, record)));
  if (regular.length > 0) {
    const totals = sheet.addRow(
      COLUMNS.map((column, index) => {
        if (index === 0) return "Total";
        if (column.kind !== "money" || !input.financial) return null;
        return (
          regular.reduce(
            (sum, record) => sum + (column.value(record) as number),
            0,
          ) / 100
        );
      }),
    );
    totals.font = { bold: true };
    totals.eachCell((cell) => {
      cell.fill = TOTAL_FILL;
    });
  } else sheet.addRow(["No salaries calculated for this month."]);

  const advances = input.records.filter(
    (record) => record.slip.kind === "advance",
  );
  const advanceSheet = workbook.addWorksheet("Advances");
  header(advanceSheet, [
    "Member",
    "Date",
    "Amount",
    "Instalments",
    "Recovery from",
    "Recovered",
    "Mode",
    "Reference",
    "Reason",
  ]);
  [24, 12, 13, 11, 13, 13, 8, 16, 30].forEach((width, index) => {
    advanceSheet.getColumn(index + 1).width = width;
  });
  advanceSheet.getColumn(3).numFmt = MONEY;
  advanceSheet.getColumn(6).numFmt = MONEY;
  for (const record of advances) {
    const advance = record.slip.advance;
    advanceSheet.addRow([
      record.member.name,
      advance?.advanceDate ?? record.slip.payment?.date ?? null,
      record.amountsVisible ? record.slip.money.netPayable / 100 : null,
      advance?.instalments ?? null,
      advance == null ? null : monthLabel(advance.firstRecoveryMonth),
      record.amountsVisible && advance != null ? advance.recovered / 100 : null,
      record.slip.payment?.mode === "bank" ? "Bank" : "Cash",
      record.slip.payment?.reference ?? null,
      advance?.reason ?? null,
    ]);
  }
  if (advances.length === 0)
    advanceSheet.addRow(["No advances paid this month."]);

  const skippedSheet = workbook.addWorksheet("Not calculated");
  header(skippedSheet, ["Member", "Designation", "Why"]);
  [24, 18, 44].forEach((width, index) => {
    skippedSheet.getColumn(index + 1).width = width;
  });
  for (const item of input.skipped)
    skippedSheet.addRow([item.name, item.designationName, item.message]);
  if (input.skipped.length === 0)
    skippedSheet.addRow(["Every member has a salary this month."]);

  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}
