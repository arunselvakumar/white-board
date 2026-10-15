import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  ancestorsOf,
  assertKindKept,
  childDepth,
  childrenByParent,
  descendantsOf,
  leavesOf,
  pricePaise,
  progressFields,
  rebaselineReason,
  taskFields,
  taskNoLabel,
  taskVisibility,
  treeOrder,
  type TreeNode,
} from "./task";

const TODAY = "2026-10-14";

function refusal(fn: () => unknown): { code: string; field: unknown } {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

const UNIT = "0199c4a0-0000-7000-8000-000000000001";

describe("taskFields", () => {
  it("cleans a full task", () => {
    expect(
      taskFields({
        name: "  Slab casting  ",
        description: " ",
        assigneeIds: ["A", "a", " "],
        startDate: "2026-10-01",
        dueDate: "2026-10-10",
        priority: "high",
        totalWorkQty: "120.5",
        totalWorkUnitId: UNIT.toUpperCase(),
        totalPrice: 1_250_000,
      }),
    ).toEqual({
      name: "Slab casting",
      description: null,
      assigneeIds: ["a"],
      startDate: "2026-10-01",
      dueDate: "2026-10-10",
      priority: "high",
      departmentId: null,
      contractorId: null,
      tagIds: [],
      totalWorkMilli: 120_500n,
      totalWorkUnitId: UNIT,
      totalPrice: 1_250_000n,
    });
  });

  it.each([
    [{ name: " " }, "TASK_NAME_REQUIRED", "name"],
    [{ name: "x".repeat(201) }, "TASK_NAME_TOO_LONG", "name"],
    [
      { name: "A", startDate: "2026-10-10", dueDate: "2026-10-09" },
      "TASK_DUE_BEFORE_START",
      "dueDate",
    ],
    [{ name: "A", startDate: "2026-02-30" }, "DATE_INVALID", "startDate"],
    [{ name: "A", priority: "urgent" }, "PRIORITY_INVALID", "priority"],
    [
      { name: "A", totalWorkQty: "10" },
      "TASK_UNIT_REQUIRED",
      "totalWorkUnitId",
    ],
    [
      { name: "A", totalWorkUnitId: UNIT },
      "TASK_WORK_QTY_REQUIRED",
      "totalWorkQty",
    ],
    [
      { name: "A", totalWorkQty: "0", totalWorkUnitId: UNIT },
      "TASK_WORK_QTY_INVALID",
      "totalWorkQty",
    ],
    [{ name: "A", totalPrice: -1 }, "TASK_PRICE_INVALID", "totalPrice"],
    [{ name: "A", totalPrice: 1.5 }, "TASK_PRICE_INVALID", "totalPrice"],
  ])("refuses %o with %s", (input, code, field) => {
    expect(refusal(() => taskFields(input))).toEqual({ code, field });
  });

  it("reads prices", () => {
    expect(pricePaise("1500")).toBe(1500n);
    expect(pricePaise(null)).toBeNull();
    expect(pricePaise("")).toBeNull();
  });
});

describe("the tree", () => {
  it("allows three levels", () => {
    expect(childDepth(1)).toBe(2);
    expect(childDepth(2)).toBe(3);
    expect(refusal(() => childDepth(3))).toEqual({
      code: "TASK_TOO_DEEP",
      field: "parentId",
    });
  });

  const node = (
    id: string,
    parentId: string | null,
    sortOrder: number,
  ): TreeNode => ({ id, parentId, sortOrder, taskNo: Number(id.slice(1)) });
  const nodes = [
    node("t2", null, 2),
    node("t1", null, 1),
    node("t3", "t1", 2),
    node("t4", "t1", 1),
    node("t5", "t3", 1),
  ];

  it("walks in sort order, parents before children", () => {
    expect(treeOrder(nodes).map((n) => n.id)).toEqual([
      "t1",
      "t4",
      "t3",
      "t5",
      "t2",
    ]);
    const children = childrenByParent(nodes);
    expect(descendantsOf(children, "t1").map((n) => n.id)).toEqual([
      "t4",
      "t3",
      "t5",
    ]);
    const t1 = nodes[1];
    if (t1 == null) throw new Error("t1");
    expect(leavesOf(children, t1).map((n) => n.id)).toEqual(["t4", "t5"]);
    const t5 = nodes[4];
    if (t5 == null) throw new Error("t5");
    expect(
      ancestorsOf(new Map(nodes.map((n) => [n.id, n])), t5).map((n) => n.id),
    ).toEqual(["t3", "t1"]);
  });

  it("shows a member their own and assigned tasks, ancestors as context", () => {
    const rows = nodes.map((n) => ({
      ...n,
      createdBy: n.id === "t5" ? "me" : "owner",
      assigneeIds: n.id === "t2" ? ["member-me"] : [],
    }));
    const seen = taskVisibility(rows, {
      viewAll: false,
      userId: "me",
      memberId: "member-me",
    });
    expect([...seen.own].sort()).toEqual(["t2", "t5"]);
    expect([...seen.context].sort()).toEqual(["t1", "t3"]);
    const all = taskVisibility(rows, {
      viewAll: true,
      userId: "me",
      memberId: null,
    });
    expect(all.own.size).toBe(5);
    expect(all.context.size).toBe(0);
  });

  it("refuses switching kind or unit once there is progress", () => {
    expect(() => {
      assertKindKept({ totalWorkUnitId: null }, { totalWorkUnitId: UNIT }, 0);
    }).not.toThrow();
    expect(
      refusal(() => {
        assertKindKept({ totalWorkUnitId: null }, { totalWorkUnitId: UNIT }, 2);
      }).code,
    ).toBe("TASK_HAS_PROGRESS");
    expect(
      refusal(() => {
        assertKindKept({ totalWorkUnitId: UNIT }, { totalWorkUnitId: "u2" }, 1);
      }).code,
    ).toBe("TASK_HAS_PROGRESS");
  });

  it("labels Task No.", () => {
    expect(taskNoLabel(12)).toBe("T-12");
  });
});

describe("progress updates", () => {
  it("takes an increment on a quantity task", () => {
    expect(
      progressFields(
        { totalWorkMilli: 10_000n },
        { progressDate: TODAY, workQty: "2.5", remark: " Ground floor " },
        TODAY,
      ),
    ).toEqual({
      progressDate: TODAY,
      workMilli: 2500n,
      pct: null,
      remark: "Ground floor",
    });
  });

  it("takes the new percentage on a percent task", () => {
    expect(
      progressFields(
        { totalWorkMilli: null },
        { progressDate: "2026-10-01", progressPct: 40 },
        TODAY,
      ),
    ).toMatchObject({ workMilli: null, pct: 4000 });
  });

  it.each([
    [
      { totalWorkMilli: null },
      { progressDate: "2026-10-15", progressPct: 10 },
      "PROGRESS_DATE_IN_FUTURE",
    ],
    [
      { totalWorkMilli: 1000n },
      { progressDate: TODAY, progressPct: 10 },
      "PROGRESS_WORK_QTY_REQUIRED",
    ],
    [
      { totalWorkMilli: 1000n },
      { progressDate: TODAY, workQty: "-1" },
      "PROGRESS_WORK_QTY_INVALID",
    ],
    [
      { totalWorkMilli: null },
      { progressDate: TODAY, workQty: "1" },
      "PROGRESS_PERCENT_REQUIRED",
    ],
    [
      { totalWorkMilli: null },
      { progressDate: TODAY, progressPct: 101 },
      "PROGRESS_PERCENT_INVALID",
    ],
  ])("refuses %o %o with %s", (task, input, code) => {
    expect(refusal(() => progressFields(task, input, TODAY)).code).toBe(code);
  });

  it("needs a reason to re-baseline", () => {
    expect(rebaselineReason(" Client changed the slab ")).toBe(
      "Client changed the slab",
    );
    expect(refusal(() => rebaselineReason("  ")).code).toBe(
      "REBASELINE_REASON_REQUIRED",
    );
  });
});
