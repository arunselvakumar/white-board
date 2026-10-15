import { describe, expect, it } from "vitest";

import {
  countByStatus,
  daysLate,
  mostDelayed,
  pendingIssues,
  summariseInspections,
  summariseIssues,
  valueEarnedByTask,
} from "./tracking-dashboard";

const TODAY = "2026-10-14";

describe("tracking dashboard arithmetic (CM-805)", () => {
  it("counts days late from the Due Date to today", () => {
    expect(daysLate("2026-10-10", TODAY)).toBe(4);
    expect(daysLate(TODAY, TODAY)).toBe(0);
    expect(daysLate("2026-10-20", TODAY)).toBe(0);
    expect(daysLate(null, TODAY)).toBe(0);
  });

  it("counts every status, zero included", () => {
    expect(countByStatus(["delayed", "delayed", "completed"])).toEqual({
      not_started: 0,
      in_progress: 0,
      delayed: 2,
      completed: 1,
    });
  });

  it("lists the most delayed leaf tasks, most days late first, then by Task No.", () => {
    const task = (
      taskNo: number,
      dueDate: string,
      overrides: {
        status?: "delayed" | "in_progress";
        isSummary?: boolean;
      } = {},
    ) => ({
      id: `t${String(taskNo)}`,
      taskNo,
      dueDate,
      status: overrides.status ?? ("delayed" as const),
      isSummary: overrides.isSummary ?? false,
    });
    const list = mostDelayed(
      [
        task(1, "2026-10-01", { isSummary: true }),
        task(2, "2026-10-12"),
        task(3, "2026-10-01"),
        task(4, "2026-10-12"),
        task(5, "2026-09-01", { status: "in_progress" }),
      ],
      TODAY,
      2,
    );
    expect(list.map((item) => [item.taskNo, item.daysLate])).toEqual([
      [3, 13],
      [2, 2],
    ]);
  });

  it("values the top-most counted tasks with a price, largest first, and counts the rest", () => {
    const tree: Record<string, string | null> = {
      a: null,
      a1: "a",
      b: null,
      c: null,
      d: null,
      e: null,
    };
    const task = (id: string, taskNo: number, value: bigint | null) => ({
      id,
      parentId: tree[id] ?? null,
      taskNo,
      value,
      earned: value == null ? null : value / 2n,
    });
    const result = valueEarnedByTask(
      [
        task("a", 1, 500n),
        task("a1", 2, 500n),
        task("b", 3, 900n),
        task("c", 4, null),
        task("d", 5, 100n),
        task("e", 6, 900n),
      ],
      (id) => tree[id] ?? null,
      2,
    );
    expect(result.tasks.map((item) => item.id)).toEqual(["b", "e"]);
    expect(result.more).toBe(2);
    expect(result.totals).toEqual({ value: 2400n, earned: 1200n });
  });

  it("counts a sub-task whose parent is outside the period as top-most", () => {
    const result = valueEarnedByTask(
      [{ id: "child", parentId: "old", taskNo: 7, value: 10n, earned: 5n }],
      (id) => (id === "old" ? null : null),
    );
    expect(result.tasks.map((item) => item.id)).toEqual(["child"]);
  });

  it("summarises issues by status, priority, category and assignee", () => {
    const summary = summariseIssues(
      [
        {
          status: "pending",
          priority: "high",
          categoryId: "q",
          assigneeMemberId: "m1",
          count: 2,
        },
        {
          status: "delayed",
          priority: null,
          categoryId: null,
          assigneeMemberId: "m1",
          count: 1,
        },
        {
          status: "closed",
          priority: "low",
          categoryId: "s",
          assigneeMemberId: null,
          count: 3,
        },
        {
          status: "solved",
          priority: "low",
          categoryId: "q",
          assigneeMemberId: "m2",
          count: 1,
        },
      ],
      {
        categories: new Map([
          ["q", "Quality"],
          ["s", "Safety"],
        ]),
        members: new Map([
          ["m1", "Ravi"],
          ["m2", "Anbu"],
        ]),
      },
    );
    expect(summary.total).toBe(7);
    expect(summary.byStatus).toEqual({
      pending: 2,
      delayed: 1,
      solved: 1,
      closed: 3,
    });
    expect(summary.byPriority).toEqual({ high: 2, medium: 0, low: 4, none: 1 });
    expect(summary.byCategory).toEqual([
      { categoryId: "q", name: "Quality", count: 3 },
      { categoryId: "s", name: "Safety", count: 3 },
      { categoryId: null, name: null, count: 1 },
    ]);
    expect(summary.byAssignee).toEqual([
      {
        memberId: "m1",
        name: "Ravi",
        total: 3,
        pending: 2,
        delayed: 1,
        solved: 0,
        closed: 0,
      },
      {
        memberId: "m2",
        name: "Anbu",
        total: 1,
        pending: 0,
        delayed: 0,
        solved: 1,
        closed: 0,
      },
      {
        memberId: null,
        name: null,
        total: 3,
        pending: 0,
        delayed: 0,
        solved: 0,
        closed: 3,
      },
    ]);
    expect(pendingIssues(summary.byStatus)).toBe(3);
  });

  it("summarises inspections with the success rate, null with nothing decided", () => {
    expect(
      summariseInspections(
        new Map([
          ["approved", 3],
          ["rejected", 1],
          ["pending", 2],
        ]),
      ),
    ).toEqual({
      total: 6,
      approved: 3,
      pending: 2,
      rejected: 1,
      successRate: 75,
    });
    expect(summariseInspections(new Map([["pending", 4]]))).toMatchObject({
      total: 4,
      successRate: null,
    });
  });
});
