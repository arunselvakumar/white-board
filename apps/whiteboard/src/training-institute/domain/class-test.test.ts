import { describe, expect, it } from "vitest";

import {
  assertMaxCoversMarks,
  assertPublishable,
  assertTestDate,
  formatMarks,
  passed,
  sameResult,
  testDetails,
  testResult,
  testStats,
  wasInBatchOn,
} from "./class-test";

function codeOf(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function messageOf(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
}

describe("Test details", () => {
  it("trims the name and topic and keeps an optional pass mark", () => {
    expect(
      testDetails({
        name: " Weekly test 3 ",
        heldOn: "2026-10-05",
        maxMarks: 50,
        topic: "  ",
      }),
    ).toEqual({
      name: "Weekly test 3",
      heldOn: "2026-10-05",
      maxMarks: 50,
      passMarks: null,
      topic: null,
    });
    expect(
      testDetails({
        name: "Chapter 4",
        heldOn: "2026-10-05",
        maxMarks: 50,
        passMarks: 18,
        topic: " Fractions ",
      }),
    ).toMatchObject({ passMarks: 18, topic: "Fractions" });
  });

  it("needs a name, a date, and a whole maximum from 1 to 1000", () => {
    const base = { name: "Test", heldOn: "2026-10-05", maxMarks: 50 };
    expect(codeOf(() => testDetails({ ...base, name: " " }))).toBe(
      "CLASS_TEST_NAME_INVALID",
    );
    expect(codeOf(() => testDetails({ ...base, heldOn: "2026-02-30" }))).toBe(
      "CLASS_TEST_DATE_INVALID",
    );
    for (const maxMarks of [0, 1001, 12.5])
      expect(codeOf(() => testDetails({ ...base, maxMarks }))).toBe(
        "CLASS_TEST_MAX_MARKS_INVALID",
      );
  });

  it("keeps the pass mark between 0 and the maximum", () => {
    const base = { name: "Test", heldOn: "2026-10-05", maxMarks: 50 };
    expect(codeOf(() => testDetails({ ...base, passMarks: 51 }))).toBe(
      "CLASS_TEST_PASS_MARKS_INVALID",
    );
    expect(codeOf(() => testDetails({ ...base, passMarks: -1 }))).toBe(
      "CLASS_TEST_PASS_MARKS_INVALID",
    );
    expect(testDetails({ ...base, passMarks: 50 }).passMarks).toBe(50);
  });
});

describe("Test date", () => {
  const range = { firstDate: "2026-09-01", today: "2026-10-08" };

  it("is from the day the Batch began through today", () => {
    expect(() => {
      assertTestDate("2026-09-01", range);
    }).not.toThrow();
    expect(() => {
      assertTestDate("2026-10-08", range);
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertTestDate("2026-10-09", range);
      }),
    ).toBe("CLASS_TEST_DATE_IN_FUTURE");
    expect(
      codeOf(() => {
        assertTestDate("2026-08-31", range);
      }),
    ).toBe("CLASS_TEST_DATE_BEFORE_BATCH");
  });
});

describe("Test result", () => {
  it("is scored with marks from 0 to the maximum, half marks allowed", () => {
    expect(testResult({ status: "scored", marks: 37.5 }, 50, "Asha")).toEqual({
      status: "scored",
      marks: 37.5,
      remark: null,
    });
    expect(testResult({ status: "scored", marks: 0 }, 50, "Asha").marks).toBe(
      0,
    );
    expect(testResult({ status: "scored", marks: 50 }, 50, "Asha").marks).toBe(
      50,
    );
  });

  it("rejects marks below zero or over the maximum with the Student's name", () => {
    expect(
      codeOf(() => testResult({ status: "scored", marks: 51 }, 50, "Asha")),
    ).toBe("CLASS_TEST_MARKS_OUT_OF_RANGE");
    expect(
      messageOf(() => testResult({ status: "scored", marks: -1 }, 50, "Asha")),
    ).toBe("Marks for Asha must be from 0 to 50.");
    expect(
      codeOf(() => testResult({ status: "scored", marks: 37.25 }, 50, "Asha")),
    ).toBe("CLASS_TEST_MARKS_STEP");
    expect(codeOf(() => testResult({ status: "scored" }, 50, "Asha"))).toBe(
      "CLASS_TEST_MARKS_REQUIRED",
    );
  });

  it("gives absent and exempt results no marks", () => {
    expect(
      testResult({ status: "absent", remark: " Was ill " }, 50, "Asha"),
    ).toEqual({ status: "absent", marks: null, remark: "Was ill" });
    expect(
      codeOf(() => testResult({ status: "exempt", marks: 10 }, 50, "Asha")),
    ).toBe("CLASS_TEST_MARKS_NOT_ALLOWED");
  });

  it("limits the remark to 500 characters", () => {
    expect(
      codeOf(() =>
        testResult({ status: "absent", remark: "x".repeat(501) }, 50, "Asha"),
      ),
    ).toBe("CLASS_TEST_REMARK_TOO_LONG");
  });

  it("knows when a result changed", () => {
    const before = { status: "scored", marks: 34, remark: null } as const;
    expect(sameResult(before, { ...before })).toBe(true);
    expect(sameResult(before, { ...before, marks: 38 })).toBe(false);
    expect(sameResult(before, { ...before, remark: "Good" })).toBe(false);
  });
});

