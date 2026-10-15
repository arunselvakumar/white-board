import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  column,
  type Cell,
  type ReportBody,
  type ReportColumn,
  type ReportTable,
} from "./report-document";
import { dateLabel } from "./report-period";

/**
 * The tracking reports (CM-805, ADR CM-0019 §14): Task Report, Issue &
 * Snag Report and Inspection Request Report, as Excel and PDF tables. The
 * source (`src/composition/tracking-report-source.ts`) applies tracking's
 * rules — derived status, roll-ups, variance — and hands over printable
 * words; these builders only lay them out.
 */

const day = (date: CalendarDate | null): string | null =>
  date == null ? null : dateLabel(date);

/** A count of rows per status, in the order given. */
function statusTable(
  name: string,
  statuses: readonly string[],
  rows: readonly { status: string }[],
): ReportTable {
  const columns = [column("Status", "text", 18), column("Count", "count", 8)];
  const counted: Cell[][] = statuses.map((status) => [
    status,
    rows.filter((row) => row.status === status).length,
  ]);
  return {
    name,
    columns,
    rows: counted,
    totals: ["Total", rows.length],
  };
}

function scopeNote(own: boolean, things: string): string[] {
  return own
    ? [
        `Only the ${things} you created or are assigned to: you do not have View all.`,
      ]
    : [];
}

// ---------------------------------------------------------------------------
// Task Report
// ---------------------------------------------------------------------------

/** A task as the Task Report prints it, in tree order. */
export type TaskReportRow = {
  /** "T-12". */
  label: string;
  name: string;
  /** 1 = top level, 3 = deepest. */
  level: number;
  /** Has sub-tasks: its dates, price and progress roll up. */
  isSummary: boolean;
  assignees: readonly string[];
  plannedStart: CalendarDate | null;
  plannedDue: CalendarDate | null;
  baselineStart: CalendarDate | null;
  baselineEnd: CalendarDate | null;
  actualStart: CalendarDate | null;
  actualEnd: CalendarDate | null;
  /** Days, positive is late; null without a baseline. */
  variance: number | null;
  /** 0–100. */
  progressPct: number;
  /** "Not Started", "In Progress", "Delayed", "Completed". */
  status: string;
  location: string | null;
  department: string | null;
  contractor: string | null;
  /** Paise; null without a price (and always without Financial). */
  totalPrice: number | null;
  completedPrice: number | null;
};

export const TASK_REPORT_STATUSES = [
  "Not Started",
  "In Progress",
  "Delayed",
  "Completed",
] as const;

/**
 * Task Report (CM-805): every task added in the period in tree order, with
 * its level, assignees, planned / baseline / actual dates, variance,
 * progress, status, location, department and contractor; Total and
 * Completed Price with Task Financial. The price totals count leaf tasks
 * only (a summary's price is its leaves').
 */
