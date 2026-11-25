"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/app/(app)/_components/app-shell/page-header";
import { preschoolProgressReportQueryOptions } from "@/src/queries/preschool/progress-reports";

import {
  PROGRESS_REPORT_PRINT_CSS,
  ProgressReportPrint,
} from "./progress-report-print";

/** The printable Progress Report with Print and the way back. */
export function ProgressReportScreen({ reportId }: { reportId: string }) {
  const { data: report } = useSuspenseQuery(
    preschoolProgressReportQueryOptions(reportId),
  );
  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 print:p-0">
      <style>{PROGRESS_REPORT_PRINT_CSS}</style>
      <div className="print:hidden">
        <PageHeader
          title={`${report.child.name} — ${report.term.label}`}
          meta={report.academicYear.name}
          watermark="Progress"
          back={{ href: "/preschool/progress", label: "Progress" }}
          actions={
            <Button
              type="button"
              onClick={() => {
                window.print();
              }}
            >
              <Printer aria-hidden="true" />
              Print
            </Button>
          }
        />
      </div>
      <ProgressReportPrint report={report} />
    </div>
  );
}
