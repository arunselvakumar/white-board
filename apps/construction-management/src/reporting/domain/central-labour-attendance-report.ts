import {
  byName,
  hours,
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
 * Central Employee Attendance (CM-903, ADR CM-0021 §5): every Project's
 * labour days in the range, one row per Project and Employee like the
 * Project's Employee Attendance summary (present, half day, absent,
 * leave, paid leave, holiday, overtime hours), and each Project's totals.
 * Only Employees marked in a Project in the range appear under it; an Employee
 * who worked at two Projects has a row at each.
 */
export function buildCentralLabourAttendanceReport(input: {
  range: DateRange;
  projects: readonly ReportProject[];
  employees: readonly ReportEmployee[];
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
  const employeesById = new Map(
    input.employees.map((employee) => [employee.id, employee]),
  );
  const projects = [...input.projects].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }),
  );
  const daysOf = new Map<string, Map<string, ReportLabourDay[]>>();
  for (const day of inRange) {
    if (!employeesById.has(day.employeeId)) continue;
    const project =
      daysOf.get(day.projectId) ?? new Map<string, ReportLabourDay[]>();
    const list = project.get(day.employeeId) ?? [];
    list.push(day);
    project.set(day.employeeId, list);
    daysOf.set(day.projectId, project);
  }

  const columns = [
    column("Project", "text", 18),
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
  const projectColumns = [
    column("Project", "text", 18),
    column("Employees", "count"),
    ...columns.slice(4),
  ];
  const rows: Cell[][] = [];
  const projectRows: Cell[][] = [];
  for (const project of projects) {
    const byEmployee = daysOf.get(project.id);
    if (byEmployee == null) continue;
    const employees = [...byEmployee.keys()]
      .flatMap((id) => employeesById.get(id) ?? [])
      .sort(byName);
    for (const employee of employees) {
      const sum = tally(byEmployee.get(employee.id) ?? []);
      rows.push([
        project.name,
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
      ]);
    }
    const all = tally([...byEmployee.values()].flat());
    projectRows.push([
      project.name,
      employees.length,
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
    title: "Central Employee Attendance Report",
    notes: [
      COVERS[input.covers],
      `${String(projectRows.length)} ${projectRows.length === 1 ? "Project" : "Projects"} with Employees marked in the period. An Employee marked at two Projects has a row at each.`,
      MARK_LEGEND,
    ],
    tables: [
      {
        name: "By Employee",
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
