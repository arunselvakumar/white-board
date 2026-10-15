import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  baselineDuration,
  baselineVariance,
  completionEntry,
  dateSpan,
  earnedValue,
  FULL_PCT,
  leafProgress,
  parsePercent,
  parseQuantity,
  percentFromDb,
  percentText,
  plannedDays,
  projectProgress,
  quantityFromDb,
  quantityPct,
  quantityText,
  rollUp,
  taskStatus,
  type ProgressEntry,
  type RollupLeaf,
} from "./task-progress";

const TODAY = "2026-10-14";

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("expected a DomainError");
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));

function qty(progressDate: string, work: string, minute = 0): ProgressEntry {
  return {
    progressDate,
    createdAt: at(minute),
    workMilli: parseQuantity(work, "workQty"),
    pct: null,
  };
}

function pct(progressDate: string, value: number, minute = 0): ProgressEntry {
  return {
    progressDate,
    createdAt: at(minute),
    workMilli: null,
    pct: value * 100,
  };
}

describe("taskStatus", () => {
  it.each([
    [{ progressPct: 0, dueDate: null }, "not_started"],
    [{ progressPct: 0, dueDate: TODAY }, "not_started"],
    [{ progressPct: 0, dueDate: "2026-10-13" }, "delayed"],
    [{ progressPct: 1, dueDate: "2026-10-15" }, "in_progress"],
    [{ progressPct: 5000, dueDate: "2026-10-13" }, "delayed"],
    [{ progressPct: 9999, dueDate: null }, "in_progress"],
    [{ progressPct: FULL_PCT, dueDate: "2026-01-01" }, "completed"],
    [{ progressPct: FULL_PCT, dueDate: null }, "completed"],
  ] as const)("%o is %s", (task, status) => {
    expect(taskStatus(task, TODAY)).toBe(status);
  });
});

describe("numbers", () => {
  it("reads percentages as hundredths", () => {
    expect(parsePercent("12.5")).toBe(1250);
    expect(parsePercent(100)).toBe(FULL_PCT);
    expect(parsePercent("0")).toBe(0);
    expect(code(() => parsePercent("100.01"))).toBe("PROGRESS_PERCENT_INVALID");
    expect(code(() => parsePercent("-1"))).toBe("PROGRESS_PERCENT_INVALID");
    expect(code(() => parsePercent("1.234"))).toBe("PROGRESS_PERCENT_INVALID");
    expect(code(() => parsePercent("abc"))).toBe("PROGRESS_PERCENT_INVALID");
    expect(percentText(1250)).toBe("12.50");
    expect(percentFromDb("33.33")).toBe(3333);
  });

  it("reads quantities as thousandths", () => {
    expect(parseQuantity("12.5", "q")).toBe(12_500n);
    expect(parseQuantity(3, "q")).toBe(3000n);
    expect(code(() => parseQuantity("0", "q"))).toBe("QUANTITY_INVALID");
    expect(code(() => parseQuantity("1.2345", "q"))).toBe("QUANTITY_INVALID");
    expect(code(() => parseQuantity("100000000000", "q"))).toBe(
      "QUANTITY_INVALID",
    );
    expect(quantityText(12_500n)).toBe("12.5");
    expect(quantityText(12_000n)).toBe("12");
    expect(quantityText(5n)).toBe("0.005");
    expect(quantityFromDb("4.250")).toBe(4250n);
  });
});

describe("progress of a leaf task", () => {
  it("sums quantity increments and caps at 100 %", () => {
    expect(quantityPct(250n, 1000n)).toBe(2500);
    expect(quantityPct(999_999n, 1_000_000n)).toBe(9999);
    expect(quantityPct(1500n, 1000n)).toBe(FULL_PCT);
    const result = leafProgress({ totalWorkMilli: 100_000n }, [
      qty("2026-10-03", "40", 2),
      qty("2026-10-01", "25", 1),
    ]);
    expect(result).toEqual({
      completedMilli: 65_000n,
      pct: 6500,
      actualStart: "2026-10-01",
      actualEnd: null,
    });
  });

  it("ends a quantity task on the update that reached the total, overruns included", () => {
    const result = leafProgress({ totalWorkMilli: 100_000n }, [
      qty("2026-10-01", "60"),
      qty("2026-10-05", "50"),
      qty("2026-10-07", "10"),
    ]);
    expect(result).toMatchObject({
      completedMilli: 120_000n,
      pct: FULL_PCT,
      actualStart: "2026-10-01",
      actualEnd: "2026-10-05",
    });
  });

  it("takes a percent task's latest percentage and reopens it below 100 %", () => {
    const done = leafProgress({ totalWorkMilli: null }, [
      pct("2026-10-01", 30),
      pct("2026-10-04", 100),
      pct("2026-10-06", 100),
    ]);
    expect(done).toMatchObject({ pct: FULL_PCT, actualEnd: "2026-10-04" });
    const reopened = leafProgress({ totalWorkMilli: null }, [
      pct("2026-10-01", 30),
      pct("2026-10-04", 100),
      pct("2026-10-06", 80),
    ]);
    expect(reopened).toMatchObject({
      completedMilli: 0n,
      pct: 8000,
      actualStart: "2026-10-01",
      actualEnd: null,
    });
  });

  it("orders same-day updates by when they were entered", () => {
    const result = leafProgress({ totalWorkMilli: null }, [
      pct("2026-10-04", 70, 5),
      pct("2026-10-04", 40, 9),
    ]);
    expect(result.pct).toBe(4000);
  });

  it("has nothing before the first update", () => {
    expect(leafProgress({ totalWorkMilli: 5000n }, [])).toEqual({
      completedMilli: 0n,
      pct: 0,
      actualStart: null,
      actualEnd: null,
    });
  });

  it("completes with the remaining quantity or 100 %", () => {
    expect(
      completionEntry(
        { totalWorkMilli: 10_000n },
        { completedMilli: 2_500n, pct: 2500 },
      ),
    ).toEqual({ workMilli: 7_500n, pct: null });
    expect(
      completionEntry(
        { totalWorkMilli: null },
        { completedMilli: 0n, pct: 10 },
      ),
    ).toEqual({ workMilli: null, pct: FULL_PCT });
    expect(
      code(() =>
        completionEntry(
          { totalWorkMilli: null },
          { completedMilli: 0n, pct: FULL_PCT },
        ),
      ),
    ).toBe("TASK_ALREADY_COMPLETED");
  });
});

