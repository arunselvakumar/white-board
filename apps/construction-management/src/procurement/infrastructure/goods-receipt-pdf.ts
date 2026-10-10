import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

import type { GoodsReceiptView } from "../application/goods-receipt-handlers";
import {
  addQuantities,
  excessQuantity,
  type GrnOptionalField,
} from "../domain/goods-receipt";

// A4 landscape: the line table needs the width.
const WIDTH = 841.89;
const HEIGHT = 595.28;
const MARGIN = 40;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.91, 0.93, 0.97);
const TOTAL_FILL = rgb(0.93, 0.96, 0.93);

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(paise: bigint): string {
  return rupees.format(Number(paise) / 100);
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function date(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

/** `12.500` → `12.5`, `40.000` → `40`. */
function qty(value: string): string {
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}

function percent(value: string): string {
  return `${qty(value)}%`;
}

export type GoodsReceiptPdfInput = {
  view: GoodsReceiptView;
  company: string;
  /** Rates, amounts and the invoice amount print only with Financial. */
  financial: boolean;
};

type Fact = { label: string; value: string };

type Column = {
  heading: string;
  width: number;
  align: "left" | "right";
  value: (line: GoodsReceiptView["lines"][number]) => string;
};

function received(line: GoodsReceiptView["lines"][number]) {
  return line.orderedQty == null
    ? null
    : addQuantities(line.receivedElsewhereQty ?? "0", line.receivedQty);
}

function columns(input: GoodsReceiptPdfInput): Column[] {
  const withOrder = input.view.purchaseOrderId != null;
  const fixed: Column[] = [
    {
      heading: "#",
      width: 20,
      align: "left",
      value: (line) => String(line.position),
    },
    {
      heading: "Material",
      width: 0,
      align: "left",
      value: (line) => line.materialName,
    },
    {
      heading: "HSN",
      width: 46,
      align: "left",
      value: (line) => line.hsnCode ?? "",
    },
  ];
  if (withOrder)
    fixed.push(
      {
        heading: "Ordered",
        width: 58,
        align: "right",
        value: (line) => (line.orderedQty == null ? "" : qty(line.orderedQty)),
      },
      {
        heading: "Excess",
        width: 52,
        align: "right",
        value: (line) => {
          const total = received(line);
          if (line.orderedQty == null || total == null) return "";
          const excess = excessQuantity(line.orderedQty, total);
          return excess == null ? "" : qty(excess);
        },
      },
    );
  fixed.push(
    {
      heading: "Received",
      width: 62,
      align: "right",
      value: (line) => qty(line.receivedQty),
    },
    { heading: "Unit", width: 40, align: "left", value: (line) => line.uomName },
  );
  if (input.financial)
    fixed.push(
      {
        heading: "Rate",
        width: 66,
        align: "right",
        value: (line) => money(line.unitRate),
      },
      {
        heading: "Taxable",
        width: 76,
        align: "right",
        value: (line) => money(line.amounts.taxable),
      },
      {
        heading: "GST",
        width: 40,
        align: "right",
        value: (line) => percent(line.gstRate),
      },
      {
        heading: "Tax",
        width: 66,
        align: "right",
        value: (line) =>
          money(line.amounts.cgst + line.amounts.sgst + line.amounts.igst),
      },
      {
        heading: "Total",
        width: 78,
        align: "right",
        value: (line) => money(line.amounts.total),
      },
    );
  const used = fixed.reduce((sum, column) => sum + column.width, 0);
  const material = fixed[1];
  if (material != null) material.width = WIDTH - MARGIN * 2 - used;
  return fixed;
}

function shown(
  view: GoodsReceiptView,
  field: GrnOptionalField,
  value: string | null,
): Fact[] {
  return view.hiddenFields.has(field) || value == null
    ? []
    : [{ label: LABELS[field], value }];
}

const LABELS: Record<GrnOptionalField, string> = {
  invoiceNo: "Invoice No",
  invoiceDate: "Invoice Date",
  invoiceAmount: "Invoice Amount",
  deliveryChallanNo: "Delivery Challan No",
  grnDcNo: "GRN/DC No",
  vehicleNo: "Vehicle No",
  driverName: "Driver name",
  driverMobile: "Driver mobile",
  ewayBillNo: "E-way bill No",
  remark: "Remark",
};

function supplierFacts(input: GoodsReceiptPdfInput): Fact[] {
  const { view } = input;
  const d = view.details;
  return [
    ...shown(view, "invoiceNo", d.invoiceNo),
    ...shown(
      view,
      "invoiceDate",
      d.invoiceDate == null ? null : date(d.invoiceDate),
    ),
    ...(input.financial
      ? shown(
          view,
          "invoiceAmount",
          d.invoiceAmount == null ? null : money(d.invoiceAmount),
        )
      : []),
  ];
}

function deliveryFacts(view: GoodsReceiptView): Fact[] {
  const d = view.details;
  return [
    ...shown(view, "deliveryChallanNo", d.deliveryChallanNo),
    ...shown(view, "grnDcNo", d.grnDcNo),
    ...shown(view, "vehicleNo", d.vehicleNo),
    ...shown(view, "driverName", d.driverName),
    ...shown(view, "driverMobile", d.driverMobile),
    ...shown(view, "ewayBillNo", d.ewayBillNo),
  ];
}

class GoodsReceiptWriter {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly text: NotoText,
    private readonly input: GoodsReceiptPdfInput,
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

  private room(height: number): boolean {
    if (this.y - height >= MARGIN + 24) return false;
    this.newPage();
    return true;
  }

  private write(
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

  private rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: WIDTH - MARGIN, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
  }

  private heading(title: string): void {
    this.room(40);
    this.y -= 18;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: this.width,
      height: 17,
      color: HEAD_FILL,
    });
    this.write(title, MARGIN + 6, { size: 10, bold: true });
  }

  header(): void {
    const { view, company } = this.input;
    this.y -= 14;
    this.write(this.text.fit(company, 16, this.width - 220), MARGIN, {
      size: 16,
      bold: true,
    });
    this.write("Goods Receipt Note", 0, {
      size: 13,
      bold: true,
      right: WIDTH - MARGIN,
    });
    this.y -= 18;
    this.write(view.number, 0, {
      size: 10,
      bold: true,
      right: WIDTH - MARGIN,
    });
    const place = view.location.kind === "project" ? "Project" : "Store";
    this.write(
      this.text.fit(
        `${place}: ${view.locationName ?? ""}`,
        10,
        this.width - 220,
      ),
      MARGIN,
      { size: 10 },
    );
    this.y -= 10;
    this.rule();
  }

  facts(title: string, facts: readonly Fact[], columns: number): void {
    if (facts.length === 0) return;
    this.heading(title);
    const cell = this.width / columns;
    for (let index = 0; index < facts.length; index += columns) {
      this.room(14);
      this.y -= 14;
      facts.slice(index, index + columns).forEach((fact, offset) => {
        const x = MARGIN + 6 + offset * cell;
        const label = `${fact.label}: `;
        this.write(label, x, { size: 8.5, muted: true });
        const labelWidth = this.text.width(label, 8.5);
        this.write(
          this.text.fit(fact.value, 8.5, cell - labelWidth - 12, true),
          x + labelWidth,
          { size: 8.5, bold: true },
        );
      });
    }
    this.y -= 4;
  }

  private tableHead(cols: readonly Column[]): void {
    this.y -= 16;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: this.width,
      height: 17,
      color: HEAD_FILL,
    });
    let x = MARGIN;
    for (const column of cols) {
      this.cell(column.heading, x, column, { bold: true, size: 8 });
      x += column.width;
    }
  }

  private cell(
    value: string,
    x: number,
    column: Column,
    options: { bold?: boolean; size: number },
  ): void {
    const fitted = this.text.fit(
      value,
      options.size,
      column.width - 8,
      options.bold,
    );
    if (column.align === "right")
      this.write(fitted, 0, { ...options, right: x + column.width - 4 });
    else this.write(fitted, x + 4, options);
  }

  lines(): void {
    const cols = columns(this.input);
    this.room(60);
    this.y -= 8;
    this.tableHead(cols);
    for (const line of this.input.view.lines) {
      if (this.room(16)) this.tableHead(cols);
      this.y -= 15;
      let x = MARGIN;
      for (const column of cols) {
        this.cell(column.value(line), x, column, { size: 8.5 });
        x += column.width;
      }
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - 5 },
        end: { x: WIDTH - MARGIN, y: this.y - 5 },
        thickness: 0.4,
        color: RULE,
      });
    }
  }

  totals(): void {
    if (!this.input.financial) return;
    const { view } = this.input;
    const t = view.totals;
    const rows: [string, string][] = [["Taxable value", money(t.taxableTotal)]];
    if (view.supplyType === "intra_state")
      rows.push(["CGST", money(t.cgstTotal)], ["SGST", money(t.sgstTotal)]);
    else rows.push(["IGST", money(t.igstTotal)]);
    this.room(20 * (rows.length + 2));
    this.y -= 8;
    const right = WIDTH - MARGIN - 6;
    const labelRight = right - 120;
    for (const [label, value] of rows) {
      this.y -= 14;
      this.write(label, 0, { size: 9, muted: true, right: labelRight });
      this.write(value, 0, { size: 9, right });
    }
    this.y -= 22;
    this.page.drawRectangle({
      x: labelRight - 160,
      y: this.y - 7,
      width: right - labelRight + 166,
      height: 22,
      color: TOTAL_FILL,
    });
    this.write("GRN value", 0, { size: 11, bold: true, right: labelRight });
    this.write(money(t.totalValue), 0, { size: 11, bold: true, right });
    this.y -= 6;
  }

  remark(): void {
    const { view } = this.input;
    const remark = view.details.remark;
    if (remark == null || view.hiddenFields.has("remark")) return;
    this.heading("Remark");
    for (const line of this.wrap(remark, 9, this.width - 12)) {
      this.room(13);
      this.y -= 13;
      this.write(line, MARGIN + 6, { size: 9 });
    }
  }

  private wrap(value: string, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line.length === 0 ? word : `${line} ${word}`;
        if (this.text.width(next, size) <= width || line.length === 0)
          line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  footers(): void {
    const pages = this.pdf.getPages();
    const { view } = this.input;
    pages.forEach((page, index) => {
      const label = `Page ${String(index + 1)} of ${String(pages.length)}`;
      const footer = `${view.number} - computer generated, no signature needed`;
      this.text.draw(page, this.text.fit(footer, 7.5, this.width - 80), {
        x: MARGIN,
        y: MARGIN - 14,
        size: 7.5,
        color: MUTED,
      });
      this.text.draw(page, label, {
        x: WIDTH - MARGIN - this.text.width(label, 7.5),
        y: MARGIN - 14,
        size: 7.5,
        color: MUTED,
      });
    });
  }
}

