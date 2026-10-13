// A Report, ready to show (Reports PRD §6.9, §6.10). Every report is built
// into this one shape; the screen, print, Excel, PDF and email all render it,
// so each output holds exactly what that viewer could see on screen.

import type { ReportKey } from "../domain/report-catalogue";
import {
  formatPercent,
  formatRupees,
  indianGrouping,
} from "../domain/report-format";

export type ReportTone = "muted" | "good" | "warn" | "danger" | "shaded";

export type ReportCell = {
  text: string;
  /** A number for Excel; the text is what the screen shows. */
  value?: number | null;
  tone?: ReportTone | null;
};

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Column header shading, such as a Holiday date in a register. */
  tone?: ReportTone | null;
  /** Another line under the label, such as the weekday. */
  detail?: string | null;
};

export type ReportRow = {
  cells: Record<string, ReportCell>;
  tone?: ReportTone | null;
};

/** A link to another report (R19 figures link to their reports). */
export type ReportLink = {
  report: ReportKey;
  query: Record<string, string>;
};

export type ReportMetric = {
  label: string;
  value: string;
  detail?: string | null;
  tone?: ReportTone | null;
  link?: ReportLink | null;
};

export type ReportTableSection = {
  kind: "table";
  id: string;
  title: string;
  description?: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow | null;
  emptyText: string;
  /** Wide grids keep the first column in view while scrolling sideways. */
  stickyFirstColumn?: boolean;
  /** Narrow cells, as in a register grid. */
  dense?: boolean;
};

export type ReportMetricsSection = {
  kind: "metrics";
  id: string;
  title: string;
  description?: string | null;
  items: ReportMetric[];
};

export type ReportNotesSection = {
  kind: "notes";
  id: string;
  title: string;
  lines: string[];
};

export type ReportSection =
  ReportTableSection | ReportMetricsSection | ReportNotesSection;

/** One printed page group: a bulk R18 has one per Student. */
export type ReportPage = {
  heading: string | null;
  sections: ReportSection[];
};

export type ReportDocument = {
  report: ReportKey;
  code: string;
  title: string;
  instituteName: string;
  /** Who or what the report is about, such as a Student's name. */
  subject: string | null;
  period: { from: string; to: string; label: string } | null;
  generatedAt: string;
  generatedLabel: string;
  filters: { label: string; value: string }[];
  orientation: "portrait" | "landscape";
  /** Set when there is nothing to show; the pages are then empty. */
  emptyText: string | null;
  pages: ReportPage[];
};

export function textCell(
  text: string | null | undefined,
  tone?: ReportTone | null,
): ReportCell {
  return { text: text == null || text === "" ? "–" : text, tone: tone ?? null };
}

export function countCell(value: number, tone?: ReportTone | null): ReportCell {
  return { text: indianGrouping(value), value, tone: tone ?? null };
}

export function moneyCell(paise: number, tone?: ReportTone | null): ReportCell {
  return { text: formatRupees(paise), value: paise / 100, tone: tone ?? null };
}

export function percentCell(
  percent: number | null,
  tone?: ReportTone | null,
): ReportCell {
  return { text: formatPercent(percent), value: percent, tone: tone ?? null };
}

export function table(
  input: Omit<ReportTableSection, "kind">,
): ReportTableSection {
  return { kind: "table", ...input };
}

export function metrics(
  input: Omit<ReportMetricsSection, "kind">,
): ReportMetricsSection {
  return { kind: "metrics", ...input };
}

export function notes(
  input: Omit<ReportNotesSection, "kind">,
): ReportNotesSection {
  return { kind: "notes", ...input };
}

export function row(
  cells: Record<string, ReportCell>,
  tone?: ReportTone | null,
): ReportRow {
  return { cells, tone: tone ?? null };
}

/** Every text a document holds, so the PDF can embed the fonts it needs. */
export function documentTexts(document: ReportDocument): string[] {
  const texts = [
    document.title,
    document.instituteName,
    document.subject ?? "",
    document.period?.label ?? "",
    document.generatedLabel,
    document.emptyText ?? "",
    ...document.filters.flatMap((filter) => [filter.label, filter.value]),
  ];
  for (const page of document.pages) {
    texts.push(page.heading ?? "");
    for (const section of page.sections) {
      texts.push(section.title);
      if (section.kind === "notes") texts.push(...section.lines);
      if (section.kind === "metrics")
        for (const item of section.items)
          texts.push(item.label, item.value, item.detail ?? "");
      if (section.kind === "table") {
        texts.push(section.description ?? "", section.emptyText);
        for (const column of section.columns)
          texts.push(column.label, column.detail ?? "");
        for (const item of [
          ...section.rows,
          ...(section.totals ? [section.totals] : []),
        ])
          for (const cell of Object.values(item.cells)) texts.push(cell.text);
      }
    }
  }
  return texts;
}
