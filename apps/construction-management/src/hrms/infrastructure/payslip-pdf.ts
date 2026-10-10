import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import {
  embedNotoText,
  type NotoText,
} from "@/src/shared-kernel/pdf/noto-text";

import type { PayslipRenderer } from "../application/salary-run-ports";
import type {
  PayslipDocument,
  PayslipFact,
  PayslipLine,
} from "../domain/payslip";

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 40;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.91, 0.93, 0.97);
const NET_FILL = rgb(0.93, 0.96, 0.93);

function money(currency: string): (paise: number | null) => string {
  const format = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (paise) => (paise == null ? "" : format.format(paise / 100));
}

class PayslipWriter {
  private page!: PDFPage;
  private y = 0;
  private readonly format: (paise: number | null) => string;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly text: NotoText,
    private readonly document: PayslipDocument,
  ) {
    this.format = money(document.currency);
    this.newPage();
  }

  private get width() {
    return WIDTH - MARGIN * 2;
  }

  private newPage(): void {
    this.page = this.pdf.addPage([WIDTH, HEIGHT]);
    this.y = HEIGHT - MARGIN;
  }

  private room(height: number): void {
    if (this.y - height < MARGIN + 24) this.newPage();
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

  header(): void {
    const { document } = this;
    this.y -= 14;
    this.write(this.text.fit(document.company, 16, this.width), MARGIN, {
      size: 16,
      bold: true,
    });
    this.y -= 20;
    this.write(`${document.title} for ${document.monthLabel}`, MARGIN, {
      size: 12,
      bold: true,
    });
    this.write(`Generated ${document.generatedAt}`, 0, {
      size: 8,
      muted: true,
      right: WIDTH - MARGIN,
    });
    this.y -= 13;
    this.write(document.status, MARGIN, { size: 8.5, muted: true });
    this.y -= 10;
    this.rule();
    this.y -= 6;
  }

  /** Label–value pairs, `columns` to a row. */
  facts(title: string, facts: readonly PayslipFact[], columns: number): void {
    this.heading(title);
    const cell = this.width / columns;
    for (let index = 0; index < facts.length; index += columns) {
      this.room(14);
      this.y -= 13;
      facts.slice(index, index + columns).forEach((fact, offset) => {
        const x = MARGIN + offset * cell;
        const label = `${fact.label}: `;
        this.write(label, x, { size: 8.5, muted: true });
        const labelWidth = this.text.width(label, 8.5);
        this.write(
          this.text.fit(fact.value, 8.5, cell - labelWidth - 8, true),
          x + labelWidth,
          { size: 8.5, bold: true },
        );
      });
    }
    this.y -= 6;
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

  /** Lines with an amount column (and a monthly column when any line has one). */
  lines(
    title: string,
    lines: readonly PayslipLine[],
    headings: { monthly?: string; amount: string },
  ): void {
    this.heading(title);
    const amountRight = WIDTH - MARGIN - 6;
    const monthlyRight = amountRight - 120;
    const withMonthly = headings.monthly != null;
    this.y -= 14;
    if (withMonthly && headings.monthly != null)
      this.write(headings.monthly, 0, {
        size: 8,
        muted: true,
        right: monthlyRight,
      });
    this.write(headings.amount, 0, {
      size: 8,
      muted: true,
      right: amountRight,
    });
    for (const line of lines) {
      this.room(16);
      this.y -= 14;
      const bold = line.emphasis === true;
      this.write(
        this.text.fit(line.label, 9, monthlyRight - MARGIN - 110, bold),
        MARGIN + 6,
        { size: 9, bold },
      );
      if (withMonthly && line.monthly != null)
        this.write(this.format(line.monthly), 0, {
          size: 9,
          bold,
          right: monthlyRight,
        });
      if (line.amount != null)
        this.write(this.format(line.amount), 0, {
          size: 9,
          bold,
          right: amountRight,
        });
      if (bold) {
        this.page.drawLine({
          start: { x: MARGIN, y: this.y + 11 },
          end: { x: WIDTH - MARGIN, y: this.y + 11 },
          thickness: 0.4,
          color: RULE,
        });
      }
    }
    this.y -= 4;
  }

  net(): void {
    this.room(40);
    this.y -= 30;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 8,
      width: this.width,
      height: 26,
      color: NET_FILL,
    });
    this.write("Net Payable", MARGIN + 6, { size: 12, bold: true });
    this.write(this.format(this.document.netPayable), 0, {
      size: 12,
      bold: true,
      right: WIDTH - MARGIN - 6,
    });
    this.y -= 8;
  }

  notes(): void {
    this.y -= 10;
    for (const note of this.document.notes) {
      for (const line of this.wrap(note, 8, this.width)) {
        this.room(12);
        this.y -= 11;
        this.write(line, MARGIN, { size: 8, muted: true });
      }
    }
  }

  private wrap(value: string, size: number, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of value.split(" ")) {
      const next = line.length === 0 ? word : `${line} ${word}`;
      if (this.text.width(next, size) <= width || line.length === 0)
        line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line.length > 0) lines.push(line);
    return lines;
  }

  footers(): void {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      const label = `Page ${String(index + 1)} of ${String(pages.length)}`;
      const footer = `${this.document.title} - ${this.document.monthLabel} - computer generated, no signature needed`;
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

function strings(document: PayslipDocument): string[] {
  return [
    document.company,
    document.title,
    document.monthLabel,
    document.status,
    ...document.member.flatMap((fact) => [fact.label, fact.value]),
    ...document.attendance.flatMap((fact) => [fact.label, fact.value]),
    ...document.earnings.map((line) => line.label),
    ...document.deductions.map((line) => line.label),
    ...document.employer.map((line) => line.label),
    ...document.notes,
  ];
}

/**
 * The payslip as an A4 PDF (CM-316): Company, member and month, Attendance
 * Details, Earnings (monthly and this month) down to Gross Earnings,
 * Deductions (PF, ESI, PT, other deductions, Advance Recovered), Net
 * Payable and the employer's contributions. Text is Noto Sans, with the
 * Noto font of any Indian script the names use.
 */
export async function renderPayslipPdf(
  document: PayslipDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${document.title} - ${document.monthLabel}`);
  pdf.setAuthor(document.company);
  pdf.setCreator("Construction Management");
  const text = await embedNotoText(pdf, strings(document));
  const writer = new PayslipWriter(pdf, text, document);
  writer.header();
  writer.facts("Employee", document.member, 2);
  writer.facts("Attendance Details", document.attendance, 3);
  writer.lines("Earnings", document.earnings, {
    monthly: "Monthly",
    amount: "This month",
  });
  writer.lines("Deductions", document.deductions, { amount: "Amount" });
  writer.net();
  writer.lines("Employer contributions (not deducted)", document.employer, {
    amount: "Amount",
  });
  writer.notes();
  writer.footers();
  return pdf.save();
}

export const pdfPayslipRenderer: PayslipRenderer = {
  render: renderPayslipPdf,
};
