import ExcelJS from "exceljs";

import type { MonthlySummary } from "../application/attendance-handlers";
import type { AttendanceDay, HrmsDayStatus } from "../application/ports";

/**
 * The monthly attendance report (CM-309, `modules/10` "Reports"): a
 * Summary sheet (one row per member: the month's counts and hours) and a
 * Days sheet (member × day, one status letter per day). The day rules
 * live in the hrms domain, so the report is built here rather than in the
 * reporting context's job runner, which reads labour tables.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

/** One or two letters per day status, as the grid on screen shows them. */
export const DAY_STATUS_LETTERS: Record<HrmsDayStatus, string> = {
  present: "P",
  half_day: "HD",
  absent: "A",
  on_leave: "L",
  holiday: "H",
  week_off: "WO",
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function letter(day: AttendanceDay, today: string): string {
  if (day.date > today) return "";
  const base = DAY_STATUS_LETTERS[day.status];
  return day.status === "on_leave" && day.leave?.half === true ? "½L" : base;
}

function header(sheet: ExcelJS.Worksheet, values: string[]): void {
  const row = sheet.addRow(values);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

async function toBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  // A Node Buffer at runtime; exceljs declares its own `Buffer` type.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

export async function attendanceMonthWorkbook(
  summary: MonthlySummary,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Construction Management";
  const title = `Monthly Attendance — ${MONTH_LABEL.format(new Date(`${summary.month}-01T00:00:00.000Z`))}`;

  const totals = workbook.addWorksheet("Summary");
  totals.addRow([title]).font = { bold: true, size: 13 };
  totals.addRow([
    summary.month < summary.today.slice(0, 7)
      ? "Whole month."
      : `Counted up to ${summary.today}; later days are not counted.`,
  ]);
  totals.addRow([]);
  header(totals, [
    "Team Member",
    "Designation",
    "Working Days",
    "Present",
    "Half Days",
    "Absent",
    "Paid Leave",
    "Unpaid Leave",
    "Holidays",
    "Week Offs",
    "Late",
    "Worked Hours",
    "OT Hours",
  ]);
  for (const row of summary.rows) {
    const c = row.counts;
    totals.addRow([
      row.member.name,
      row.member.designationName ?? "",
      c.workingDays,
      c.present,
      c.halfDays,
      c.absent,
      c.paidLeave,
      c.unpaidLeave,
      c.holidays,
      c.weekOff,
      c.late,
      c.workedHours,
      c.overtimeHours,
    ]);
  }
  totals.getColumn(1).width = 28;
  totals.getColumn(2).width = 20;
  for (let index = 3; index <= 13; index += 1)
    totals.getColumn(index).width = 12;
  totals.getColumn(12).numFmt = "0.00";
  totals.getColumn(13).numFmt = "0.00";
  totals.views = [{ state: "frozen", ySplit: 4 }];

  const grid = workbook.addWorksheet("Days");
  grid.addRow([title]).font = { bold: true, size: 13 };
  grid.addRow([
    "P Present · HD Half Day · A Absent · L Leave (½L half day) · H Holiday · WO Week Off · * late",
  ]);
  grid.addRow([]);
  const dates = summary.rows[0]?.days.map((day) => day.date) ?? [];
  header(grid, ["Team Member", ...dates.map((date) => date.slice(8, 10))]);
  for (const row of summary.rows)
    grid.addRow([
      row.member.name,
      ...row.days.map(
        (day) => `${letter(day, summary.today)}${day.late ? "*" : ""}`,
      ),
    ]);
  grid.getColumn(1).width = 28;
  dates.forEach((_, index) => {
    const column = grid.getColumn(index + 2);
    column.width = 5;
    column.alignment = { horizontal: "center" };
  });
  grid.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];

  return toBytes(workbook);
}
