// A Report as an A4 PDF (Reports PRD §6.10): the institute name, report
// name, period, filters, generated date and "Page x of y" on every page;
// R2 and R16 in landscape. The text is exactly what the screen shows. Names
// in Indian scripts and ₹ print through the embedded Noto fonts.

import { PDFDocument, rgb, type PDFPage, type RGB } from "pdf-lib";

import {
  documentTexts,
  type ReportDocument,
  type ReportMetricsSection,
  type ReportNotesSection,
  type ReportTableSection,
  type ReportTone,
} from "../application/report-document";
import { embedNotoText, type NotoText } from "./report-noto-text";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 36;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.86, 0.88);
const SHADE = rgb(0.93, 0.93, 0.94);
const HEAD_FILL = rgb(0.96, 0.96, 0.97);

const TONES: Record<ReportTone, RGB> = {
  muted: MUTED,
  good: rgb(0.08, 0.5, 0.28),
  warn: rgb(0.66, 0.4, 0.02),
  danger: rgb(0.75, 0.13, 0.13),
  shaded: MUTED,
};

class Writer {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  y = 0;
  readonly width: number;
  readonly height: number;

  constructor(
    private readonly pdf: PDFDocument,
    readonly text: NotoText,
    private readonly document: ReportDocument,
  ) {
    const landscape = document.orientation === "landscape";
    this.width = landscape ? A4.height : A4.width;
    this.height = landscape ? A4.width : A4.height;
  }

  get contentWidth(): number {
    return this.width - MARGIN * 2;
  }

  /** A new page with the report header; returns the y below it. */
  newPage(heading: string | null = null): void {
    this.page = this.pdf.addPage([this.width, this.height]);
    this.pages.push(this.page);
    let y = this.height - MARGIN;
    const doc = this.document;
    this.draw(doc.instituteName, MARGIN, y - 11, 11, { bold: true });
    y -= 26;
    this.draw(
      this.text.fit(
        `${doc.code} · ${doc.title}${doc.subject == null ? "" : ` · ${doc.subject}`}`,
        14,
        this.contentWidth,
        true,
      ),
      MARGIN,
      y,
      14,
      { bold: true },
    );
    y -= 14;
    const meta = [
      doc.period == null ? null : doc.period.label,
      ...doc.filters.map((filter) => `${filter.label}: ${filter.value}`),
      doc.generatedLabel,
    ].filter((line): line is string => line != null);
    for (const line of this.wrap(meta.join("  ·  "), 8, this.contentWidth)) {
      this.draw(line, MARGIN, y, 8, { color: MUTED });
      y -= 11;
    }
    this.page.drawLine({
      start: { x: MARGIN, y: y + 3 },
      end: { x: this.width - MARGIN, y: y + 3 },
      thickness: 0.6,
      color: RULE,
    });
    y -= 12;
    if (heading != null) {
      this.draw(heading, MARGIN, y - 4, 13, { bold: true });
      y -= 22;
    }
    this.y = y;
  }

  /** Room for `height` more points, or a new page. */
  ensure(height: number): boolean {
    if (this.y - height >= MARGIN + 18) return false;
    this.newPage();
    return true;
  }

  draw(
    value: string,
    x: number,
    y: number,
    size: number,
    options: { bold?: boolean; color?: RGB } = {},
  ): void {
    if (value === "") return;
    this.text.draw(this.page, value, {
      x,
      y,
      size,
      bold: options.bold,
      color: options.color ?? INK,
    });
  }

  fill(x: number, y: number, width: number, height: number, color: RGB): void {
    this.page.drawRectangle({ x, y, width, height, color });
  }

