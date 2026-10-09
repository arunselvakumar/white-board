import {
  byName,
  daysByLabour,
  hours,
  markOf,
  MARK_LEGEND,
  tally,
  type ReportLabour,
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
 * Month-wise Labour (CM-217): Labour × day of the month (P/½/A/L/PL/H),
 * day counts and overtime hours, plus wages earned with Financial. Without
 * Financial the money columns are left out, not blanked.
 */
export function buildMonthWiseLabourReport(input: {
  month: string;
  labours: readonly ReportLabour[];
  days: readonly ReportLabourDay[];
  financial: boolean;
}): ReportBody {
  const range = monthRange(input.month);
  const dates = datesIn(range);
  const inMonth = input.days.filter(
    (day) => day.date >= range.from && day.date <= range.to,
  );
  const byLabour = daysByLabour(inMonth);
  const labours = input.labours
    .filter((labour) => byLabour.has(labour.id))
    .sort(byName);

  const columns: ReportColumn[] = [
    column("Sl. No.", "count", 4),
    column("Labour", "text", 18),
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

  const rows: Cell[][] = labours.map((labour, index) => {
    const own = byLabour.get(labour.id) ?? new Map<string, ReportLabourDay>();
    const sum = tally([...own.values()]);
    const row: Cell[] = [
      index + 1,
      labour.name,
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
    title: "Month-wise Labour Report",
    notes: [
      MARK_LEGEND,
      "The totals row counts Labours at work (present or half day) on each day.",
      ...(input.financial
        ? []
        : ["Wages are left out: they need Labour Financial."]),
    ],
    tables: [{ name: "Month", columns, rows, totals }],
  };
}
