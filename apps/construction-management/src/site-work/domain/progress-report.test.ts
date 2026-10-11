import { describe, expect, it } from "vitest";

import { progressReportDate } from "./progress-report";

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
