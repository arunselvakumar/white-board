import { PDFDocument, rgb, type PDFImage, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

import type { DprRenderer } from "../application/ports";
import type {
  DprBlock,
  DprColumn,
  DprDocument,
  DprImageRef,
} from "../domain/daily-progress-report";

/**
 * The Daily Progress Report PDF (CM-606): A4 portrait, Noto text so names,
 * remarks and notes in Indian scripts print, a running header and "Page x
 * of y" on every page, tables whose header repeats, and a photo grid with
 * captions. Modelled on procurement's `DocumentPdfWriter`; reporting keeps
 * its own copy because contexts do not import each other.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 36;
/** Room the running header takes on pages after the first. */
const RUNNING_HEADER = 22;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.92, 0.94, 0.97);
const BAND_FILL = rgb(0.95, 0.96, 0.98);
const PHOTO_COLUMNS = 3;
const PHOTO_HEIGHT = 128;
const PHOTO_GAP = 10;

/** An image pdf-lib can embed. */
export type PrintableImage = { bytes: Uint8Array; format: "jpeg" | "png" };

/** Loads a stored image (logo or photo) ready to embed; null when it cannot. */
export type DprImageLoader = (
  ref: DprImageRef,
  use: "logo" | "photo",
) => Promise<PrintableImage | null>;

type TextOptions = {
  x?: number;
  size?: number;
  bold?: boolean;
  muted?: boolean;
  right?: number;
};

class DprPdfWriter {
  private page!: PDFPage;
  y = 0;

  private constructor(
    readonly pdf: PDFDocument,
    private readonly noto: NotoText,
  ) {
    this.newPage();
  }

