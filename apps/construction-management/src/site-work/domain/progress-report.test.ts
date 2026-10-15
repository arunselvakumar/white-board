import { describe, expect, it } from "vitest";

import { progressReportDate, taskProgressPeriod } from "./progress-report";

describe("progressReportDate", () => {
  it("takes today or an earlier date", () => {
    expect(progressReportDate("2026-10-11", "2026-10-11")).toBe("2026-10-11");
    expect(progressReportDate("2026-01-31", "2026-10-11")).toBe("2026-01-31");
  });

  it("refuses a future date and a date that does not exist", () => {
    expect(() => progressReportDate("2026-10-12", "2026-10-11")).toThrow(
      expect.objectContaining({
        code: "PROGRESS_REPORT_DATE_IN_FUTURE",
        details: { field: "date" },
      }),
    );
    expect(() => progressReportDate("2026-02-30", "2026-10-11")).toThrow(
      expect.objectContaining({ code: "PROGRESS_REPORT_DATE_INVALID" }),
    );
  });
});

describe("taskProgressPeriod (CM-805)", () => {
  const TODAY = "2026-10-11";
  const refused = (
    input: { from?: string; to?: string },
    code: string,
    field: string,
  ) => {
    expect(() => taskProgressPeriod(input, TODAY)).toThrow(
      expect.objectContaining({ code, details: { field } }),
    );
  };

  it("takes a period ending today or earlier, a day long or up to a year", () => {
    expect(
      taskProgressPeriod({ from: "2026-10-01", to: TODAY }, TODAY),
    ).toEqual({ from: "2026-10-01", to: TODAY });
    expect(taskProgressPeriod({ from: TODAY, to: TODAY }, TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
    });
    expect(
      taskProgressPeriod({ from: "2025-10-11", to: TODAY }, TODAY),
    ).toEqual({ from: "2025-10-11", to: TODAY });
  });

  it("refuses a missing day, a backwards or future period and one longer than a year", () => {
    refused({ to: TODAY }, "PROGRESS_REPORT_PERIOD_INVALID", "from");
    refused({ from: TODAY }, "PROGRESS_REPORT_PERIOD_INVALID", "to");
    refused(
      { from: TODAY, to: "2026-10-01" },
      "PROGRESS_REPORT_PERIOD_INVALID",
      "to",
    );
    refused(
      { from: "2026-10-01", to: "2026-10-12" },
      "PROGRESS_REPORT_DATE_IN_FUTURE",
      "to",
    );
    refused(
      { from: "2025-10-10", to: TODAY },
      "PROGRESS_REPORT_PERIOD_TOO_LONG",
      "from",
    );
  });
});