describe("Pass or fail", () => {
  it("compares a scored mark with the pass mark", () => {
    expect(passed({ status: "scored", marks: 18 }, 18)).toBe(true);
    expect(passed({ status: "scored", marks: 17.5 }, 18)).toBe(false);
  });

  it("is not shown without a pass mark or a score", () => {
    expect(passed({ status: "scored", marks: 10 }, null)).toBeNull();
    expect(passed({ status: "absent", marks: null }, 18)).toBeNull();
  });
});

describe("Who is on a Test", () => {
  it("lists Students in the Batch on the Test date, the day they left included", () => {
    const spans = [{ start: "2026-09-10", end: "2026-10-01" }];
    expect(wasInBatchOn(spans, "2026-09-09")).toBe(false);
    expect(wasInBatchOn(spans, "2026-09-10")).toBe(true);
    expect(wasInBatchOn(spans, "2026-10-01")).toBe(true);
    expect(wasInBatchOn(spans, "2026-10-02")).toBe(false);
    expect(
      wasInBatchOn([{ start: "2026-09-10", end: null }], "2026-12-01"),
    ).toBe(true);
    expect(wasInBatchOn([], "2026-10-01")).toBe(false);
  });
});

describe("Publishing", () => {
  it("needs a result for every listed Student", () => {
    expect(() => {
      assertPublishable([
        { name: "Asha", hasResult: true },
        { name: "Ravi", hasResult: true },
      ]);
    }).not.toThrow();
    expect(
      messageOf(() => {
        assertPublishable([
          { name: "Asha", hasResult: true },
          { name: "Ravi", hasResult: false },
        ]);
      }),
    ).toBe("Enter a result for Ravi before publishing.");
    expect(
      codeOf(() => {
        assertPublishable([]);
      }),
    ).toBe("CLASS_TEST_NOBODY_LISTED");
  });

  it("names the first five blank Students", () => {
    const listed = ["A", "B", "C", "D", "E", "F", "G"].map((name) => ({
      name,
      hasResult: false,
    }));
    expect(
      messageOf(() => {
        assertPublishable(listed);
      }),
    ).toBe("Enter a result for A, B, C, D, E and 2 more before publishing.");
  });
});

describe("Test numbers", () => {
  it("count scored results only", () => {
    expect(
      testStats([
        { status: "scored", marks: 34 },
        { status: "scored", marks: 41.5 },
        { status: "scored", marks: 20 },
        { status: "absent", marks: null },
        { status: "exempt", marks: null },
      ]),
    ).toEqual({
      tested: 3,
      absent: 1,
      exempt: 1,
      average: 31.8,
      highest: 41.5,
      lowest: 20,
    });
  });

  it("have no average when nobody scored", () => {
    expect(testStats([{ status: "absent", marks: null }])).toMatchObject({
      tested: 0,
      average: null,
      highest: null,
      lowest: null,
    });
  });

  it("refuse a maximum below a mark already entered", () => {
    expect(
      codeOf(() => {
        assertMaxCoversMarks(40, 41.5);
      }),
    ).toBe("CLASS_TEST_MAX_BELOW_MARKS");
    expect(() => {
      assertMaxCoversMarks(50, 41.5);
    }).not.toThrow();
    expect(() => {
      assertMaxCoversMarks(50, null);
    }).not.toThrow();
  });

  it("show half marks with one decimal", () => {
    expect(formatMarks(38)).toBe("38");
    expect(formatMarks(37.5)).toBe("37.5");
  });
});
