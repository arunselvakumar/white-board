import { describe, expect, it } from "vitest";

import type { ReportDocumentResponse } from "@/src/queries/reports";

import { cssString, reportPrintCss } from "./report-print";

const document: ReportDocumentResponse = {
  report: "attendance-register",
  code: "R2",
  title: "Batch attendance register",
  instituteName: "Riverside Computer Centre",
  subject: "DCA Morning",
  period: { from: "2026-10-01", to: "2026-10-31", label: "October 2026" },
  generatedAt: "2026-10-13T05:10:00.000Z",
  generatedLabel: "13 Oct 2026, 10:40 AM",
  filters: [],
  orientation: "landscape",
  emptyText: null,
  pages: [],
};

describe("report print CSS", () => {
  it("escapes the running header so it can't break out of the style", () => {
    expect(cssString('Sai "Star" Academy')).toBe('"Sai \\"Star\\" Academy"');
    expect(cssString("A\\B")).toBe('"A\\\\B"');
    expect(cssString("</style><script>")).not.toContain("<");
    expect(cssString("two\nlines")).toBe('"two lines"');
  });

  it("prints A4 in the report's orientation with page numbers", () => {
    expect(reportPrintCss(document)).toContain("size: A4 landscape");
    expect(reportPrintCss({ ...document, orientation: "portrait" })).toContain(
      "size: A4 portrait",
    );
    expect(reportPrintCss(document)).toContain(
      'counter(page) " of " counter(pages)',
    );
  });

  it("puts the institute, report and period in the running header", () => {
    expect(reportPrintCss(document)).toContain(
      'content: "Riverside Computer Centre · R2 Batch attendance register · October 2026"',
    );
    expect(reportPrintCss({ ...document, period: null })).toContain(
      'content: "Riverside Computer Centre · R2 Batch attendance register"',
    );
  });
});