  static async create(
    title: string,
    texts: readonly string[],
  ): Promise<DprPdfWriter> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(title);
    pdf.setCreator("Construction Management");
    const noto = await embedNotoText(pdf, [title, ...texts]);
    return new DprPdfWriter(pdf, noto);
  }

  get contentWidth(): number {
    return A4.width - MARGIN * 2;
  }

  get right(): number {
    return A4.width - MARGIN;
  }

  newPage(): void {
    const first = this.pdf.getPageCount() === 0;
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN - (first ? 0 : RUNNING_HEADER);
  }

  /** Starts a new page unless `height` fits above the footer. */
  room(height: number): boolean {
    if (this.y - height < MARGIN + 10) {
      this.newPage();
      return true;
    }
    return false;
  }

  down(by: number): void {
    this.y -= by;
  }

  /** Lines of `value` that fit `width` at `size`, breaking at spaces and newlines. */
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

  text(value: string, options: TextOptions = {}, page = this.page): void {
    const size = options.size ?? 9;
    const bold = options.bold === true;
    const x =
      options.right == null
        ? (options.x ?? MARGIN)
        : options.right - this.noto.width(value, size, bold);
    this.noto.draw(page, value, {
      x,
      y: this.y,
      size,
      bold,
      color: options.muted === true ? MUTED : INK,
    });
  }

  paragraph(
    value: string,
    options: TextOptions & { width?: number } = {},
  ): void {
    const size = options.size ?? 9;
    const width = options.width ?? this.contentWidth;
    const lineHeight = size + 3;
    for (const line of this.wrap(value, width, size, options.bold === true)) {
      this.room(lineHeight);
      this.text(line, options);
      this.down(lineHeight);
    }
  }

  rule(y = this.y): void {
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: this.right, y },
      thickness: 0.5,
      color: RULE,
    });
  }

  /** A section heading, kept with the start of what follows it. */
  heading(value: string): void {
    this.room(84);
    this.down(8);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: this.contentWidth,
      height: 17,
      color: BAND_FILL,
    });
    this.text(value, { x: MARGIN + 4, size: 10.5, bold: true });
    this.down(20);
  }

  subheading(value: string): void {
    this.room(64);
    this.down(2);
    this.text(value, { size: 8.5, bold: true, muted: true });
    this.down(16);
  }

  facts(pairs: readonly [string, string][], columns = 2): void {
    const width = this.contentWidth / columns;
    for (let index = 0; index < pairs.length; index += columns) {
      const row = pairs.slice(index, index + columns);
      const heights = row.map(
        ([, value]) => this.wrap(value, width - 8, 9).length,
      );
      const height = 11 + Math.max(1, ...heights) * 12;
      this.room(height);
      const top = this.y;
      row.forEach(([label, value], column) => {
        const x = MARGIN + column * width;
        this.y = top;
        this.text(label, { x, size: 7.5, muted: true });
        this.down(11);
        for (const line of this.wrap(value, width - 8, 9)) {
          this.text(line, { x });
          this.down(12);
        }
      });
      this.y = top - height - 2;
    }
  }

  private widths(columns: readonly DprColumn[]): number[] {
    const total = columns.reduce((all, column) => all + column.width, 0);
    return columns.map((column) => (column.width / total) * this.contentWidth);
  }

  private tableHeader(columns: readonly DprColumn[], widths: number[]): void {
    const size = 7.5;
    const lines = columns.map((column, index) =>
      this.wrap(column.label, (widths[index] ?? 0) - 6, size, true),
    );
    const height = Math.max(...lines.map((cell) => cell.length)) * 10 + 7;
    const top = this.y;
    // The band runs from just above the first line to below the last.
    this.page.drawRectangle({
      x: MARGIN,
      y: top + 9 - height,
      width: this.contentWidth,
      height,
      color: HEAD_FILL,
    });
    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index] ?? 0;
      this.y = top;
      for (const line of lines[index] ?? []) {
        this.text(line, {
          size,
          bold: true,
          ...(column.align === "right"
            ? { right: x + width - 3 }
            : { x: x + 3 }),
        });
        this.down(10);
      }
      x += width;
    });
    this.y = top + 9 - height - 11;
  }

  table(
    columns: readonly DprColumn[],
    rows: readonly string[][],
    totals?: readonly string[],
  ): void {
    const widths = this.widths(columns);
    this.room(44);
    this.tableHeader(columns, widths);
    const size = 7.5;
    const lineHeight = size + 3;
    const all: { cells: readonly string[]; bold: boolean }[] = [
      ...rows.map((cells) => ({ cells, bold: false })),
      ...(totals == null ? [] : [{ cells: totals, bold: true }]),
    ];
    for (const { cells, bold } of all) {
      const lines = columns.map((_, index) =>
        this.wrap(cells[index] ?? "", (widths[index] ?? 0) - 6, size, bold),
      );
      const height =
        Math.max(1, ...lines.map((cell) => cell.length)) * lineHeight + 4;
      if (this.room(height)) this.tableHeader(columns, widths);
      const top = this.y;
      let x = MARGIN;
      columns.forEach((column, index) => {
        const width = widths[index] ?? 0;
        this.y = top;
        for (const line of lines[index] ?? []) {
          this.text(line, {
            size,
            bold,
            ...(column.align === "right"
              ? { right: x + width - 3 }
              : { x: x + 3 }),
          });
          this.down(lineHeight);
        }
        x += width;
      });
      this.y = top - height;
      this.rule(this.y + lineHeight - 2);
      this.down(2);
    }
    this.down(6);
  }

  /** An image scaled into a box, centred, aspect kept. */
  image(
    image: PDFImage,
    x: number,
    top: number,
    width: number,
    height: number,
  ): void {
    const scale = Math.min(width / image.width, height / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    this.page.drawImage(image, {
      x: x + (width - w) / 2,
      y: top - height + (height - h) / 2,
      width: w,
      height: h,
    });
  }

  photos(items: readonly { image: PDFImage | null; caption: string }[]): void {
    const width =
      (this.contentWidth - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;
    for (let index = 0; index < items.length; index += PHOTO_COLUMNS) {
      const row = items.slice(index, index + PHOTO_COLUMNS);
      const captions = row.map((item) =>
        this.wrap(item.caption, width, 7).slice(0, 2),
      );
      const height =
        PHOTO_HEIGHT + 4 + Math.max(...captions.map((c) => c.length)) * 9 + 8;
      this.room(height);
      const top = this.y;
      row.forEach((item, column) => {
        const x = MARGIN + column * (width + PHOTO_GAP);
        this.page.drawRectangle({
          x,
          y: top - PHOTO_HEIGHT,
          width,
          height: PHOTO_HEIGHT,
          borderColor: RULE,
          borderWidth: 0.5,
        });
        if (item.image == null) {
          this.y = top - PHOTO_HEIGHT / 2;
          this.text("Image not available", { x: x + 8, size: 7, muted: true });
        } else this.image(item.image, x, top, width, PHOTO_HEIGHT);
        this.y = top - PHOTO_HEIGHT - 10;
        for (const line of captions[column] ?? []) {
          this.text(line, { x, size: 7, muted: true });
          this.down(9);
        }
      });
      this.y = top - height;
    }
  }

  /** The running header on every page but the first, then the footers. */
  finish(running: string, footer: string): void {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      if (index > 0) {
        this.y = A4.height - MARGIN + 4;
        this.text(running, { size: 7.5, muted: true }, page);
        page.drawLine({
          start: { x: MARGIN, y: A4.height - MARGIN - 4 },
          end: { x: this.right, y: A4.height - MARGIN - 4 },
          thickness: 0.5,
          color: RULE,
        });
      }
      this.y = MARGIN / 2;
      this.text(
        `${footer} · Page ${String(index + 1)} of ${String(pages.length)}`,
        { size: 7, muted: true },
        page,
      );
    });
  }
}