function supplyLabel(view: GoodsReceiptView): string {
  return view.supplyType === "intra_state"
    ? "Intra-state (CGST + SGST)"
    : "Inter-state (IGST)";
}

/**
 * The GRN as an A4 landscape PDF (CM-505): Company, number and dates, the
 * location, supplier and PO, Supplier details and Delivery details (the
 * Company's hidden fields left out), the lines with ordered, received and
 * excess, and with Financial the rates, the tax split and the GRN value.
 * Noto Sans, with the Noto font of any Indian script the names use.
 */
export async function renderGoodsReceiptPdf(
  input: GoodsReceiptPdfInput,
): Promise<Uint8Array> {
  const { view } = input;
  const general: Fact[] = [
    { label: "GR Date", value: date(view.receiptDate) },
    { label: "Inventory Date", value: date(view.inventoryDate) },
    { label: "Supplier", value: view.supplierName },
    {
      label: "Purchase Order",
      value: view.purchaseOrder?.number ?? "Without PO",
    },
    { label: "Supply", value: supplyLabel(view) },
    { label: "Received by", value: view.createdByName ?? "" },
  ];
  const supplier = supplierFacts(input);
  const delivery = deliveryFacts(view);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Goods Receipt ${view.number}`);
  pdf.setAuthor(input.company);
  pdf.setCreator("Construction Management");
  const text = await embedNotoText(pdf, [
    input.company,
    view.locationName ?? "",
    view.supplierName,
    view.details.remark ?? "",
    view.details.driverName ?? "",
    ...view.lines.map((line) => `${line.materialName} ${line.uomName}`),
    ...[...general, ...supplier, ...delivery].map((fact) => fact.value),
  ]);
  const writer = new GoodsReceiptWriter(pdf, text, input);
  writer.header();
  writer.facts("Goods Receipt", general, 3);
  writer.facts("Supplier details", supplier, 3);
  writer.facts("Delivery details", delivery, 3);
  writer.lines();
  writer.totals();
  writer.remark();
  writer.footers();
  return pdf.save();
}
