import { cn } from "@repo/ui/lib/utils";

import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import {
  PRESCHOOL_RATING_KEY,
  PRESCHOOL_RATING_LABELS,
  type PreschoolProgressRating,
  type PreschoolProgressReport,
} from "@/src/queries/preschool/progress-reports";

const RATINGS = ["beginning", "progressing", "proficient"] as const;

/** Print rules for a Progress Report: A4 portrait, no app chrome. */
export const PROGRESS_REPORT_PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 12mm;
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
    padding: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }
  html,
  body {
    background: #fff !important;
  }
  .progress-report {
    border: 0 !important;
    box-shadow: none !important;
    max-width: none !important;
    padding: 0 !important;
    font-size: 10pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .progress-report tr,
  .progress-report section {
    break-inside: avoid;
  }
}
`;

/** Three labelled boxes with the chosen rating filled. */
function RatingBoxes({
  rating,
  domainName,
}: {
  rating: PreschoolProgressRating | null;
  domainName: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${domainName}: ${rating == null ? "not rated" : PRESCHOOL_RATING_LABELS[rating]}`}
      className="flex flex-wrap gap-1.5"
    >
      {RATINGS.map((value) => (
        <span
          key={value}
          aria-hidden="true"
          className={cn(
            "flex min-w-20 items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs",
            rating === value
              ? "border-foreground bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full border border-current",
              rating === value && "bg-current",
            )}
          />
          {PRESCHOOL_RATING_LABELS[value]}
        </span>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}

/** The printable term Progress Report. */
export function ProgressReportPrint({
  report,
}: {
  report: PreschoolProgressReport;
}) {
  const { child, attendance } = report;
  return (
    <article
      aria-label={`Progress Report for ${child.name}`}
      className="progress-report bg-card mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-xl border p-6 text-sm"
    >
      <header className="flex flex-col items-center gap-1 border-b pb-4 text-center">
        <p className="text-lg font-semibold">{report.centre.name}</p>
        <h2 className="text-base font-semibold">
          Progress Report — {report.term.label}, {report.academicYear.name}
        </h2>
        <p className="text-muted-foreground text-xs">
          {formatDate(report.term.startsOn)} to {formatDate(report.term.endsOn)}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Detail label="Child" value={child.name} />
        <Detail label="Admission number" value={child.admissionNumber} />
        <Detail label="Date of birth" value={formatDate(child.dateOfBirth)} />
        <Detail label="Classroom" value={child.classroomName} />
        <Detail label="Programme" value={child.programmeName} />
        <Detail
          label="Attendance this term"
          value={
            attendance.marked === 0
              ? "Not marked"
              : `${String(attendance.present)} of ${String(attendance.marked)} days`
          }
        />
      </dl>
      {/* A table on paper and wide screens; on a phone each Domain stacks. */}
      <table className="block w-full border-collapse text-left sm:table print:table">
        <thead className="hidden sm:table-header-group print:table-header-group">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Development Domain
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Rating
            </th>
            <th scope="col" className="py-2 font-semibold">
              Remark
            </th>
          </tr>
        </thead>
        <tbody className="block sm:table-row-group print:table-row-group">
          {report.ratings.map((row) => (
            <tr
              key={row.domainId}
              className="block border-b py-2 align-top sm:table-row sm:py-0 print:table-row print:py-0"
            >
              <th
                scope="row"
                className="block pb-1.5 font-medium sm:table-cell sm:py-2 sm:pr-3 print:table-cell print:py-2 print:pr-3"
              >
                {row.domainName}
              </th>
              <td className="block sm:table-cell sm:py-2 sm:pr-3 print:table-cell print:py-2 print:pr-3">
                <RatingBoxes rating={row.rating} domainName={row.domainName} />
              </td>
              <td className="block pt-1.5 max-sm:empty:hidden sm:table-cell sm:py-2 print:table-cell print:py-2">
                {row.remark ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="space-y-1">
        <h3 className="font-semibold">Teacher&apos;s remarks</h3>
        <p className="min-h-12 whitespace-pre-line">
          {report.teacherRemarks ?? ""}
        </p>
      </section>
      <section
        aria-label="Key"
        className="text-muted-foreground space-y-1 text-xs"
      >
        {RATINGS.map((value) => (
          <p key={value}>
            <span className="text-foreground font-medium">
              {PRESCHOOL_RATING_LABELS[value]}
            </span>
            : {PRESCHOOL_RATING_KEY[value]}
          </p>
        ))}
      </section>
      <footer className="grid grid-cols-3 gap-6 pt-10 text-center text-xs">
        {["Class Teacher", "Centre Head", "Parent"].map((role) => (
          <div key={role} className="border-t pt-1">
            {role}
          </div>
        ))}
      </footer>
      {report.publishedAt == null ? (
        <p className="text-muted-foreground text-center text-xs print:hidden">
          Draft — not yet shared with the Parents.
        </p>
      ) : (
        <p className="text-muted-foreground text-center text-xs">
          Published {formatDate(report.publishedAt.slice(0, 10))}
        </p>
      )}
    </article>
  );
}
