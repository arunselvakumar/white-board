import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  reportHref,
  type ReportColumn,
  type ReportDocumentResponse,
  type ReportMetricsSection,
  type ReportNotesSection,
  type ReportRow,
  type ReportSection,
  type ReportTableSection,
  type ReportTone,
} from "@/src/queries/reports";

const TEXT_TONES: Record<ReportTone, string> = {
  muted: "text-muted-foreground",
  good: "text-emerald-700 dark:text-emerald-300",
  warn: "text-amber-700 dark:text-amber-300",
  danger: "text-destructive",
  shaded: "",
};

function toneText(tone: ReportTone | null | undefined): string {
  return tone == null ? "" : TEXT_TONES[tone];
}

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * A report as the server built it: the same text the print, Excel, PDF and
 * email show. Every value is preformatted, so it is rendered as-is.
 */
export function ReportDocumentView({
  document,
}: {
  document: ReportDocumentResponse;
}) {
  return (
    <article
      aria-label={`${document.code} ${document.title}`}
      className="report-sheet bg-card space-y-6 rounded-2xl border p-4 shadow-sm sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <ReportDocumentHeader document={document} />
      {document.emptyText != null || document.pages.length === 0 ? (
        <Empty className="border print:border-0">
          <EmptyHeader>
            <EmptyTitle>
              {document.emptyText ?? "Nothing to show for these filters."}
            </EmptyTitle>
            <EmptyDescription className="print:hidden">
              Try another period or fewer filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        document.pages.map((page, index) => (
          <section
            // Pages have no id; their order never changes within a document.
            key={index}
            aria-label={page.heading ?? undefined}
            className={cn(
              "space-y-6",
              index > 0 &&
                "border-t pt-6 print:break-before-page print:border-0 print:pt-0",
            )}
          >
            {page.heading == null ? null : (
              <h3 className="text-lg font-semibold tracking-tight">
                {page.heading}
              </h3>
            )}
            {page.sections.map((section) => (
              <ReportSectionView key={section.id} section={section} />
            ))}
          </section>
        ))
      )}
    </article>
  );
}

function ReportDocumentHeader({
  document,
}: {
  document: ReportDocumentResponse;
}) {
  return (
    <header className="space-y-3 border-b pb-4">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          {document.instituteName}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">
          {document.code} · {document.title}
        </h2>
        {document.subject == null ? null : (
          <p className="font-medium">{document.subject}</p>
        )}
      </div>
      <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {document.period == null ? null : (
          <div className="flex gap-1.5">
            <dt>Period</dt>
            <dd className="text-foreground font-medium">
              {document.period.label}
            </dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt>Generated</dt>
          <dd className="text-foreground">{document.generatedLabel}</dd>
        </div>
      </dl>
      {document.filters.length === 0 ? null : (
        <ul aria-label="Filters" className="flex flex-wrap gap-1.5">
          {document.filters.map((filter) => (
            <li key={`${filter.label}:${filter.value}`}>
              <Badge
                variant="outline"
                className="h-auto max-w-full py-0.5 whitespace-normal"
              >
                <span className="text-muted-foreground">{filter.label}:</span>
                {filter.value}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

function ReportSectionView({ section }: { section: ReportSection }) {
  switch (section.kind) {
    case "metrics":
      return <MetricsSection section={section} />;
    case "notes":
      return <NotesSection section={section} />;
    case "table":
      return <TableSection section={section} />;
  }
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {description == null ? null : (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  );
}

function MetricsSection({ section }: { section: ReportMetricsSection }) {
  const headingId = `report-section-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <SectionHeading
        id={headingId}
        title={section.title}
        description={section.description}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
        {section.items.map((item) => {
          const body = (
            <>
              <span className="text-muted-foreground block text-xs">
                {item.label}
              </span>
              <span
                className={cn(
                  "block text-xl font-semibold tracking-tight tabular-nums",
                  toneText(item.tone),
                )}
              >
                {item.value}
              </span>
              {item.detail == null ? null : (
                <span className="text-muted-foreground block text-xs">
                  {item.detail}
                </span>
              )}
            </>
          );
          const box = cn(
            "report-metric block h-full space-y-0.5 rounded-xl border p-3",
            item.tone === "shaded" && "bg-muted",
          );
          return (
            <li key={item.label}>
              {item.link == null ? (
                <div className={box}>{body}</div>
              ) : (
                <Link
                  href={reportHref(item.link.report, item.link.query)}
                  className={cn(
                    box,
                    "hover:bg-muted/60 focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3",
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotesSection({ section }: { section: ReportNotesSection }) {
  const headingId = `report-section-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <SectionHeading id={headingId} title={section.title} />
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {section.lines.map((line, index) => (
          // Lines are plain text and may repeat.
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function cellClass(
  column: ReportColumn,
  index: number,
  section: ReportTableSection,
  rowTone: ReportTone | null | undefined,
  cellTone: ReportTone | null | undefined,
): string {
  const shaded =
    cellTone === "shaded" || rowTone === "shaded" || column.tone === "shaded";
  const sticky = section.stickyFirstColumn === true && index === 0;
  return cn(
    ALIGN[column.align ?? "left"],
    section.dense === true && "h-auto px-1.5 py-1 text-xs",
    shaded && "bg-muted",
    sticky && "sticky left-0 z-10 border-r print:static print:border-r-0",
    sticky && !shaded && "bg-card",
  );
}

function TableSection({ section }: { section: ReportTableSection }) {
  const headingId = `report-section-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <SectionHeading
        id={headingId}
        title={section.title}
        description={section.description}
      />
      {section.rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {section.emptyText}
        </p>
      ) : (
        <div className="rounded-xl border print:rounded-none print:border-0">
          <Table aria-labelledby={headingId}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {section.columns.map((column, index) => (
                  <TableHead
                    key={column.key}
                    scope="col"
                    className={cn(
                      cellClass(column, index, section, null, null),
                      "text-muted-foreground align-bottom",
                      section.dense === true ? "py-1.5" : "py-2",
                    )}
                  >
                    <span className="block">{column.label}</span>
                    {column.detail == null ? null : (
                      <span className="text-muted-foreground block text-[11px] font-normal">
                        {column.detail}
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.map((row, rowIndex) => (
                <ReportTableRow
                  // Rows have no id; the server fixes their order.
                  key={rowIndex}
                  row={row}
                  section={section}
                />
              ))}
            </TableBody>
            {section.totals == null ? null : (
              <TableFooter className="font-semibold">
                <ReportTableRow row={section.totals} section={section} />
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </section>
  );
}

function ReportTableRow({
  row,
  section,
}: {
  row: ReportRow;
  section: ReportTableSection;
}) {
  return (
    <TableRow className={cn(toneText(row.tone === "shaded" ? null : row.tone))}>
      {section.columns.map((column, index) => {
        const cell = row.cells[column.key];
        const tone =
          cell?.tone ?? (column.tone === "shaded" ? null : column.tone);
        const className = cn(
          cellClass(column, index, section, row.tone, cell?.tone),
          toneText(tone === "shaded" ? null : tone),
        );
        const text = cell?.text ?? "";
        return index === 0 && section.stickyFirstColumn === true ? (
          <TableHead
            key={column.key}
            scope="row"
            className={cn(className, "font-medium")}
          >
            {text}
          </TableHead>
        ) : (
          <TableCell key={column.key} className={className}>
            {text}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
