import { describe, expect, it } from "vitest";

import { buildTaskProgressReport } from "./task-progress-report";
import {
  buildInspectionRequestReport,
  buildIssueSnagReport,
  buildTaskReport,
  type TaskReportRow,
} from "./tracking-reports";

const TODAY = "2026-10-14";

function task(overrides: Partial<TaskReportRow> = {}): TaskReportRow {
  return {
    label: "T-1",
    name: "Slab",
    level: 1,
    isSummary: false,
    assignees: [],
    plannedStart: "2026-10-01",
    plannedDue: "2026-10-10",
    baselineStart: "2026-10-01",
    baselineEnd: "2026-10-10",
    actualStart: null,
    actualEnd: null,
    variance: 4,
    progressPct: 0,
    status: "Delayed",
    location: null,
    department: null,
    contractor: null,
    totalPrice: 100_00,
    completedPrice: 0,
    ...overrides,
  };
}

describe("tracking report builders (CM-805)", () => {
  it("Task Report: indents sub-tasks, prices only with Financial, totals count leaves once", () => {
    const tasks = [
      task({
        label: "T-1",
        name: "Tower",
        isSummary: true,
        totalPrice: 300_00,
        completedPrice: 50_00,
        status: "In Progress",
      }),
      task({
        label: "T-2",
        name: "Columns",
        level: 2,
        totalPrice: 200_00,
        completedPrice: 50_00,
        assignees: ["Ravi", "Anbu"],
      }),
      task({ label: "T-3", name: "Slab", level: 2, totalPrice: 100_00 }),
    ];
    const body = buildTaskReport({
      tasks,
      financial: true,
      own: false,
      today: TODAY,
    });
    const [table, statuses] = body.tables;
    expect(table?.columns.at(-1)?.label).toBe("Completed Price");
    expect(table?.rows[1]?.[1]).toBe("  Columns");
    expect(table?.rows[1]?.[3]).toBe("Ravi, Anbu");
    expect(table?.totals?.slice(-2)).toEqual([300_00, 50_00]);
    expect(table?.totals?.[1]).toBe("3 tasks");
    expect(statuses?.rows).toEqual([
      ["Not Started", 0],
      ["In Progress", 1],
      ["Delayed", 2],
      ["Completed", 0],
    ]);
    expect(body.notes.join(" ")).toContain("14 Oct 2026");

    const masked = buildTaskReport({
      tasks,
      financial: false,
      own: true,
      today: TODAY,
    });
    expect(masked.tables[0]?.columns.map((c) => c.label)).not.toContain(
      "Total Price",
    );
    expect(masked.notes).toContain(
      "Prices are left out: they need Financial on Task.",
    );
    expect(masked.notes.some((note) => note.startsWith("Only the tasks"))).toBe(
      true,
    );
  });

  it("Issue & Snag Report: oldest first, with a count by status", () => {
    const issue = {
      details: "Crack",
      priority: null,
      category: null,
      department: null,
      contractor: null,
      assignee: null,
      dueDate: null,
      location: null,
      solvedOn: null,
      solvedBy: null,
      closedOn: null,
    };
    const body = buildIssueSnagReport({
      issues: [
        {
          ...issue,
          number: "ISS/2",
          issueDate: "2026-10-05",
          status: "Pending",
        },
        {
          ...issue,
          number: "ISS/1",
          issueDate: "2026-10-01",
          status: "Closed",
        },
      ],
      own: false,
      today: TODAY,
    });
    expect(body.tables[0]?.rows.map((row) => row[0])).toEqual([
      "ISS/1",
      "ISS/2",
    ]);
    expect(body.tables[1]?.rows).toEqual([
      ["Pending", 1],
      ["Delayed", 0],
      ["Solved", 0],
      ["Closed", 1],
    ]);
  });

  it("Inspection Request Report: the Success Rate note, — with none decided", () => {
    const inspection = {
      inspectionDate: "2026-10-02",
      inspectionTime: null,
      department: null,
      contractor: null,
      inspector: null,
      description: "Slab",
      location: null,
      decidedBy: null,
      decidedOn: null,
      reason: null,
      reinspectionOf: null,
    };
    expect(
      buildInspectionRequestReport({
        inspections: [
          { ...inspection, number: "IR/1", status: "Approved" },
          { ...inspection, number: "IR/2", status: "Approved" },
          { ...inspection, number: "IR/3", status: "Rejected" },
          { ...inspection, number: "IR/4", status: "Pending for approval" },
        ],
      }).notes,
    ).toContain("Success Rate: 66.67% (approved of 3 decided).");
    expect(
      buildInspectionRequestReport({
        inspections: [
          { ...inspection, number: "IR/4", status: "Pending for approval" },
        ],
      }).notes,
    ).toContain("Success Rate: — (no request was approved or rejected).");
  });

  it("Task Progress Report: one section per location, unlocated last, work in the task's terms", () => {
    const line = {
      kind: "quantity" as const,
      unit: "cum",
      totalWork: "100",
      startPct: 20,
      endPct: 60,
      workDone: "40",
      updates: 2,
      worksheetUpdates: 1,
    };
    const document = buildTaskProgressReport({
      company: "Velan Builders",
      project: { name: "Tower A", address: null },
      logo: null,
      range: { from: "2026-10-01", to: "2026-10-14" },
      tasks: [
        { ...line, label: "T-9", name: "Lift wall", location: null },
        { ...line, label: "T-3", name: "Slab", location: "Wing B" },
        {
          ...line,
          label: "T-2",
          name: "Plaster",
          location: "Wing A",
          kind: "percent",
          unit: null,
          totalWork: null,
          workDone: null,
          startPct: 10,
          endPct: 45,
          worksheetUpdates: 0,
          updates: 1,
        },
      ],
    });
    expect(document.title).toBe("Task Progress Report");
    expect(document.header.facts).toEqual([
      ["Period", "01 Oct 2026 to 14 Oct 2026"],
      ["Tasks", "3"],
      ["With progress in the period", "3"],
      ["Completed in the period", "0"],
    ]);
    expect(document.sections.map((section) => section.title)).toEqual([
      "Wing A",
      "Wing B",
      "No location",
      "Notes",
    ]);
    const wingB = document.sections[1]?.blocks[0];
    expect(wingB?.type === "table" ? wingB.rows[0] : null).toEqual([
      "T-3",
      "Slab",
      "100 cum",
      "20%",
      "60%",
      "40 cum",
      "2 (1 from worksheets)",
    ]);
    const wingA = document.sections[0]?.blocks[0];
    expect(wingA?.type === "table" ? wingA.rows[0]?.slice(2) : null).toEqual([
      "Percent",
      "10%",
      "45%",
      "+35 pts",
      "1",
    ]);
  });

  it("Task Progress Report: says so when no task ran in the period", () => {
    const document = buildTaskProgressReport({
      company: "Velan Builders",
      project: { name: "Tower A", address: null },
      logo: null,
      range: { from: "2026-10-01", to: "2026-10-14" },
      tasks: [],
    });
    const block = document.sections[0]?.blocks[0];
    expect(block?.type === "text" ? block.text : null).toBe(
      "No task was planned for this period or had progress in it.",
    );
  });
});
