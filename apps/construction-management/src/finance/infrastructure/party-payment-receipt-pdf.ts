import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

import type { PaymentView } from "../application/party-payment-handlers";

// A4 portrait.
const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 44;
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

const MODE_LABELS = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
} as const;

export type PartyPaymentReceiptInput = {
  view: PaymentView;
  company: string;
  /** "Rupees … Only" for a paise amount (the Purchase Order's helper). */
  amountInWords: (paise: bigint) => string;
};

type Fact = { label: string; value: string };

class ReceiptWriter {
  private readonly page: PDFPage;
  private y = HEIGHT - MARGIN;

  constructor(
    pdf: PDFDocument,
    private readonly text: NotoText,
  ) {
    this.page = pdf.addPage([WIDTH, HEIGHT]);
  }

  private get width() {
    return WIDTH - MARGIN * 2;
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

  header(company: string, title: string, number: string, day: string): void {
    this.y -= 14;
    this.write(this.text.fit(company, 16, this.width - 190), MARGIN, {
      size: 16,
      bold: true,
    });
    this.write(title, 0, { size: 13, bold: true, right: WIDTH - MARGIN });
    this.y -= 18;
    this.write(number, 0, { size: 10, bold: true, right: WIDTH - MARGIN });
    this.write(`Date: ${day}`, MARGIN, { size: 10 });
    this.y -= 12;
    this.rule();
  }

  paragraph(value: string): void {
    this.y -= 10;
    for (const line of this.wrap(value, 10.5, this.width)) {
      this.y -= 16;
      this.write(line, MARGIN, { size: 10.5 });
    }
    this.y -= 6;
  }

  facts(facts: readonly Fact[]): void {
    const cell = this.width / 2;
    for (let index = 0; index < facts.length; index += 2) {
      this.y -= 15;
      facts.slice(index, index + 2).forEach((fact, offset) => {
        const x = MARGIN + offset * cell;
        const label = `${fact.label}: `;
        this.write(label, x, { size: 9, muted: true });
        const labelWidth = this.text.width(label, 9);
        this.write(
          this.text.fit(fact.value, 9, cell - labelWidth - 10, true),
          x + labelWidth,
          { size: 9, bold: true },
        );
      });
    }
    this.y -= 6;
  }

  allocations(view: PaymentView): void {
    if (view.allocations.length === 0) return;
    this.y -= 18;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: this.width,
      height: 17,
      color: HEAD_FILL,
    });
    const right = WIDTH - MARGIN - 6;
    this.write("Against invoice", MARGIN + 6, { size: 9, bold: true });
    this.write("Invoice date", MARGIN + 260, { size: 9, bold: true });
    this.write("Settled", 0, { size: 9, bold: true, right });
    for (const allocation of view.allocations) {
      this.y -= 15;
      this.write(
        this.text.fit(allocation.invoiceNumber ?? "", 9, 240),
        MARGIN + 6,
        { size: 9 },
      );
      this.write(
        allocation.invoiceDate == null ? "" : date(allocation.invoiceDate),
        MARGIN + 260,
        { size: 9 },
      );
      this.write(money(allocation.amount), 0, { size: 9, right });
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - 5 },
        end: { x: WIDTH - MARGIN, y: this.y - 5 },
        thickness: 0.4,
        color: RULE,
      });
    }
  }

  totals(rows: readonly [string, string][], total: [string, string]): void {
    this.y -= 10;
    const right = WIDTH - MARGIN - 6;
    const labelRight = right - 120;
    for (const [label, value] of rows) {
      this.y -= 14;
      this.write(label, 0, { size: 9.5, muted: true, right: labelRight });
      this.write(value, 0, { size: 9.5, right });
    }
    this.y -= 24;
    this.page.drawRectangle({
      x: labelRight - 150,
      y: this.y - 7,
      width: right - labelRight + 156,
      height: 22,
      color: TOTAL_FILL,
    });
    this.write(total[0], 0, { size: 11, bold: true, right: labelRight });
    this.write(total[1], 0, { size: 11, bold: true, right });
  }

  signatures(left: string, right: string): void {
    this.y = Math.min(this.y - 70, MARGIN + 80);
    const width = 170;
    for (const [x, label] of [
      [MARGIN, left],
      [WIDTH - MARGIN - width, right],
    ] as const) {
      this.page.drawLine({
        start: { x, y: this.y + 14 },
        end: { x: x + width, y: this.y + 14 },
        thickness: 0.6,
        color: RULE,
      });
      this.text.draw(this.page, label, {
        x,
        y: this.y,
        size: 9,
        color: MUTED,
      });
    }
  }

  footer(number: string): void {
    const footer = `${number} - computer generated`;
    this.text.draw(this.page, this.text.fit(footer, 7.5, this.width), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      color: MUTED,
    });
  }
}

