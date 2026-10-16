import {
  byName,
  hours,
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
} from "./report-document";
import type { DateRange } from "./report-period";

const COVERS = {
  all: "Covers every Project of the Company.",
  assigned: "Covers the Projects you may see: the Projects you are on.",
  chosen: "Covers the Projects you chose (those you may see).",
} as const;

/** A marked day and the Project it was marked in. */
export type ReportProjectLabourDay = ReportLabourDay & { projectId: string };

export type ReportProject = { id: string; name: string };

/**
 * Central Labour Attendance (CM-903, ADR CM-0021 §5): every Project's
 * labour days in the range, one row per Project and Labour like the
 * Project's All Labour Attendance summary (present, half day, absent,
 * leave, paid leave, holiday, overtime hours), and each Project's totals.
 * Only Labours marked in a Project in the range appear under it; a Labour
 * who worked at two Projects has a row at each.
 */
export function buildCentralLabourAttendanceReport(input: {
  range: DateRange;
  projects: readonly ReportProject[];
  labours: readonly ReportLabour[];
  days: readonly ReportProjectLabourDay[];
  /**
   * Every Project of the Company (the Owner), the Projects the member is
   * on, or the Projects the requester chose.
   */
  covers: "all" | "assigned" | "chosen";
}): ReportBody {
  const inRange = input.days.filter(
    (day) => day.date >= input.range.from && day.date <= input.range.to,
  );
  const laboursById = new Map(
    input.labours.map((labour) => [labour.id, labour]),
  );
  const projects = [...input.projects].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }),
  );
  const daysOf = new Map<string, Map<string, ReportLabourDay[]>>();
  for (const day of inRange) {
    if (!laboursById.has(day.labourId)) continue;
    const project = daysOf.get(day.projectId) ?? new Map();
    const list = project.get(day.labourId) ?? [];
    list.push(day);
    project.set(day.labourId, list);
    daysOf.set(day.projectId, project);
  }

  const columns = [
    column("Project", "text", 18),
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
  const projectColumns = [
    column("Project", "text", 18),
    column("Labours", "count"),
    ...columns.slice(4),
  ];
  const rows: Cell[][] = [];
  const projectRows: Cell[][] = [];
  for (const project of projects) {
    const byLabour = daysOf.get(project.id);
    if (byLabour == null) continue;
    const labours = [...byLabour.keys()]
      .flatMap((id) => laboursById.get(id) ?? [])
      .sort(byName);
    for (const labour of labours) {
      const sum = tally(byLabour.get(labour.id) ?? []);
      rows.push([
        project.name,
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
      ]);
    }
    const all = tally([...byLabour.values()].flat());
    projectRows.push([
      project.name,
      labours.length,
      all.present,
      all.halfDay,
      all.absent,
      all.leave,
      all.paidLeave,
      all.holiday,
      hours(all.overtimeHundredths),
    ]);
  }
  return {
    title: "Central Labour Attendance Report",
    notes: [
      COVERS[input.covers],
      `${String(projectRows.length)} ${projectRows.length === 1 ? "Project" : "Projects"} with labour marked in the period. A Labour marked at two Projects has a row at each.`,
      MARK_LEGEND,
    ],
    tables: [
      {
        name: "By Labour",
        columns,
        rows,
        totals: totalsOf(columns, rows, {
          0: "Total",
          1: `${String(rows.length)} ${rows.length === 1 ? "row" : "rows"}`,
        }),
      },
      {
        name: "By Project",
        columns: projectColumns,
        rows: projectRows,
        totals: totalsOf(projectColumns, projectRows, { 0: "Total" }),
      },
    ],
  };
}
