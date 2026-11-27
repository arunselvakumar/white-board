import {
  byName,
  daysByEmployee,
  endsNextDay,
  hours,
  markOf,
  MARK_LEGEND,
  tally,
  type ReportEmployee,
  type ReportLabourDay,
  workedHundredths,
} from "./labour-days";
import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
} from "./report-document";
import { dateLabel, type DateRange } from "./report-period";

/**
 * Employee Attendance (CM-217): for one Project and a date range, a
 * summary per Employee (present, half day, absent, leave, paid leave,
 * holiday, overtime hours) and every marked day with its status, check-in,
 * check-out, hours worked (ADR CM-0011) and overtime. Only Employees marked
 * in the Project in the range appear.
 */
export function buildLabourAttendanceReport(input: {
  range: DateRange;
  employees: readonly ReportEmployee[];
  days: readonly ReportLabourDay[];
}): ReportBody {
  const inRange = input.days.filter(
    (day) => day.date >= input.range.from && day.date <= input.range.to,
  );
  const byEmployee = daysByEmployee(inRange);
  const employees = input.employees
    .filter((employee) => byEmployee.has(employee.id))
    .sort(byName);

  const summaryColumns = [
    column("Sl. No.", "count", 5),
    column("Employee", "text", 22),
    column("Employee Id", "text", 10),
    column("Category", "text", 14),
    column("Present", "count"),
    column("Half day", "count"),
    column("Absent", "count"),
    column("Leave", "count"),
    column("Paid leave", "count"),
    column("Holiday", "count"),
    column("OT hours", "hours"),
  ];
  const summaryRows: Cell[][] = employees.map((employee, index) => {
    const sum = tally([...(byEmployee.get(employee.id)?.values() ?? [])]);
    return [
      index + 1,
      employee.name,
      employee.employeeCode,
      employee.category,
      sum.present,
      sum.halfDay,
      sum.absent,
      sum.leave,
      sum.paidLeave,
      sum.holiday,
      hours(sum.overtimeHundredths),
    ];
  });
  const summaryTotals = totalsOf(summaryColumns, summaryRows, { 1: "Total" });
  summaryTotals[0] = null;

  const dayColumns = [
    column("Date", "text", 11),
    column("Employee", "text", 22),
    column("Employee Id", "text", 10),
    column("Status", "text", 10),
    column("Shift", "text", 9),
    column("Role", "text", 16),
    column("In", "text", 6),
    column("Out", "text", 10),
    column("Worked", "hours"),
    column("OT hours", "hours"),
  ];
  const names = new Map(employees.map((employee) => [employee.id, employee]));
  const dayRows: Cell[][] = [...inRange]
    .filter((day) => names.has(day.employeeId))
    .sort((a, b) => {
      const left = names.get(a.employeeId);
      const right = names.get(b.employeeId);
      return (
        a.date.localeCompare(b.date) ||
        (left != null && right != null ? byName(left, right) : 0)
      );
    })
    .map((day) => {
      const employee = names.get(day.employeeId);
      return [
        dateLabel(day.date),
        employee?.name ?? "",
        employee?.employeeCode ?? null,
        STATUS_LABEL[markOf(day)],
        day.shift,
        employee?.role ?? null,
        day.checkIn,
        checkOutLabel(day),
        workedOf(day),
        hours(day.overtimeHundredths),
      ];
    });

  return {
    title: "Employee Attendance Report",
    notes: [
      `${String(employees.length)} Employees marked in this Project in the period.`,
      MARK_LEGEND,
    ],
    tables: [
      {
        name: "Summary",
        columns: summaryColumns,
        rows: summaryRows,
        totals: summaryTotals,
      },
      {
        name: "Day by day",
        columns: dayColumns,
        rows: dayRows,
        totals: totalsOf(dayColumns, dayRows, {
          0: "Total",
          1: `${String(dayRows.length)} days`,
        }),
      },
    ],
  };
}

/** `18:00`, or `06:00 (+1)` for a check-out on the next day. */
function checkOutLabel(day: ReportLabourDay): string | null {
  if (day.checkOut == null) return null;
  return day.checkIn != null && endsNextDay(day.checkIn, day.checkOut)
    ? `${day.checkOut} (+1)`
    : day.checkOut;
}

function workedOf(day: ReportLabourDay): number | null {
  const worked = workedHundredths(day);
  return worked == null ? null : hours(worked);
}

const STATUS_LABEL = {
  P: "Present",
  "½": "Half day",
  A: "Absent",
  L: "Leave",
  PL: "Paid leave",
  H: "Holiday",
} as const;
