import type {
  DprDocument,
  DprImageRef,
  DprSection,
} from "./daily-progress-report";
import { rangeLabel, type DateRange } from "./report-period";

/**
 * The Task Progress Report (CM-805, ADR CM-0019 §14): a PDF per Project
 * for a period, grouped by location, with each leaf task's progress at the
 * start and at the end of the period and the work done in it. It is laid
 * out like the Daily Progress Report and printed by the same writer (Noto
 * text, running header, page numbers).
 */

/** A leaf task's progress over the period, as the source works it out. */
export type TaskProgressLine = {
  /** "T-12". */
  label: string;
  name: string;
  /** The task's main location as a label; null without one. */
  location: string | null;
  /** Quantity tasks take work done; percent tasks a new percentage. */
  kind: "quantity" | "percent";
  /** The task's Measurement Unit (quantity tasks). */
  unit: string | null;
  /** Total work as decimal text (quantity tasks). */
  totalWork: string | null;
  /** Progress at the end of the day before the period, 0–100. */
  startPct: number;
  /** Progress at the end of the period's last day, 0–100. */
  endPct: number;
  /**
   * Quantity tasks: the work of the updates dated in the period, as
   * decimal text (worksheet updates included). Null for percent tasks.
   */
  workDone: string | null;
  /** Progress updates dated in the period. */
  updates: number;
  /** Of those, posted by Daily Worksheets (CM-0019 §6). */
  worksheetUpdates: number;
};

export type TaskProgressReadModel = {
  company: string;
  project: { name: string; address: string | null };
  /** The Project logo, when "Use Project logo on reports" is on. */
  logo: DprImageRef | null;
  range: DateRange;
  tasks: TaskProgressLine[];
};

/** "Not located" groups print last. */
export const NO_LOCATION = "No location";

function percent(value: number): string {
  return `${String(Math.round(value * 100) / 100)}%`;
}

function quantity(value: string, unit: string | null): string {
  const trimmed = value.includes(".") ? value.replace(/\.?0+$/, "") : value;
  return unit == null ? trimmed : `${trimmed} ${unit}`;
}

/** What the period did to the task, in its own terms. */
function workDoneText(task: TaskProgressLine): string {
  if (task.kind === "quantity")
    return task.workDone == null ? "—" : quantity(task.workDone, task.unit);
  const change = Math.round((task.endPct - task.startPct) * 100) / 100;
  if (change === 0) return "—";
  return `${change > 0 ? "+" : ""}${String(change)} pts`;
}

function updatesText(task: TaskProgressLine): string {
  if (task.updates === 0) return "—";
  return task.worksheetUpdates === 0
    ? String(task.updates)
    : `${String(task.updates)} (${String(task.worksheetUpdates)} from worksheets)`;
}

/**
 * Lays the read model out: the period and totals under the header, then
 * one section per location (by name, tasks without one last), each task by
 * Task No.
 */
export function buildTaskProgressReport(
  model: TaskProgressReadModel,
): DprDocument {
  const period = rangeLabel(model.range);
  const groups = new Map<string, TaskProgressLine[]>();
  for (const task of model.tasks) {
    const key = task.location ?? NO_LOCATION;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const names = [...groups.keys()].sort((a, b) =>
    a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b),
  );
  const taskNo = (label: string) => Number(label.replace(/\D/g, "")) || 0;
  const completed = model.tasks.filter(
    (task) => task.startPct < 100 && task.endPct >= 100,
  ).length;
  const moved = model.tasks.filter((task) => task.updates > 0).length;

  const sections: DprSection[] =
    model.tasks.length === 0
      ? [
          {
            title: "Tasks",
            blocks: [
              {
                type: "text",
                text: "No task was planned for this period or had progress in it.",
                muted: true,
              },
            ],
          },
        ]
      : names.map((name) => ({
          title: name,
          blocks: [
            {
              type: "table",
              columns: [
                { label: "Task No.", width: 7 },
                { label: "Task", width: 26 },
                { label: "Total work", width: 11, align: "right" },
                { label: "At start", width: 8, align: "right" },
                { label: "At end", width: 8, align: "right" },
                { label: "Work done in the period", width: 13, align: "right" },
                { label: "Updates", width: 12, align: "right" },
              ],
              rows: [...(groups.get(name) ?? [])]
                .sort((a, b) => taskNo(a.label) - taskNo(b.label))
                .map((task) => [
                  task.label,
                  task.name,
                  task.kind === "quantity" && task.totalWork != null
                    ? quantity(task.totalWork, task.unit)
                    : "Percent",
                  percent(task.startPct),
                  percent(task.endPct),
                  workDoneText(task),
                  updatesText(task),
                ]),
            },
          ],
        }));

  return {
    title: "Task Progress Report",
    header: {
      company: model.company,
      project: model.project.name,
      address: model.project.address,
      number: "",
      date: period,
      filledBy: "",
      logo: model.logo,
      facts: [
        ["Period", period],
        ["Tasks", String(model.tasks.length)],
        ["With progress in the period", String(moved)],
        ["Completed in the period", String(completed)],
      ],
      reference: period,
    },
    sections: [
      ...sections,
      {
        title: "Notes",
        blocks: [
          {
            type: "text",
            muted: true,
            text: "Leaf tasks planned to run in the period or with progress recorded in it. At start is the progress at the end of the day before the period; At end, at the end of its last day. Work done counts the updates dated in the period, those posted by Daily Worksheets included; a percent task shows the change in percentage points.",
          },
        ],
      },
    ],
  };
}