export function buildTaskReport(input: {
  tasks: readonly TaskReportRow[];
  financial: boolean;
  own: boolean;
  /** The Company's today: status and variance are as on it. */
  today: CalendarDate;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Task No.", "text", 7),
    column("Task", "text", 26),
    column("Level", "count", 5),
    column("Assignees", "text", 18),
    column("Start Date", "text", 11),
    column("Due Date", "text", 11),
    column("Baseline Start", "text", 11),
    column("Baseline End", "text", 11),
    column("Actual Start", "text", 11),
    column("Actual End", "text", 11),
    column("Variance (days)", "count", 8),
    column("Progress %", "percent", 8),
    column("Status", "text", 11),
    column("Location", "text", 16),
    column("Department", "text", 13),
    column("Contractor", "text", 15),
  ];
  if (input.financial)
    columns.push(
      column("Total Price", "money"),
      column("Completed Price", "money"),
    );
  const rows: Cell[][] = input.tasks.map((task) => {
    const row: Cell[] = [
      task.label,
      `${"  ".repeat(Math.max(0, task.level - 1))}${task.name}`,
      task.level,
      task.assignees.length === 0 ? null : task.assignees.join(", "),
      day(task.plannedStart),
      day(task.plannedDue),
      day(task.baselineStart),
      day(task.baselineEnd),
      day(task.actualStart),
      day(task.actualEnd),
      task.variance,
      task.progressPct,
      task.status,
      task.location,
      task.department,
      task.contractor,
    ];
    if (input.financial) row.push(task.totalPrice, task.completedPrice);
    return row;
  });
  const leaves = input.tasks.filter((task) => !task.isSummary);
  const sum = (pick: (task: TaskReportRow) => number | null) => {
    const priced = leaves.flatMap((task) => pick(task) ?? []);
    return priced.length === 0
      ? null
      : priced.reduce((total, value) => total + value, 0);
  };
  const totals: Cell[] = columns.map(() => null);
  totals[0] = "Total";
  totals[1] = `${String(input.tasks.length)} ${input.tasks.length === 1 ? "task" : "tasks"}`;
  if (input.financial) {
    totals[columns.length - 2] = sum((task) => task.totalPrice);
    totals[columns.length - 1] = sum((task) => task.completedPrice);
  }
  return {
    title: "Task Report",
    notes: [
      "Tasks added in the period, in the order of the task tree; sub-tasks are indented under their task.",
      `Status and variance are as on ${dateLabel(input.today)}. Variance is the actual end (or the forecast end while open) against the baseline end; positive is late.`,
      "A summary task's dates, progress and prices roll up from its sub-tasks; the price totals count each priced leaf task once.",
      ...scopeNote(input.own, "tasks"),
      ...(input.financial
        ? []
        : ["Prices are left out: they need Financial on Task."]),
    ],
    tables: [
      { name: "Tasks", columns, rows, totals },
      statusTable("By status", TASK_REPORT_STATUSES, input.tasks),
    ],
  };
}

// ---------------------------------------------------------------------------
// Issue & Snag Report
// ---------------------------------------------------------------------------

export type IssueReportRow = {
  number: string;
  issueDate: CalendarDate;
  details: string;
  /** "High", "Medium", "Low" or null. */
  priority: string | null;
  category: string | null;
  department: string | null;
  contractor: string | null;
  assignee: string | null;
  dueDate: CalendarDate | null;
  location: string | null;
  /** "Pending", "Delayed", "Solved", "Closed". */
  status: string;
  /** In the Company's time zone. */
  solvedOn: CalendarDate | null;
  solvedBy: string | null;
  closedOn: CalendarDate | null;
};

export const ISSUE_REPORT_STATUSES = [
  "Pending",
  "Delayed",
  "Solved",
  "Closed",
] as const;

/**
 * Issue & Snag Report (CM-805): the issues of the period by Issue Date,
 * with number, date, details, priority, category, department, contractor,
 * assignee, due date, location, status (Delayed derived), solved on / by
 * and closed on.
 */
export function buildIssueSnagReport(input: {
  issues: readonly IssueReportRow[];
  own: boolean;
  today: CalendarDate;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Number", "text", 14),
    column("Issue Date", "text", 11),
    column("Details", "text", 30),
    column("Priority", "text", 8),
    column("Category", "text", 12),
    column("Department", "text", 12),
    column("Contractor", "text", 14),
    column("Assigned To", "text", 14),
    column("Due Date", "text", 11),
    column("Location", "text", 15),
    column("Status", "text", 9),
    column("Solved On", "text", 11),
    column("Solved By", "text", 13),
    column("Closed On", "text", 11),
  ];
  const issues = [...input.issues].sort(
    (a, b) =>
      a.issueDate.localeCompare(b.issueDate) ||
      a.number.localeCompare(b.number),
  );
  const rows: Cell[][] = issues.map((issue) => [
    issue.number,
    dateLabel(issue.issueDate),
    issue.details,
    issue.priority,
    issue.category,
    issue.department,
    issue.contractor,
    issue.assignee,
    day(issue.dueDate),
    issue.location,
    issue.status,
    day(issue.solvedOn),
    issue.solvedBy,
    day(issue.closedOn),
  ]);
  return {
    title: "Issue & Snag Report",
    notes: [
      "Issues and snags with an Issue Date in the period, oldest first.",
      `Status is as on ${dateLabel(input.today)}: an open issue past its Due Date is Delayed.`,
      ...scopeNote(input.own, "issues"),
    ],
    tables: [
      {
        name: "Issues & Snags",
        columns,
        rows,
        totals: columns.map((_, index) =>
          index === 0
            ? "Total"
            : index === 2
              ? `${String(rows.length)} ${rows.length === 1 ? "issue" : "issues"}`
              : null,
        ),
      },
      statusTable("By status", ISSUE_REPORT_STATUSES, issues),
    ],
  };
}

