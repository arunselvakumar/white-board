import {
  byName,
  daysByLabour,
  endsNextDay,
  hours,
  markOf,
  MARK_LEGEND,
  tally,
  type ReportLabour,
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
 * All Labour Attendance (CM-217): for one Project and a date range, a
 * summary per Labour (present, half day, absent, leave, paid leave,
 * holiday, overtime hours) and every marked day with its status, check-in,
 * check-out, hours worked (ADR CM-0011) and overtime. Only Labours marked
 * in the Project in the range appear.
 */
export function buildLabourAttendanceReport(input: {
  range: DateRange;
  labours: readonly ReportLabour[];
  days: readonly ReportLabourDay[];
}): ReportBody {
  const inRange = input.days.filter(
    (day) => day.date >= input.range.from && day.date <= input.range.to,
  );
  const byLabour = daysByLabour(inRange);
  const labours = input.labours
    .filter((labour) => byLabour.has(labour.id))
    .sort(byName);

  const summaryColumns = [
    column("Sl. No.", "count", 5),
    column("Labour", "text", 22),
    column("Labour Id", "text", 10),
    column("Category", "text", 14),
    column("Present", "count"),
    column("Half day", "count"),
    column("Absent", "count"),
    column("Leave", "count"),
    column("Paid leave", "count"),
    column("Holiday", "count"),
    column("OT hours", "hours"),
  ];
  const summaryRows: Cell[][] = labours.map((labour, index) => {
    const sum = tally([...(byLabour.get(labour.id)?.values() ?? [])]);
    return [
      index + 1,
      labour.name,
      labour.labourCode,
      labour.category,
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
    column("Labour", "text", 22),
    column("Labour Id", "text", 10),
    column("Status", "text", 10),
    column("Shift", "text", 9),
    column("Supervisor", "text", 16),
    column("In", "text", 6),
    column("Out", "text", 10),
    column("Worked", "hours"),
    column("OT hours", "hours"),
  ];
  const names = new Map(labours.map((labour) => [labour.id, labour]));
  const dayRows: Cell[][] = [...inRange]
    .filter((day) => names.has(day.labourId))
    .sort((a, b) => {
      const left = names.get(a.labourId);
      const right = names.get(b.labourId);
      return (
        a.date.localeCompare(b.date) ||
        (left != null && right != null ? byName(left, right) : 0)
      );
    })
    .map((day) => {
      const labour = names.get(day.labourId);
      return [
        dateLabel(day.date),
        labour?.name ?? "",
        labour?.labourCode ?? null,
        STATUS_LABEL[markOf(day)],
        day.shift,
        day.supervisor,
        day.checkIn,
        checkOutLabel(day),
        workedOf(day),
        hours(day.overtimeHundredths),
      ];
    });

  return {
    title: "All Labour Attendance Report",
    notes: [
      `${String(labours.length)} Labours marked in this Project in the period.`,
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
