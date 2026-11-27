import {
  byName,
  daysByEmployee,
  hours,
  markOf,
  MARK_LEGEND,
  tally,
  type ReportEmployee,
  type ReportLabourDay,
} from "./labour-days";
import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { datesIn, monthRange } from "./report-period";

/**
 * Employee Month (CM-217): Employee × day of the month (P/½/A/L/PL/H),
 * day counts and overtime hours, plus wages earned with Financial. Without
 * Financial the money columns are left out, not blanked.
 */
export function buildMonthWiseLabourReport(input: {
  month: string;
  employees: readonly ReportEmployee[];
  days: readonly ReportLabourDay[];
  financial: boolean;
}): ReportBody {
  const range = monthRange(input.month);
  const dates = datesIn(range);
  const inMonth = input.days.filter(
    (day) => day.date >= range.from && day.date <= range.to,
  );
  const byEmployee = daysByEmployee(inMonth);
  const employees = input.employees
    .filter((employee) => byEmployee.has(employee.id))
    .sort(byName);

  const columns: ReportColumn[] = [
    column("Sl. No.", "count", 4),
    column("Employee", "text", 18),
    ...dates.map((date) => column(String(Number(date.slice(8))), "text", 3.5)),
    column("P", "count", 4),
    column("½", "count", 4),
    column("A", "count", 4),
    column("L", "count", 4),
    column("PL", "count", 4),
    column("H", "count", 4),
    column("OT hrs", "hours", 5),
  ];
  if (input.financial)
    columns.push(
      column("Earned", "money", 10),
      column("OT amount", "money", 9),
      column("Total", "money", 10),
    );

  const rows: Cell[][] = employees.map((employee, index) => {
    const own =
      byEmployee.get(employee.id) ?? new Map<string, ReportLabourDay>();
    const sum = tally([...own.values()]);
    const row: Cell[] = [
      index + 1,
      employee.name,
      ...dates.map((date) => {
        const day = own.get(date);
        return day == null ? null : markOf(day);
      }),
      sum.present,
      sum.halfDay,
      sum.absent,
      sum.leave,
      sum.paidLeave,
      sum.holiday,
      hours(sum.overtimeHundredths),
    ];
    if (input.financial)
      row.push(sum.earned, sum.overtimeAmount, sum.earned + sum.overtimeAmount);
    return row;
  });

  const totals = totalsOf(columns, rows, { 1: "Total" });
  totals[0] = null;
  // A day column's total is how many were at work: present + half days.
  dates.forEach((_, index) => {
    const at = rows.filter((row) => {
      const mark = row[index + 2];
      return mark === "P" || mark === "½";
    }).length;
    totals[index + 2] = at === 0 ? null : String(at);
  });

  return {
    title: "Employee Month Report",
    notes: [
      MARK_LEGEND,
      "The totals row counts Employees at work (present or half day) on each day.",
      ...(input.financial
        ? []
        : ["Wages are left out: they need Employees Financial."]),
    ],
    tables: [{ name: "Month", columns, rows, totals }],
  };
}