// ---------------------------------------------------------------------------
// Inspection Request Report
// ---------------------------------------------------------------------------

export type InspectionReportRow = {
  number: string;
  inspectionDate: CalendarDate;
  /** "HH:MM" or null. */
  inspectionTime: string | null;
  department: string | null;
  contractor: string | null;
  inspector: string | null;
  description: string;
  location: string | null;
  /** "Pending for approval", "Approved", "Rejected". */
  status: string;
  decidedBy: string | null;
  /** In the Company's time zone. */
  decidedOn: CalendarDate | null;
  reason: string | null;
  /** The number of the rejected request this one re-inspects. */
  reinspectionOf: string | null;
};

export const INSPECTION_REPORT_STATUSES = [
  "Pending for approval",
  "Approved",
  "Rejected",
] as const;

/**
 * Inspection Request Report (CM-805): the requests of the period by
 * Inspection Date, with number, date and time, department, contractor,
 * inspector, description, location, status, decided by / on, reason and
 * the request it re-inspects; the Success Rate under it.
 */
export function buildInspectionRequestReport(input: {
  inspections: readonly InspectionReportRow[];
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Request No", "text", 15),
    column("Date", "text", 11),
    column("Time", "text", 6),
    column("Department", "text", 12),
    column("Contractor", "text", 14),
    column("Inspector", "text", 14),
    column("Description of work", "text", 28),
    column("Location", "text", 15),
    column("Status", "text", 12),
    column("Decided By", "text", 13),
    column("Decided On", "text", 11),
    column("Reason", "text", 20),
    column("Re-inspection of", "text", 15),
  ];
  const inspections = [...input.inspections].sort(
    (a, b) =>
      a.inspectionDate.localeCompare(b.inspectionDate) ||
      (a.inspectionTime ?? "").localeCompare(b.inspectionTime ?? "") ||
      a.number.localeCompare(b.number),
  );
  const rows: Cell[][] = inspections.map((inspection) => [
    inspection.number,
    dateLabel(inspection.inspectionDate),
    inspection.inspectionTime,
    inspection.department,
    inspection.contractor,
    inspection.inspector,
    inspection.description,
    inspection.location,
    inspection.status,
    inspection.decidedBy,
    day(inspection.decidedOn),
    inspection.reason,
    inspection.reinspectionOf,
  ]);
  const approved = inspections.filter(
    (row) => row.status === "Approved",
  ).length;
  const rejected = inspections.filter(
    (row) => row.status === "Rejected",
  ).length;
  const decided = approved + rejected;
  return {
    title: "Inspection Request Report",
    notes: [
      "Inspection Requests with an Inspection Date in the period, oldest first.",
      decided === 0
        ? "Success Rate: — (no request was approved or rejected)."
        : `Success Rate: ${String(Math.round((approved / decided) * 10000) / 100)}% (approved of ${String(decided)} decided).`,
    ],
    tables: [
      {
        name: "Inspection Requests",
        columns,
        rows,
        totals: columns.map((_, index) =>
          index === 0
            ? "Total"
            : index === 6
              ? `${String(rows.length)} ${rows.length === 1 ? "request" : "requests"}`
              : null,
        ),
      },
      statusTable("By status", INSPECTION_REPORT_STATUSES, inspections),
    ],
  };
}
