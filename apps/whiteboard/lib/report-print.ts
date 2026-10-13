// Print rules for a report (Reports PRD §6.8). Pure, so they can be tested.

import type { ReportDocumentResponse } from "@/src/queries/reports";

/** A CSS string literal; `<` is escaped so the text can never close the style tag. */
export function cssString(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ")
    .replace(/</g, "\\3c ");
  return `"${escaped}"`;
}

/** The running header printed at the top-left of every page. */
export function reportRunningHeader(document: ReportDocumentResponse): string {
  return [
    document.instituteName,
    `${document.code} ${document.title}`,
    document.period?.label,
  ]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/**
 * Print rules for one report: A4 in the report's orientation, a running
 * header and page numbers in the page margins, repeated table headers, and
 * none of the app chrome.
 */
export function reportPrintCss(document: ReportDocumentResponse): string {
  const size = document.orientation === "landscape" ? "landscape" : "portrait";
  return `
@page {
  size: A4 ${size};
  margin: 14mm;
  @top-left {
    content: ${cssString(reportRunningHeader(document))};
    font-size: 8pt;
    color: #555;
  }
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 8pt;
    color: #555;
  }
}
@media print {
  [data-slot="sidebar"],
  [data-slot="sidebar-gap"],
  [data-slot="sidebar-container"] {
    display: none !important;
  }
  [data-slot="sidebar-wrapper"] {
    display: block !important;
    min-height: 0 !important;
  }
  [data-slot="sidebar-inset"] {
    margin: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }
  html,
  body {
    background: #fff !important;
  }
  .report-sheet {
    font-size: 10pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report-sheet [data-slot="table-container"] {
    overflow: visible !important;
  }
  .report-sheet table {
    width: 100%;
  }
  .report-sheet thead {
    display: table-header-group;
  }
  .report-sheet tfoot {
    display: table-row-group;
  }
  .report-sheet tr,
  .report-sheet .report-metric {
    break-inside: avoid;
  }
  .report-sheet th,
  .report-sheet td {
    position: static !important;
  }
}
`;
}
