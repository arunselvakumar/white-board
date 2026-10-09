import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import type {
  Cell,
  ReportColumn,
  ReportDocument,
  ReportTable,
} from "../domain/report-document";
import {
  embedFace,
  pdfFontFaces,
  registerReportFonts,
  type FontWeight,
} from "./pdf-fonts";
import { splitRuns, type FontFace, type TextRun } from "./script-runs";

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

/** Printed at the foot of every page when some text fell back to "?". */
export const UNPRINTABLE_NOTE =
  "Some names use a script this PDF cannot print; the Excel file has them in full.";

/** Tabs and line breaks print as spaces; everything else as written. */
export function printable(value: string): string {
  return value.replace(/\s/g, " ");
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Sets text in the Noto faces: each string is split into runs by script
 * (Latin, ₹ and digits in Noto Sans; Devanagari, Tamil, Telugu… in their
 * Noto fonts), measured and drawn run by run. A character no face has
 * prints as "?" and marks the document for {@link UNPRINTABLE_NOTE}.
 */
class Typesetter {
  /** Whether a drawn string had a character no face has. */
  missing = false;
  private readonly runCache = new Map<string, TextRun[]>();

  constructor(
    private readonly faces: readonly FontFace[],
    private readonly fonts: ReadonlyMap<string, PDFFont>,
  ) {}

  private runs(text: string): TextRun[] {
    let runs = this.runCache.get(text);
    if (runs == null) {
      runs = splitRuns(text, this.faces);
      this.runCache.set(text, runs);
    }
    return runs;
  }

  private font(face: string, weight: FontWeight): PDFFont {
    const font =
      this.fonts.get(fontKey(face, weight)) ??
      this.fonts.get(fontKey(face, "regular")) ??
      this.fonts.get(fontKey("latin", weight));
    if (font == null) throw new Error(`The PDF has no "${face}" font.`);
    return font;
  }

  width(text: string, size: number, weight: FontWeight = "regular"): number {
    return this.runs(text).reduce(
      (sum, run) =>
        sum + this.font(run.face, weight).widthOfTextAtSize(run.text, size),
      0,
    );
  }

  draw(
    page: PDFPage,
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      weight?: FontWeight;
      color: RGB;
    },
  ): void {
    const weight = options.weight ?? "regular";
    let x = options.x;
    for (const run of this.runs(text)) {
      const font = this.font(run.face, weight);
      page.drawText(run.text, {
        x,
        y: options.y,
        size: options.size,
        font,
        color: options.color,
      });
      x += font.widthOfTextAtSize(run.text, options.size);
      if (run.missing) this.missing = true;
    }
  }

  /** Cuts `text` to fit `width` at `size`, ending with "..". */
  fit(
    text: string,
    size: number,
    width: number,
    weight: FontWeight = "regular",
  ): string {
    if (this.width(text, size, weight) <= width) return text;
    const parts = Array.from(graphemes.segment(text), (item) => item.segment);
    // The longest prefix (whole graphemes) that fits with "..".
    let low = 0;
    let high = parts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const cut = `${parts.slice(0, middle).join("")}..`;
      if (this.width(cut, size, weight) <= width) low = middle;
      else high = middle - 1;
    }
    return low === 0 ? "" : `${parts.slice(0, low).join("")}..`;
  }

  /** Splits a header label into lines no wider than `width`. */
  wrap(
    text: string,
    size: number,
    width: number,
    weight: FontWeight = "regular",
  ): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line.length === 0 ? word : `${line} ${word}`;
      if (this.width(next, size, weight) <= width || line.length === 0)
        line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line.length > 0) lines.push(line);
    return lines.map((item) => this.fit(item, size, width, weight));
  }
}

function fontKey(face: string, weight: FontWeight): string {
  return `${face}:${weight}`;
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
  // A width unit is about one character; digits and capitals in Noto Sans
  // run to about 0.6 em, plus the cell padding.
  const size = Math.max(4.5, Math.min(8, perUnit / 0.7));
  return {
    widths: columns.map((col) => col.width * perUnit),
    size,
    rowHeight: size + 5,
  };
}

/** The header's facts line: Project, address, period, currency. */
function factsLine(document: ReportDocument): string {
  const { header } = document;
  return [
    `Project: ${header.project}`,
    ...(header.address == null ? [] : [`Address: ${header.address}`]),
    `Period: ${header.period}`,
    ...(hasMoney(document) ? [`Amounts in ${header.currency}`] : []),
  ].join("     ");
}

