import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

/**
 * The page writer the Purchase Request and Purchase Order PDFs share
 * (CM-503, CM-504): A4, Noto text so Indian-script names print, wrapped
 * cells, tables whose header repeats on every page.
 */

export const A4 = { width: 595.28, height: 841.89 };
export const MARGIN = 36;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.92, 0.94, 0.97);

export type Column = {
  label: string;
  width: number;
  align?: "left" | "right";
};

export type TextOptions = {
  x?: number;
  size?: number;
  bold?: boolean;
  muted?: boolean;
  /** Right edge for right-aligned text. */
  right?: number;
  /** Wrap within this width. */
  width?: number;
};

export class DocumentPdfWriter {
  private page!: PDFPage;
  y = 0;

  private constructor(
    readonly pdf: PDFDocument,
    private readonly noto: NotoText,
  ) {
    this.newPage();
  }

  /** Embeds the fonts every string in `texts` needs. */
  static async create(
    title: string,
    texts: readonly string[],
  ): Promise<DocumentPdfWriter> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(title);
    pdf.setCreator("Construction Management");
    const noto = await embedNotoText(pdf, [title, ...texts]);
    return new DocumentPdfWriter(pdf, noto);
  }

  get contentWidth(): number {
    return A4.width - MARGIN * 2;
  }

  get right(): number {
    return A4.width - MARGIN;
  }

  newPage(): void {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  /** Starts a new page unless `height` fits above the bottom margin. */
  room(height: number): boolean {
    if (this.y - height < MARGIN) {
      this.newPage();
      return true;
    }
    return false;
  }

  down(by: number): void {
    this.y -= by;
  }

  /** Lines of `value` that fit `width` at `size`, breaking at spaces. */
  wrap(value: string, width: number, size: number, bold = false): string[] {
    const out: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter((word) => word !== "");
      if (words.length === 0) {
        out.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (this.noto.width(candidate, size, bold) <= width) {
          line = candidate;
          continue;
        }
        if (line !== "") out.push(line);
        line =
          this.noto.width(word, size, bold) <= width
            ? word
            : this.noto.fit(word, size, width, bold);
      }
      out.push(line);
    }
    return out;
  }

  /** Draws one line at the current y (no wrapping, no move). */
  text(value: string, options: TextOptions = {}): void {
    const size = options.size ?? 9;
    const bold = options.bold === true;
    const x =
      options.right == null
        ? (options.x ?? MARGIN)
        : options.right - this.noto.width(value, size, bold);
    this.noto.draw(this.page, value, {
      x,
      y: this.y,
      size,
      bold,
      color: options.muted === true ? MUTED : INK,
    });
  }

  /** Wrapped lines from the current y down; returns the height used. */
  paragraph(value: string, options: TextOptions = {}): number {
    const size = options.size ?? 9;
    const width = options.width ?? this.contentWidth;
    const lines = this.wrap(value, width, size, options.bold === true);
    const lineHeight = size + 3;
    for (const line of lines) {
      this.room(lineHeight);
      this.text(line, options);
      this.down(lineHeight);
    }
    return lines.length * lineHeight;
  }

  /** Label and value pairs in two columns. */
  facts(pairs: readonly [string, string][], columns = 2): void {
    const width = this.contentWidth / columns;
    for (let index = 0; index < pairs.length; index += columns) {
      const row = pairs.slice(index, index + columns);
      const heights = row.map(
        ([, value]) =>
          this.wrap(value === "" ? "—" : value, width - 8, 9).length,
      );
      const height = 11 + Math.max(1, ...heights) * 12;
      this.room(height);
      const top = this.y;
      row.forEach(([label, value], column) => {
        const x = MARGIN + column * width;
        this.y = top;
        this.text(label, { x, size: 7.5, muted: true });
        this.down(11);
        this.paragraph(value === "" ? "—" : value, { x, width: width - 8 });
      });
      this.y = top - height - 2;
    }
  }

  rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.right, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
  }

  heading(value: string): void {
    this.room(24);
    this.down(6);
    this.text(value, { size: 10.5, bold: true });
    this.down(14);
  }

  private tableHeader(columns: readonly Column[]): void {
    const height = 16;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height + 4,
      width: this.contentWidth,
      height,
      color: HEAD_FILL,
    });
    let x = MARGIN;
    this.down(8);
    for (const column of columns) {
      this.text(column.label, {
        size: 7.5,
        bold: true,
        ...(column.align === "right"
          ? { right: x + column.width - 3 }
          : { x: x + 3 }),
      });
      x += column.width;
    }
    this.down(12);
  }

  /** A table; cells wrap, the header repeats on each new page. */
  table(columns: readonly Column[], rows: readonly string[][]): void {
    this.room(40);
    this.tableHeader(columns);
    const size = 8;
    const lineHeight = size + 3;
    for (const row of rows) {
      const cells = columns.map((column, index) =>
        this.wrap(row[index] ?? "", column.width - 6, size),
      );
      const height =
        Math.max(...cells.map((lines) => lines.length)) * lineHeight + 4;
      if (this.room(height)) this.tableHeader(columns);
      const top = this.y;
      let x = MARGIN;
      columns.forEach((column, index) => {
        this.y = top;
        for (const line of cells[index] ?? []) {
          this.text(line, {
            size,
            ...(column.align === "right"
              ? { right: x + column.width - 3 }
              : { x: x + 3 }),
          });
          this.down(lineHeight);
        }
        x += column.width;
      });
      this.y = top - height;
      this.rule();
      this.down(lineHeight - 2);
    }
  }

  /** Right-aligned label and amount rows under a table. */
  totals(rows: readonly [string, string, boolean?][]): void {
    for (const [label, value, strong] of rows) {
      this.room(14);
      this.text(label, { right: this.right - 110, bold: strong === true });
      this.text(value, { right: this.right, bold: strong === true });
      this.down(strong === true ? 15 : 13);
    }
  }

  /** Page numbers in the footer, then the bytes. */
  async save(footer: string): Promise<Uint8Array> {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      const label = `${footer} · Page ${String(index + 1)} of ${String(pages.length)}`;
      this.noto.draw(page, label, {
        x: MARGIN,
        y: MARGIN / 2,
        size: 7,
        color: MUTED,
      });
    });
    return this.pdf.save();
  }
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-10-10` → `10 Oct 2026`. */
export function printDate(value: string | null): string {
  if (value == null) return "";
  return dateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

const rupees = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Paise as `1,23,456.78` (Indian grouping, no symbol). */
export function printMoney(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const grouped = rupees.format(Number(whole)).split(".")[0] ?? "0";
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

/** `12.500` → `12.5`, `10.000` → `10`. */
export function printQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
