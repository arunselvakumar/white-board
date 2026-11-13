import ExcelJS from "exceljs";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { zoneParts } from "@/src/shared-kernel/zone-time";

import type { ProspectCompanyListItem } from "../application/prospect-company-handlers";
import type { VisitExportRow } from "../application/visit-handlers";
import {
  INTEREST_LABELS,
  STAGE_LABELS,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUS_LABELS,
} from "../domain/marketing-terms";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

type Column = {
  header: string;
  width: number;
  /** Excel number format: a date, a date and time, or text. */
  format?: "date" | "datetime" | "text";
};

type Cell = string | number | Date | null;

const FORMATS = {
  date: "dd mmm yyyy",
  datetime: "dd mmm yyyy hh:mm",
  text: "@",
} as const;

/**
 * An instant as the Company's wall clock, written as a UTC date so Excel
 * shows that day and time whatever the reader's own zone.
 */
function wallClock(instant: Date, timeZone: string): Date {
  const p = zoneParts(instant, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
}

function day(date: CalendarDate | null): Date | null {
  return date == null ? null : new Date(`${date}T00:00:00Z`);
}

async function workbookOf(
  sheetName: string,
  columns: readonly Column[],
  rows: readonly Cell[][],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const sheet = workbook.addWorksheet(sheetName);
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    if (column.format != null) target.numFmt = FORMATS[column.format];
  });
  const head = sheet.addRow(columns.map((column) => column.header));
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) sheet.addRow([...row]);
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

const VISIT_COLUMNS: Column[] = [
  { header: "Visit No.", width: 12, format: "text" },
  { header: "Date and time", width: 18, format: "datetime" },
  { header: "Prospect Company", width: 30 },
  { header: "Contacts met", width: 24 },
  { header: "Visited by", width: 24 },
  { header: "Purpose", width: 20 },
  { header: "Status", width: 12 },
  { header: "Interest", width: 10 },
  { header: "Outcome", width: 32 },
  { header: "Checked in", width: 11 },
  { header: "Next Follow-up", width: 14, format: "date" },
];

/**
 * The Visits list as Excel (ADR CM-0040 §2, `export`): the list's columns
 * in the Company time zone, Missed as shown, and each Visit's next Open
 * Follow-up. No check-in position (§10).
 */
export function visitsWorkbook(
  items: readonly VisitExportRow[],
  timeZone: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return workbookOf(
    "Visits",
    VISIT_COLUMNS,
    items.map((visit) => [
      visit.number,
      wallClock(visit.visitAt, timeZone),
      visit.prospectCompany.name,
      visit.contactNames.length === 0 ? null : visit.contactNames.join(", "),
      visit.visitors.map((person) => person.name).join(", "),
      visit.purpose == null ? null : VISIT_PURPOSE_LABELS[visit.purpose],
      VISIT_STATUS_LABELS[visit.status],
      visit.interest == null ? null : INTEREST_LABELS[visit.interest],
      visit.outcome,
      visit.checkedIn ? "Yes" : "No",
      day(visit.nextFollowUpOn),
    ]),
  );
}

const COMPANY_COLUMNS: Column[] = [
  { header: "Prospect Company", width: 30 },
  { header: "Industry", width: 18 },
  { header: "City", width: 16 },
  { header: "Stage", width: 20 },
  { header: "Assigned to", width: 22 },
  { header: "Primary Contact", width: 22 },
  { header: "Mobile", width: 16, format: "text" },
  { header: "Last Visit", width: 14, format: "date" },
  { header: "Next Follow-up", width: 14, format: "date" },
];

/**
 * The Prospect Companies list as Excel (ADR CM-0040 §2, `export`): the
 * list's columns with the primary Contact's mobile; Last Visit is a day in
 * the Company time zone.
 */
export function companiesWorkbook(
  items: readonly ProspectCompanyListItem[],
  timeZone: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return workbookOf(
    "Prospect Companies",
    COMPANY_COLUMNS,
    items.map((company) => {
      const last =
        company.lastVisitAt == null
          ? null
          : zoneParts(company.lastVisitAt, timeZone);
      return [
        company.name,
        company.industry,
        company.city,
        STAGE_LABELS[company.stage],
        company.assignedTo?.name ?? null,
        company.primaryContact?.name ?? null,
        company.primaryContact?.mobile ?? null,
        last == null
          ? null
          : new Date(Date.UTC(last.year, last.month - 1, last.day)),
        day(company.nextFollowUpOn),
      ];
    }),
  );
}
