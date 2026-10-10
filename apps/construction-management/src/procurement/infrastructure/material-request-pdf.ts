import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

import type { MaterialRequestReadModel } from "../application/material-request-handlers";
import { MATERIAL_REQUEST_STATUS_LABELS } from "../domain/material-request";

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 40;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.91, 0.93, 0.97);

export type MaterialRequestPdfInput = {
  company: string;
  request: MaterialRequestReadModel;
  /** Already formatted in the Company's time zone. */
  generatedAt: string;
};

/** `12.500` as `12.5`. */
function quantity(decimal: string): string {
  return decimal.includes(".")
    ? decimal.replace(/0+$/, "").replace(/\.$/, "")
    : decimal;
}

/** Columns of the materials table: label, width share, right-aligned. */
const COLUMNS = [
  { label: "#", share: 0.05, right: false },
  { label: "Material", share: 0.33, right: false },
  { label: "Unit", share: 0.1, right: false },
  { label: "Ask Qty", share: 0.12, right: true },
  { label: "Delivered", share: 0.12, right: true },
  { label: "Pending", share: 0.12, right: true },
  { label: "Remark", share: 0.16, right: false },
] as const;

class Writer {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly text: NotoText,
  ) {
    this.newPage();
  }

  private get width() {
    return WIDTH - MARGIN * 2;
  }

  private newPage(): void {
    this.page = this.pdf.addPage([WIDTH, HEIGHT]);
    this.y = HEIGHT - MARGIN;
  }

  room(height: number): boolean {
    if (this.y - height >= MARGIN) return false;
    this.newPage();
    return true;
  }

  write(
    value: string,
    x: number,
    options: { size: number; bold?: boolean; muted?: boolean; right?: number },
  ): void {
    const width = this.text.width(value, options.size, options.bold);
    this.text.draw(this.page, value, {
      x: options.right == null ? x : options.right - width,
      y: this.y,
      size: options.size,
      bold: options.bold,
      color: options.muted === true ? MUTED : INK,
    });
  }

  down(by: number): void {
    this.y -= by;
  }

  rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: WIDTH - MARGIN, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
  }

  header(input: MaterialRequestPdfInput): void {
    const { request } = input;
    this.down(14);
    this.write(this.text.fit(input.company, 16, this.width), MARGIN, {
      size: 16,
      bold: true,
    });
    this.down(20);
    this.write(`Material Request ${request.number}`, MARGIN, {
      size: 12,
      bold: true,
    });
    this.write(`Generated ${input.generatedAt}`, 0, {
      size: 8,
      muted: true,
      right: WIDTH - MARGIN,
    });
    this.down(10);
    this.rule();
  }

  facts(facts: readonly [string, string][]): void {
    const cell = this.width / 2;
    for (let index = 0; index < facts.length; index += 2) {
      this.room(16);
      this.down(14);
      facts.slice(index, index + 2).forEach(([label, value], offset) => {
        const x = MARGIN + offset * cell;
        const prefix = `${label}: `;
        this.write(prefix, x, { size: 8.5, muted: true });
        const used = this.text.width(prefix, 8.5);
        this.write(this.text.fit(value, 8.5, cell - used - 8), x + used, {
          size: 8.5,
        });
      });
    }
    this.down(8);
  }

  paragraph(label: string, value: string): void {
    this.room(28);
    this.down(14);
    this.write(`${label}:`, MARGIN, { size: 8.5, muted: true });
    const words = value.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const next = line === "" ? word : `${line} ${word}`;
      if (this.text.width(next, 8.5) > this.width && line !== "") {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line !== "") lines.push(line);
    for (const text of lines) {
      this.room(12);
      this.down(12);
      this.write(text, MARGIN, { size: 8.5 });
    }
  }

  private tableHead(): void {
    this.room(22);
    this.down(18);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: this.width,
      height: 16,
      color: HEAD_FILL,
    });
    let x = MARGIN;
    for (const column of COLUMNS) {
      const width = column.share * this.width;
      this.write(column.label, x + 3, {
        size: 8,
        bold: true,
        right: column.right ? x + width - 3 : undefined,
      });
      x += width;
    }
    this.down(6);
  }

  table(request: MaterialRequestReadModel): void {
    this.tableHead();
    request.items.forEach((item, index) => {
      if (this.room(16)) this.tableHead();
      this.down(14);
      const cells = [
        String(index + 1),
        item.materialName,
        item.uomName,
        quantity(item.askQty),
        quantity(item.deliveredQty),
        quantity(item.pendingQty),
        item.remark ?? "",
      ];
      let x = MARGIN;
      COLUMNS.forEach((column, at) => {
        const width = column.share * this.width;
        const value = this.text.fit(cells[at] ?? "", 8, width - 6);
        this.write(value, x + 3, {
          size: 8,
          right: column.right ? x + width - 3 : undefined,
        });
        x += width;
      });
      this.down(4);
      this.rule();
    });
  }
}

/**
 * The Material Request as an A4 PDF (CM-508, Export Material Request):
 * Company, number and status, the request's facts, then each material
 * with Ask Qty, delivered and pending quantities.
 */
export async function renderMaterialRequestPdf(
  input: MaterialRequestPdfInput,
): Promise<Uint8Array> {
  const { request } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Material Request ${request.number}`);
  pdf.setAuthor(input.company);
  pdf.setCreator("Construction Management");
  const facts: [string, string][] = [
    ["Request ID", request.number],
    ["Request Date", request.requestDate],
    ["Project", request.projectName ?? ""],
    ["Request To", request.storeName ?? ""],
    ["Status", MATERIAL_REQUEST_STATUS_LABELS[request.status]],
    ["Receiver", request.receiverName ?? ""],
    ["Contractor", request.contractor?.name ?? ""],
    ["Department", request.department?.name ?? ""],
  ];
  const strings = [
    input.company,
    ...facts.flat(),
    request.remark ?? "",
    request.closeReason ?? "",
    ...request.items.flatMap((item) => [
      item.materialName,
      item.uomName,
      item.remark ?? "",
    ]),
  ];
  const text = await embedNotoText(pdf, strings);
  const writer = new Writer(pdf, text);
  writer.header(input);
  writer.facts(facts);
  if (request.remark != null) writer.paragraph("Remark", request.remark);
  if (request.closeReason != null)
    writer.paragraph("Closed because", request.closeReason);
  writer.table(request);
  return pdf.save();
}