  rule(y: number): void {
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: this.width - MARGIN, y },
      thickness: 0.4,
      color: RULE,
    });
  }

  wrap(value: string, size: number, width: number, bold = false): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of value.split(/\s+/)) {
      const next = line === "" ? word : `${line} ${word}`;
      if (this.text.width(next, size, bold) <= width || line === "")
        line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line !== "") lines.push(this.text.fit(line, size, width, bold));
    return lines;
  }

  footers(): void {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const label = `Page ${String(index + 1)} of ${String(total)}`;
      this.text.draw(page, label, {
        x: this.width - MARGIN - this.text.width(label, 8),
        y: MARGIN - 14,
        size: 8,
        color: MUTED,
      });
      this.text.draw(
        page,
        this.text.fit(
          `${this.document.instituteName} · ${this.document.title}`,
          8,
          this.contentWidth - 80,
        ),
        { x: MARGIN, y: MARGIN - 14, size: 8, color: MUTED },
      );
    });
  }
}

function sectionTitle(writer: Writer, title: string): void {
  writer.ensure(40);
  writer.draw(title, MARGIN, writer.y - 10, 10.5, { bold: true });
  writer.y -= 18;
}

function drawMetrics(writer: Writer, section: ReportMetricsSection): void {
  sectionTitle(writer, section.title);
  const columns = writer.contentWidth > 600 ? 4 : 3;
  const cellWidth = writer.contentWidth / columns;
  for (let index = 0; index < section.items.length; index += columns) {
    const items = section.items.slice(index, index + columns);
    const valueLines = items.map((item) =>
      writer.wrap(item.value, 10, cellWidth - 10, true).slice(0, 3),
    );
    const height =
      12 +
      Math.max(...valueLines.map((lines) => lines.length)) * 12 +
      (items.some((item) => item.detail != null) ? 10 : 0) +
      6;
    writer.ensure(height);
    items.forEach((item, column) => {
      const x = MARGIN + column * cellWidth;
      writer.draw(
        writer.text.fit(item.label, 7.5, cellWidth - 10),
        x,
        writer.y - 8,
        7.5,
        {
          color: MUTED,
        },
      );
      let y = writer.y - 20;
      for (const line of valueLines[column] ?? []) {
        writer.draw(line, x, y, 10, {
          bold: true,
          color: item.tone == null ? INK : TONES[item.tone],
        });
        y -= 12;
      }
      if (item.detail != null)
        writer.draw(
          writer.text.fit(item.detail, 7, cellWidth - 10),
          x,
          y + 2,
          7,
          {
            color: MUTED,
          },
        );
    });
    writer.y -= height;
  }
  writer.y -= 4;
}

function drawNotes(writer: Writer, section: ReportNotesSection): void {
  sectionTitle(writer, section.title);
  for (const line of section.lines)
    for (const part of writer.wrap(line, 9, writer.contentWidth)) {
      writer.ensure(13);
      writer.draw(part, MARGIN, writer.y - 9, 9);
      writer.y -= 13;
    }
  writer.y -= 6;
}

