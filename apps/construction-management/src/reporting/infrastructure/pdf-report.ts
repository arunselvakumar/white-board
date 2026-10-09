import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type {
  Cell,
  ReportColumn,
  ReportDocument,
  ReportTable,
} from "../domain/report-document";

const SIZES = {
  a4: { width: 841.89, height: 595.28 },
  a3: { width: 1190.55, height: 841.89 },
} as const;
const MARGIN = 28;
const FOOTER = 18;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.91, 0.93, 0.97);
const ZEBRA = rgb(0.97, 0.97, 0.98);
const TOTAL_FILL = rgb(0.93, 0.94, 0.95);

/**
 * Standard PDF fonts are WinAnsi: Latin-1 prints (½ included), ₹ and
 * Indian scripts do not. The Excel file keeps the original text.
 */
export function printable(value: string): string {
  return value
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s/g, " ")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function formatter(
  currency: string,
): (cell: Cell, col: ReportColumn) => string {
  const money = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const decimal = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  });
  return (cell, col) => {
    if (cell == null) return "";
    if (typeof cell === "string") return printable(cell);
    switch (col.kind) {
      case "money":
        return money.format(cell / 100);
      case "count":
        return String(cell);
      default:
        return decimal.format(cell);
    }
  };
}

/** Cuts `text` to fit `width` at `size`, ending with "..". */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}..`, size) > width)
    cut = cut.slice(0, -1);
  return cut.length === 0 ? "" : `${cut}..`;
}

/** Splits a header label into lines no wider than `width`. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line.length === 0 ? word : `${line} ${word}`;
    if (font.widthOfTextAtSize(next, size) <= width || line.length === 0)
      line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.map((item) => fit(item, font, size, width));
}

function hasMoney(document: ReportDocument): boolean {
  return document.tables.some((table) =>
    table.columns.some((col) => col.kind === "money"),
  );
}

type Layout = {
  widths: number[];
  size: number;
  rowHeight: number;
};

function layout(columns: readonly ReportColumn[], available: number): Layout {
  const units = columns.reduce((sum, col) => sum + col.width, 0);
  const perUnit = available / units;
  // A width unit is about one character; digits and capitals in Helvetica
  // run to about 0.6 em, plus the cell padding.
  const size = Math.max(4.5, Math.min(8, perUnit / 0.7));
  return {
    widths: columns.map((col) => col.width * perUnit),
    size,
    rowHeight: size + 5,
  };
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly document: ReportDocument,
  ) {}

  private get size() {
    return SIZES[this.document.pageSize];
  }

  private get width() {
    return this.size.width - MARGIN * 2;
  }

  private text(
    value: string,
    x: number,
    y: number,
    options: { size: number; bold?: boolean; muted?: boolean },
  ) {
    this.page.drawText(printable(value), {
      x,
      y,
      size: options.size,
      font: options.bold === true ? this.bold : this.regular,
      color: options.muted === true ? MUTED : INK,
    });
  }

  /** A new page with the report header (every page carries it). */
  newPage(): void {
    const { width, height } = this.size;
    this.page = this.pdf.addPage([width, height]);
    this.pages.push(this.page);
    const { header } = this.document;
    let y = height - MARGIN - 12;
    this.text(header.company, MARGIN, y, { size: 13, bold: true });
    const right = `Generated at ${header.generatedAt}`;
    this.text(
      right,
      width - MARGIN - this.regular.widthOfTextAtSize(printable(right), 8),
      y + 2,
      { size: 8, muted: true },
    );
    y -= 15;
    this.text(header.title, MARGIN, y, { size: 11, bold: true });
    y -= 13;
    const facts = [
      `Project: ${header.project}`,
      ...(header.address == null ? [] : [`Address: ${header.address}`]),
      `Period: ${header.period}`,
      ...(hasMoney(this.document) ? [`Amounts in ${header.currency}`] : []),
    ].join("     ");
    this.text(fit(printable(facts), this.regular, 8.5, this.width), MARGIN, y, {
      size: 8.5,
    });
    y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: width - MARGIN, y },
      thickness: 0.6,
      color: RULE,
    });
    this.y = y - 12;
  }

  notes(): void {
    for (const note of this.document.notes) {
      for (const line of wrap(printable(note), this.regular, 7.5, this.width)) {
        this.text(line, MARGIN, this.y, { size: 7.5, muted: true });
        this.y -= 10;
      }
    }
    this.y -= 4;
  }

  private headerRow(table: ReportTable, grid: Layout): void {
    const lines = table.columns.map((col, index) =>
      wrap(
        printable(col.label),
        this.bold,
        grid.size,
        (grid.widths[index] ?? 0) - 4,
      ),
    );
    const count = Math.min(3, Math.max(...lines.map((item) => item.length)));
    const height = count * (grid.size + 1.5) + 5;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: this.width,
      height,
      color: HEAD_FILL,
    });
    let x = MARGIN;
    table.columns.forEach((col, index) => {
      const width = grid.widths[index] ?? 0;
      (lines[index] ?? []).slice(0, 3).forEach((line, lineIndex) => {
        const textWidth = this.bold.widthOfTextAtSize(line, grid.size);
        const lineX = col.kind === "text" ? x + 2 : x + width - 2 - textWidth;
        this.page.drawText(line, {
          x: lineX,
          y: this.y - 3 - (lineIndex + 1) * (grid.size + 1.5) + 1.5,
          size: grid.size,
          font: this.bold,
          color: INK,
        });
      });
      x += width;
    });
    this.y -= height;
  }

  private row(
    table: ReportTable,
    grid: Layout,
    values: readonly string[],
    style: { bold?: boolean; fill?: ReturnType<typeof rgb> },
  ): void {
    const font = style.bold === true ? this.bold : this.regular;
    if (style.fill != null)
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - grid.rowHeight,
        width: this.width,
        height: grid.rowHeight,
        color: style.fill,
      });
    let x = MARGIN;
    table.columns.forEach((col, index) => {
      const width = grid.widths[index] ?? 0;
      const text = fit(values[index] ?? "", font, grid.size, width - 4);
      if (text.length > 0) {
        const textWidth = font.widthOfTextAtSize(text, grid.size);
        this.page.drawText(text, {
          x: col.kind === "text" ? x + 2 : x + width - 2 - textWidth,
          y: this.y - grid.rowHeight + 3.2,
          size: grid.size,
          font,
          color: INK,
        });
      }
      x += width;
    });
    this.y -= grid.rowHeight;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + this.width, y: this.y },
      thickness: 0.3,
      color: RULE,
    });
  }

  table(table: ReportTable, first: boolean): void {
    this.newPage();
    if (first) this.notes();
    const grid = layout(table.columns, this.width);
    const format = formatter(this.document.header.currency);
    const cells = (values: readonly Cell[]) =>
      table.columns.map((col, index) => format(values[index] ?? null, col));
    const bottom = MARGIN + FOOTER;

    if (this.document.tables.length > 1) {
      this.text(table.name, MARGIN, this.y, { size: 10, bold: true });
      this.y -= 8;
    }
    this.headerRow(table, grid);
    if (table.rows.length === 0) {
      this.y -= 4;
      this.text("No records in this period.", MARGIN + 2, this.y - grid.size, {
        size: grid.size + 1,
        muted: true,
      });
      this.y -= grid.rowHeight + 4;
    }
    table.rows.forEach((values, index) => {
      if (this.y - grid.rowHeight < bottom) {
        this.newPage();
        this.headerRow(table, grid);
      }
      this.row(table, grid, cells(values), {
        fill: index % 2 === 1 ? ZEBRA : undefined,
      });
    });
    if (table.totals != null) {
      if (this.y - grid.rowHeight < bottom) {
        this.newPage();
        this.headerRow(table, grid);
      }
      this.row(table, grid, cells(table.totals), {
        bold: true,
        fill: TOTAL_FILL,
      });
    }
  }

  footers(): void {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const label = `Page ${String(index + 1)} of ${String(total)}`;
      page.drawText(label, {
        x:
          page.getWidth() - MARGIN - this.regular.widthOfTextAtSize(label, 7.5),
        y: MARGIN - 6,
        size: 7.5,
        font: this.regular,
        color: MUTED,
      });
      page.drawText(
        printable(
          `${this.document.header.title} - ${this.document.header.project} - ${this.document.header.period}`,
        ),
        {
          x: MARGIN,
          y: MARGIN - 6,
          size: 7.5,
          font: this.regular,
          color: MUTED,
        },
      );
    });
  }
}

/**
 * The document as a landscape PDF (A4, A3 for the muster roll): the
 * header on every page, each table paginated with its header row
 * repeated, a totals row, and "Page x of y" (`modules/11` conventions).
 */
export async function renderPdf(document: ReportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    printable(`${document.header.title} - ${document.header.project}`),
  );
  pdf.setAuthor(printable(document.header.company));
  pdf.setCreator("Construction Management");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(pdf, regular, bold, document);
  document.tables.forEach((table, index) => {
    writer.table(table, index === 0);
  });
  if (document.tables.length === 0) writer.newPage();
  writer.footers();
  return pdf.save();
}
