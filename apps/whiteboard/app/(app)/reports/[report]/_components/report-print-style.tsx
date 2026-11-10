import { reportPrintCss } from "@/lib/report-print";
import type { ReportDocumentResponse } from "@/src/queries/reports";

/** The print rules for the report on screen; gone when the report closes. */
export function ReportPrintStyle({
  document,
}: {
  document: ReportDocumentResponse;
}) {
  return <style>{reportPrintCss(document)}</style>;
}