function drawTable(writer: Writer, section: ReportTableSection): void {
  sectionTitle(writer, section.title);
  if (section.description != null)
    for (const line of writer.wrap(
      section.description,
      7.5,
      writer.contentWidth,
    )) {
      writer.ensure(11);
      writer.draw(line, MARGIN, writer.y - 7, 7.5, { color: MUTED });
      writer.y -= 11;
    }
  const columns = section.columns;
  const size =
    columns.length > 24
      ? 6
      : columns.length > 12
        ? 6.5
        : columns.length > 8
          ? 7.5
          : 8.5;
  const rows = [
    ...section.rows,
    ...(section.totals == null ? [] : [section.totals]),
  ];
  // Each column gets its natural width, scaled down together to fit the page.
  const natural = columns.map(
    (column) =>
      Math.max(
        writer.text.width(column.label, size, true),
        writer.text.width(column.detail ?? "", size - 1),
        ...rows.map((item) =>
          writer.text.width(
            item.cells[column.key]?.text ?? "",
            size,
            item === section.totals,
          ),
        ),
        size * 1.6,
      ) + 6,
  );
  const capped = natural.map((width) =>
    Math.min(width, writer.contentWidth * 0.4),
  );
  const total = capped.reduce((sum, width) => sum + width, 0);
  const scale = total > writer.contentWidth ? writer.contentWidth / total : 1;
  const widths = capped.map((width) => width * scale);
  const rowHeight = size + 6;
  const hasDetail = columns.some((column) => column.detail != null);
  const headerHeight = hasDetail ? rowHeight + size : rowHeight;
  const header = () => {
    writer.fill(
      MARGIN,
      writer.y - headerHeight,
      writer.contentWidth,
      headerHeight,
      HEAD_FILL,
    );
    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index] ?? 0;
      if (column.tone === "shaded")
        writer.fill(x, writer.y - headerHeight, width, headerHeight, SHADE);
      const label = writer.text.fit(column.label, size, width - 4, true);
      writer.draw(
        label,
        alignX(writer, column.align, x, width, label, size, true),
        writer.y - size - 2,
        size,
        { bold: true },
      );
      if (column.detail != null) {
        const detail = writer.text.fit(column.detail, size - 1, width - 4);
        writer.draw(
          detail,
          alignX(writer, column.align, x, width, detail, size - 1),
          writer.y - size * 2 - 3,
          size - 1,
          {
            color: MUTED,
          },
        );
      }
      x += width;
    });
    writer.y -= headerHeight;
  };
  writer.ensure(headerHeight + rowHeight * 2);
  header();
  if (section.rows.length === 0) {
    writer.draw(section.emptyText, MARGIN + 3, writer.y - size - 3, size, {
      color: MUTED,
    });
    writer.y -= rowHeight + 8;
    return;
  }
  for (const item of rows) {
    if (writer.ensure(rowHeight)) header();
    const isTotal = item === section.totals;
    let x = MARGIN;
    if (item.tone === "shaded")
      writer.fill(
        MARGIN,
        writer.y - rowHeight,
        writer.contentWidth,
        rowHeight,
        SHADE,
      );
    columns.forEach((column, index) => {
      const width = widths[index] ?? 0;
      const cell = item.cells[column.key];
      if (
        cell?.tone === "shaded" ||
        (column.tone === "shaded" && item.tone !== "shaded")
      )
        writer.fill(x, writer.y - rowHeight, width, rowHeight, SHADE);
      const value = writer.text.fit(cell?.text ?? "", size, width - 4, isTotal);
      const tone = cell?.tone ?? item.tone;
      writer.draw(
        value,
        alignX(writer, column.align, x, width, value, size, isTotal),
        writer.y - size - 2,
        size,
        {
          bold: isTotal,
          color: tone == null || tone === "shaded" ? INK : TONES[tone],
        },
      );
      x += width;
    });
    writer.y -= rowHeight;
    writer.rule(writer.y);
  }
  writer.y -= 10;
}

function alignX(
  writer: Writer,
  align: "left" | "right" | "center" | undefined,
  x: number,
  width: number,
  value: string,
  size: number,
  bold = false,
): number {
  if (align === "right")
    return x + width - 2 - writer.text.width(value, size, bold);
  if (align === "center")
    return x + (width - writer.text.width(value, size, bold)) / 2;
  return x + 2;
}

/** The PDF bytes for a Report. */
export async function reportPdf(document: ReportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${document.title} · ${document.instituteName}`);
  pdf.setCreator("Whiteboard");
  const text = await embedNotoText(pdf, documentTexts(document));
  const writer = new Writer(pdf, text, document);
  if (document.pages.length === 0) {
    writer.newPage();
    writer.draw(
      document.emptyText ?? "Nothing to show.",
      MARGIN,
      writer.y - 12,
      11,
      {
        color: MUTED,
      },
    );
  }
  for (const page of document.pages) {
    writer.newPage(page.heading);
    for (const section of page.sections) {
      if (section.kind === "metrics") drawMetrics(writer, section);
      else if (section.kind === "notes") drawNotes(writer, section);
      else drawTable(writer, section);
    }
  }
  writer.footers();
  return pdf.save();
}