function footerLabel(document: ReportDocument): string {
  const { header } = document;
  return `${header.title} - ${header.project} - ${header.period}`;
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly type: Typesetter,
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
    this.type.draw(this.page, printable(value), {
      x,
      y,
      size: options.size,
      weight: options.bold === true ? "bold" : "regular",
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
    const right = printable(`Generated at ${header.generatedAt}`);
    this.text(right, width - MARGIN - this.type.width(right, 8), y + 2, {
      size: 8,
      muted: true,
    });
    y -= 15;
    this.text(header.title, MARGIN, y, { size: 11, bold: true });
    y -= 13;
    const facts = printable(factsLine(this.document));
    this.text(this.type.fit(facts, 8.5, this.width), MARGIN, y, {
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
      for (const line of this.type.wrap(printable(note), 7.5, this.width)) {
        this.text(line, MARGIN, this.y, { size: 7.5, muted: true });
        this.y -= 10;
      }
    }
    this.y -= 4;
  }

  private headerRow(table: ReportTable, grid: Layout): void {
    const lines = table.columns.map((col, index) =>
      this.type.wrap(
        printable(col.label),
        grid.size,
        (grid.widths[index] ?? 0) - 4,
        "bold",
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
        const textWidth = this.type.width(line, grid.size, "bold");
        this.type.draw(this.page, line, {
          x: col.kind === "text" ? x + 2 : x + width - 2 - textWidth,
          y: this.y - 3 - (lineIndex + 1) * (grid.size + 1.5) + 1.5,
          size: grid.size,
          weight: "bold",
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
    style: { bold?: boolean; fill?: RGB },
  ): void {
    const weight: FontWeight = style.bold === true ? "bold" : "regular";
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
      const text = this.type.fit(
        values[index] ?? "",
        grid.size,
        width - 4,
        weight,
      );
      if (text.length > 0) {
        const textWidth = this.type.width(text, grid.size, weight);
        this.type.draw(this.page, text, {
          x: col.kind === "text" ? x + 2 : x + width - 2 - textWidth,
          y: this.y - grid.rowHeight + 3.2,
          size: grid.size,
          weight,
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
      this.text(NO_RECORDS, MARGIN + 2, this.y - grid.size, {
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

  /**
   * "Page x of y" and the report on every page; and, when some text could
   * not be printed, a line saying the Excel file has it.
   */
  footers(): void {
    const total = this.pages.length;
    const label = printable(footerLabel(this.document));
    const unprintable = this.type.missing;
    this.pages.forEach((page, index) => {
      this.page = page;
      const pageLabel = `Page ${String(index + 1)} of ${String(total)}`;
      this.text(
        pageLabel,
        page.getWidth() - MARGIN - this.type.width(pageLabel, 7.5),
        MARGIN - 6,
        { size: 7.5, muted: true },
      );
      this.text(label, MARGIN, MARGIN - 6, { size: 7.5, muted: true });
      if (unprintable)
        this.text(UNPRINTABLE_NOTE, MARGIN, MARGIN + 3, {
          size: 7,
          muted: true,
        });
    });
  }
}

const NO_RECORDS = "No records in this period.";

/** What the document prints, by weight, so only the faces it needs are embedded. */
function textsOf(document: ReportDocument): Record<FontWeight, string[]> {
  const { header } = document;
  const format = formatter(header.currency);
  const bold = [header.company, header.title];
  const regular = [
    `Generated at ${header.generatedAt}`,
    factsLine(document),
    footerLabel(document),
    ...document.notes,
    NO_RECORDS,
    UNPRINTABLE_NOTE,
  ];
  for (const table of document.tables) {
    bold.push(table.name, ...table.columns.map((col) => col.label));
    for (const row of table.rows)
      regular.push(
        ...table.columns.map((col, index) => format(row[index] ?? null, col)),
      );
    if (table.totals != null) {
      const totals = table.totals;
      bold.push(
        ...table.columns.map((col, index) =>
          format(totals[index] ?? null, col),
        ),
      );
    }
  }
  return {
    regular: regular.map(printable),
    bold: bold.map(printable),
  };
}

/** Embeds Noto Sans (Latin) and every other face the document's text uses. */
async function embedFonts(
  pdf: PDFDocument,
  document: ReportDocument,
  faces: readonly FontFace[],
): Promise<Map<string, PDFFont>> {
  const texts = textsOf(document);
  const wanted: [string, FontWeight][] = [];
  for (const weight of ["regular", "bold"] as const) {
    const keys = new Set(["latin"]);
    for (const text of texts[weight])
      for (const run of splitRuns(text, faces)) keys.add(run.face);
    for (const key of keys) wanted.push([key, weight]);
  }
  const fonts = await Promise.all(
    wanted.map(([key, weight]) => embedFace(pdf, key, weight)),
  );
  return new Map(
    wanted.map(([key, weight], index) => {
      const font = fonts[index];
      if (font == null) throw new Error("A PDF font did not embed.");
      return [fontKey(key, weight), font];
    }),
  );
}

/**
 * The document as a landscape PDF (A4, A3 for the muster roll): the
 * header on every page, each table paginated with its header row
 * repeated, a totals row, and "Page x of y" (`modules/11` conventions).
 * Text is set in Noto (Latin, ₹ and the Indian scripts); anything else
 * prints as "?" with a footer note pointing at the Excel file.
 */
export async function renderPdf(document: ReportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${document.header.title} - ${document.header.project}`);
  pdf.setAuthor(document.header.company);
  pdf.setCreator("Construction Management");
  registerReportFonts(pdf);
  const faces = await pdfFontFaces();
  const fonts = await embedFonts(pdf, document, faces);
  const writer = new PdfWriter(pdf, new Typesetter(faces, fonts), document);
  document.tables.forEach((table, index) => {
    writer.table(table, index === 0);
  });
  if (document.tables.length === 0) writer.newPage();
  writer.footers();
  return pdf.save();
}
