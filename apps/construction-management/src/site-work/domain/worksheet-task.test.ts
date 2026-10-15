import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertWorksheetTask,
  worksheetPostsProgress,
  worksheetTaskPosting,
} from "./worksheet-task";

const CUM = "unit-cum";
const SHEET = { approxWorkQty: "12.500", approxWorkUnitId: CUM };

describe("worksheetTaskPosting", () => {
  it("posts when the units match, else links and says why", () => {
    expect(worksheetTaskPosting({ unitId: CUM }, SHEET)).toBe("quantity");
    expect(
      worksheetTaskPosting(
        { unitId: CUM },
        { ...SHEET, approxWorkUnitId: "sqm" },
      ),
    ).toBe("linked_unit");
    expect(worksheetTaskPosting({ unitId: null }, SHEET)).toBe(
      "linked_percent",
    );
    expect(
      worksheetTaskPosting(
        { unitId: CUM },
        { approxWorkQty: null, approxWorkUnitId: null },
      ),
    ).toBe("linked_no_quantity");
  });

  it("counts pending and approved sheets, not rejected ones or summaries", () => {
    const task = { leaf: true, unitId: CUM };
    expect(
      worksheetPostsProgress(task, { ...SHEET, approvalStatus: "pending" }),
    ).toBe(true);
    expect(
      worksheetPostsProgress(task, { ...SHEET, approvalStatus: "approved" }),
    ).toBe(true);
    expect(
      worksheetPostsProgress(task, {
        ...SHEET,
        approvalStatus: "not_required",
      }),
    ).toBe(true);
    expect(
      worksheetPostsProgress(task, { ...SHEET, approvalStatus: "rejected" }),
    ).toBe(false);
    expect(
      worksheetPostsProgress(
        { leaf: false, unitId: CUM },
        { ...SHEET, approvalStatus: "pending" },
      ),
    ).toBe(false);
    expect(
      worksheetPostsProgress(null, { ...SHEET, approvalStatus: "pending" }),
    ).toBe(false);
  });
});

describe("assertWorksheetTask", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      if (error instanceof DomainError) return error.code;
    }
    return null;
  };
  it("needs a leaf task of the Project", () => {
    const task = { id: "t", projectId: "p", leaf: true, unitId: null };
    expect(assertWorksheetTask(task, "p")).toBe(task);
    expect(code(() => assertWorksheetTask(task, "other"))).toBe(
      "WORKSHEET_TASK_NOT_FOUND",
    );
    expect(code(() => assertWorksheetTask(null, "p"))).toBe(
      "WORKSHEET_TASK_NOT_FOUND",
    );
    expect(code(() => assertWorksheetTask({ ...task, leaf: false }, "p"))).toBe(
      "WORKSHEET_TASK_IS_SUMMARY",
    );
  });
});