describe("earned value", () => {
  it("is Total Price × progress, half up to the paisa", () => {
    expect(earnedValue(100_000n, 2500)).toBe(25_000n);
    // ₹1.01 × 50 % = 50.5 paise → 51.
    expect(earnedValue(101n, 5000)).toBe(51n);
    expect(earnedValue(333n, 3333)).toBe(111n);
    expect(earnedValue(null, 5000)).toBeNull();
    expect(earnedValue(1_000_000_000_000n, FULL_PCT)).toBe(1_000_000_000_000n);
  });
});

function leaf(extra: Partial<RollupLeaf> = {}): RollupLeaf {
  return {
    pct: 0,
    totalPrice: null,
    startDate: null,
    dueDate: null,
    ...extra,
  };
}

describe("roll-up", () => {
  it("weighs by price when every leaf has one", () => {
    const result = rollUp([
      leaf({ pct: FULL_PCT, totalPrice: 300_000n }),
      leaf({ pct: 0, totalPrice: 100_000n }),
    ]);
    expect(result).toEqual({ pct: 7500, weighting: "price" });
  });

  it("falls back to planned days when one leaf has no price; undated weighs 1", () => {
    const result = rollUp([
      leaf({
        pct: FULL_PCT,
        totalPrice: 300_000n,
        startDate: "2026-10-01",
        dueDate: "2026-10-09",
      }),
      leaf({ pct: 0 }),
    ]);
    // 9 days at 100 % and 1 at 0 % → 90 %.
    expect(result).toEqual({ pct: 9000, weighting: "duration" });
  });

  it("uses duration when the prices add up to nothing", () => {
    expect(
      rollUp([leaf({ pct: 5000, totalPrice: 0n }), leaf({ totalPrice: 0n })])
        .weighting,
    ).toBe("duration");
  });

  it("stays below 100 % until every weighed leaf is complete", () => {
    const result = rollUp([
      leaf({ pct: FULL_PCT, startDate: "2026-01-01", dueDate: "2026-12-31" }),
      leaf({ pct: 9999 }),
    ]);
    expect(result.pct).toBe(FULL_PCT - 1);
    expect(rollUp([leaf({ pct: FULL_PCT }), leaf({ pct: FULL_PCT })]).pct).toBe(
      FULL_PCT,
    );
  });

  it("gives a Project with no tasks no progress", () => {
    expect(projectProgress([])).toEqual({ pct: null, weighting: null });
    expect(projectProgress([leaf({ pct: 3333 }), leaf({ pct: 6667 })])).toEqual(
      { pct: 50, weighting: "duration" },
    );
  });

  it("spans dates", () => {
    expect(
      dateSpan(["2026-10-05", null, "2026-10-01"], ["2026-10-09", null]),
    ).toEqual({ start: "2026-10-01", end: "2026-10-09" });
    expect(dateSpan([], [])).toEqual({ start: null, end: null });
    expect(plannedDays("2026-10-01", "2026-10-01")).toBe(1);
    expect(plannedDays("2026-10-01", null)).toBeNull();
  });
});

describe("baseline", () => {
  it("counts both ends", () => {
    expect(baselineDuration("2026-10-01", "2026-10-10")).toBe(10);
    expect(baselineDuration(null, null)).toBeNull();
  });

  it("measures variance against the actual or the forecast end", () => {
    const base = { baselineEnd: "2026-10-10", actualEnd: null, dueDate: null };
    expect(baselineVariance({ ...base, actualEnd: "2026-10-12" }, TODAY)).toBe(
      2,
    );
    expect(baselineVariance({ ...base, actualEnd: "2026-10-08" }, TODAY)).toBe(
      -2,
    );
    // Open, due later than today: forecast is the due date.
    expect(baselineVariance({ ...base, dueDate: "2026-10-20" }, TODAY)).toBe(
      10,
    );
    // Open and overdue: forecast is today.
    expect(baselineVariance({ ...base, dueDate: "2026-10-09" }, TODAY)).toBe(4);
    expect(baselineVariance({ ...base, baselineEnd: null }, TODAY)).toBeNull();
  });
});
