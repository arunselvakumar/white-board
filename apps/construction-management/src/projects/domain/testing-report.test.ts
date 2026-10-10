import { describe, expect, it } from "vitest";

import { testingItemName, testingReportDetails } from "./testing-report";

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("testing report rules (CM-409)", () => {
  it("cleans testing material names", () => {
    expect(testingItemName("  Fly  ash bricks ")).toBe("Fly ash bricks");
    expect(codeOf(() => testingItemName(""))).toBe(
      "TESTING_ITEM_NAME_REQUIRED",
    );
    expect(codeOf(() => testingItemName("x".repeat(81)))).toBe(
      "TESTING_ITEM_NAME_TOO_LONG",
    );
  });

  it("needs a name and a real date; the remark is optional", () => {
    expect(
      testingReportDetails({
        name: " 28-day cube  test ",
        reportDate: "2026-10-09",
        remark: "  ",
      }),
    ).toEqual({
      name: "28-day cube test",
      reportDate: "2026-10-09",
      remark: null,
    });
    expect(
      codeOf(() =>
        testingReportDetails({ name: "", reportDate: "2026-10-09" }),
      ),
    ).toBe("TESTING_REPORT_NAME_REQUIRED");
    expect(
      codeOf(() =>
        testingReportDetails({ name: "Cube", reportDate: "2026-02-30" }),
      ),
    ).toBe("TESTING_REPORT_DATE_INVALID");
    expect(
      codeOf(() =>
        testingReportDetails({
          name: "Cube",
          reportDate: "2026-10-09",
          remark: "x".repeat(501),
        }),
      ),
    ).toBe("TESTING_REPORT_REMARK_TOO_LONG");
  });
});
