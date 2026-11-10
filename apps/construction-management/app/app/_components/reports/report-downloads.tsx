import { FileSpreadsheet, FileText } from "lucide-react";
import { buttonVariants } from "@repo/ui/components/button";

import type { ReportJob } from "@/src/queries/reports";

/**
 * Excel and PDF download links of a done report. The files stream from our
 * route, which checks access again; nothing is a public URL.
 */
export function ReportDownloads({
  job,
  label,
}: {
  job: ReportJob;
  /** Prefix for the links' accessible names, e.g. the report title. */
  label: string;
}) {
  if (job.status !== "done") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {job.downloads.xlsx == null ? null : (
        <a
          href={job.downloads.xlsx}
          download
          aria-label={`${label} Excel`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileSpreadsheet aria-hidden="true" />
          Excel
        </a>
      )}
      {job.downloads.pdf == null ? null : (
        <a
          href={job.downloads.pdf}
          download
          aria-label={`${label} PDF`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileText aria-hidden="true" />
          PDF
        </a>
      )}
    </div>
  );
}