/** Every string the document prints, so the Noto fonts it needs are embedded. */
export function dprTexts(document: DprDocument): string[] {
  const texts: string[] = Object.values(document.header).flatMap((value) =>
    typeof value === "string" ? [value] : [],
  );
  for (const [label, value] of document.header.facts ?? [])
    texts.push(label, value);
  for (const section of document.sections) {
    texts.push(section.title);
    for (const block of section.blocks) texts.push(...blockTexts(block));
  }
  return texts;
}

function blockTexts(block: DprBlock): string[] {
  switch (block.type) {
    case "facts":
      return block.facts.flat();
    case "table":
      return [
        block.title ?? "",
        ...block.columns.map((column) => column.label),
        ...block.rows.flat(),
        ...(block.totals ?? []),
      ];
    case "text":
      return [block.text];
    case "photos":
      return [
        ...block.photos.map((photo) => photo.caption),
        "Image not available",
      ];
  }
}

async function embed(
  pdf: PDFDocument,
  image: PrintableImage | null,
): Promise<PDFImage | null> {
  if (image == null) return null;
  try {
    return image.format === "png"
      ? await pdf.embedPng(image.bytes)
      : await pdf.embedJpg(image.bytes);
  } catch {
    return null;
  }
}

/** Runs `work` over `items` with at most `limit` at a time, in order. */
async function inBatches<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let index = 0; index < items.length; index += limit)
    out.push(
      ...(await Promise.all(items.slice(index, index + limit).map(work))),
    );
  return out;
}

/** The DPR renderer, loading the logo and photos with `images`. */
export function createDprRenderer(images: DprImageLoader): DprRenderer {
  return async (document) => {
    const header = document.header;
    const reference = header.reference ?? header.number;
    const w = await DprPdfWriter.create(
      `${document.title} ${reference}`,
      dprTexts(document),
    );
    const logo =
      header.logo == null
        ? null
        : await embed(
            w.pdf,
            await images(header.logo, "logo").catch(() => null),
          );

    // Header block.
    const top = w.y;
    let textX = MARGIN;
    if (logo != null) {
      w.image(logo, MARGIN, top + 4, 64, 48);
      textX = MARGIN + 74;
    }
    w.text(header.company, { x: textX, size: 13, bold: true });
    w.down(16);
    w.text(document.title, { x: textX, size: 11 });
    w.down(14);
    w.text(header.project, { x: textX, size: 9.5, bold: true });
    w.down(12);
    if (header.address != null && header.address.trim() !== "")
      w.paragraph(header.address, {
        x: textX,
        size: 8.5,
        muted: true,
        width: w.right - textX,
      });
    w.y = Math.min(w.y, top - 52) - 6;
    w.facts(
      header.facts ?? [
        ["DPR number", header.number],
        ["Date", header.date],
        ["Report filled by", header.filledBy],
      ],
      3,
    );
    w.rule();
    w.down(4);

    for (const section of document.sections) {
      w.heading(section.title);
      for (const block of section.blocks)
        switch (block.type) {
          case "facts":
            w.facts(block.facts);
            break;
          case "table":
            if (block.title != null) w.subheading(block.title);
            w.table(block.columns, block.rows, block.totals);
            break;
          case "text":
            w.paragraph(block.text, { muted: block.muted === true });
            w.down(4);
            break;
          case "photos": {
            const loaded = await inBatches(block.photos, 6, (photo) =>
              images(photo, "photo").catch(() => null),
            );
            const items: { image: PDFImage | null; caption: string }[] = [];
            for (const [index, photo] of block.photos.entries())
              items.push({
                image: await embed(w.pdf, loaded[index] ?? null),
                caption: photo.caption,
              });
            w.photos(items);
            break;
          }
        }
    }

    w.finish(
      `${header.company} · ${header.project} · ${header.reference ?? `${header.number} · ${header.date}`}`,
      `${document.title} ${reference}`,
    );
    return w.pdf.save();
  };
}