function modeLine(view: PaymentView): string {
  const mode = MODE_LABELS[view.mode];
  const ref =
    view.mode === "cheque"
      ? view.chequeNumber == null
        ? ""
        : ` No. ${view.chequeNumber}`
      : view.reference == null
        ? ""
        : ` (ref. ${view.reference})`;
  const when = view.modeDate == null ? "" : ` dated ${date(view.modeDate)}`;
  return `${mode}${ref}${when}`;
}

function against(view: PaymentView): string {
  const numbers = view.allocations
    .map((allocation) => allocation.invoiceNumber)
    .filter((value): value is string => value != null);
  if (numbers.length === 0) return "as an advance";
  const list = numbers.join(", ");
  return view.unallocated > 0n
    ? `against invoice ${list}, the rest as an advance`
    : `against invoice ${list}`;
}

/**
 * A party payment's receipt as an A4 PDF (CM-705, ADR CM-0017 §6): "Received
 * with thanks" for a Payment In, a payment voucher for a Payment Out; the
 * amount in words, mode and reference, the invoices it settles, TDS for a
 * Contractor and the advance left. Noto Sans with any Indian script used.
 */
export async function renderPartyPaymentReceiptPdf(
  input: PartyPaymentReceiptInput,
): Promise<Uint8Array> {
  const { view, company } = input;
  const party = view.partyName ?? "the party";
  const inbound = view.direction === "in";
  const title = inbound ? "Payment Receipt" : "Payment Voucher";
  const words = input.amountInWords(view.amount);
  const sentence = inbound
    ? `Received with thanks from ${party} the sum of ${words} (${money(view.amount)}) by ${modeLine(view)}, ${against(view)}.`
    : `Paid to ${party} the sum of ${words} (${money(view.amount)}) by ${modeLine(view)} from ${view.accountName ?? "the account"}, ${against(view)}.`;
  const facts: Fact[] = [
    {
      label: view.place.kind === "project" ? "Project" : "Store",
      value: view.placeName ?? "",
    },
    { label: inbound ? "Received from" : "Paid to", value: party },
    {
      label: inbound ? "Received into" : "Paid from",
      value: view.accountName ?? "",
    },
    { label: "Mode", value: modeLine(view) },
    ...(view.paymentCategoryName == null
      ? []
      : [{ label: "Category", value: view.paymentCategoryName }]),
    ...(view.paidByName == null
      ? []
      : [
          {
            label: inbound ? "Received by" : "Paid by",
            value: view.paidByName,
          },
        ]),
  ];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} ${view.number}`);
  pdf.setAuthor(company);
  pdf.setCreator("Construction Management");
  const text = await embedNotoText(pdf, [
    company,
    sentence,
    view.remarks ?? "",
    ...facts.map((fact) => fact.value),
  ]);
  const writer = new ReceiptWriter(pdf, text);
  writer.header(company, title, view.number, date(view.paymentDate));
  writer.paragraph(sentence);
  writer.facts(facts);
  writer.allocations(view);
  const rows: [string, string][] = [];
  if (view.tdsAmount > 0n) {
    rows.push([inbound ? "Received" : "Paid", money(view.amount)]);
    rows.push([
      `TDS ${view.tdsSection ?? ""}${view.tdsRate == null ? "" : ` @ ${view.tdsRate}%`}`.trim(),
      money(view.tdsAmount),
    ]);
  }
  const clientDeducted = view.clientTdsAmount + view.gstTdsAmount;
  if (clientDeducted > 0n) {
    // A Client's receipt (CM-1107): what it deducted settles with the money.
    rows.push(["Received", money(view.amount)]);
    if (view.clientTdsAmount > 0n)
      rows.push(["TDS deducted by the Client", money(view.clientTdsAmount)]);
    if (view.gstTdsAmount > 0n)
      rows.push(["GST-TDS deducted by the Client", money(view.gstTdsAmount)]);
  }
  if (view.unallocated > 0n) rows.push(["Advance", money(view.unallocated)]);
  writer.totals(
    rows,
    view.tdsAmount > 0n || clientDeducted > 0n
      ? ["Settled", money(view.settled)]
      : [inbound ? "Received" : "Paid", money(view.amount)],
  );
  if (view.remarks != null) writer.paragraph(`Remarks: ${view.remarks}`);
  writer.signatures(
    inbound ? "Received by" : "Receiver's signature",
    "Authorised signatory",
  );
  writer.footer(view.number);
  return pdf.save();
}
