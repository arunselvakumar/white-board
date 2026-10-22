import {
  MARGIN,
  printDate,
  printMoney,
  printQuantity,
  type Column,
  type DocumentPdfWriter,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import { quantityText } from "../domain/boq";
import {
  DEDUCTION_KIND_LABELS,
  type DeductionKind,
} from "../domain/contract-terms";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

/**
 * The PDF pieces both RA bill sides print (CM-1106, CM-1107): the
 * letterhead, the abstract (previous / this / cumulative and amount), the
 * value-to-date totals, the measurement detail, the GST rows, the
 * deductions and the signature blocks.
 */

/** `18.00` → `18`, `2.50` → `2.5`. */
export function pdfPercent(value: bigint | null): string {
  if (value == null) return "";
  return fixedDecimal(value, PERCENT_SCALE).replace(/\.?0+$/, "");
}

export function pdfQuantity(value: bigint | null): string {
  return value == null ? "" : printQuantity(quantityText(value));
}

export function pdfRupees(paise: bigint): string {
  return `₹${printMoney(paise)}`;
}

export function pdfMinus(paise: bigint): string {
  return `− ₹${printMoney(paise)}`;
}

export function billLetterhead(
  w: DocumentPdfWriter,
  company: WorkOrderPdfCompany,
  title: string,
  number: string,
): void {
  const top = w.y;
  w.text(title, { right: w.right, size: 15, bold: true });
  w.down(16);
  w.text(number, { right: w.right, size: 10, bold: true });
  w.y = top;
  w.paragraph(company.name, {
    size: 13,
    bold: true,
    width: w.contentWidth * 0.6,
  });
  const lines = [
    company.address ?? "",
    [company.mobile, company.email].filter((v) => v != null).join(" · "),
    company.gstin == null ? "" : `GSTIN: ${company.gstin}`,
  ].filter((line) => line !== "");
  for (const line of lines)
    w.paragraph(line, { muted: true, width: w.contentWidth * 0.6 });
  w.down(6);
  w.rule();
  w.down(14);
}

/** A line of the abstract as both sides print it. */
export type AbstractLine = {
  itemNo: string | null;
  description: string;
  uomName: string;
  rate: bigint;
  previousQuantity: bigint;
  quantity: bigint;
  cumulativeQuantity: bigint;
  amount: bigint;
};

/**
 * Part 1, the abstract: item, description, UoM, (rate,) previous / this /
 * cumulative and (amount). `mark` adds a note under a line's description
 * (a Client Bill's deviation).
 */
export function abstractTable(
  w: DocumentPdfWriter,
  lines: readonly AbstractLine[],
  financial: boolean,
  mark: (line: AbstractLine, index: number) => string | null = () => null,
): void {
  const width = w.contentWidth;
  const columns: Column[] = financial
    ? [
        { label: "Item", width: 36 },
        {
          label: "Description",
          width: width - 36 - 32 - 54 - 50 - 50 - 54 - 66,
        },
        { label: "UoM", width: 32 },
        { label: "Rate (₹)", width: 54, align: "right" },
        { label: "Previous", width: 50, align: "right" },
        { label: "This bill", width: 50, align: "right" },
        { label: "Cumulative", width: 54, align: "right" },
        { label: "Amount (₹)", width: 66, align: "right" },
      ]
    : [
        { label: "Item", width: 44 },
        { label: "Description", width: width - 44 - 40 - 70 - 70 - 70 },
        { label: "UoM", width: 40 },
        { label: "Previous", width: 70, align: "right" },
        { label: "This bill", width: 70, align: "right" },
        { label: "Cumulative", width: 70, align: "right" },
      ];
  w.table(
    columns,
    lines.map((line, index) => {
      const note = mark(line, index);
      const head = [
        line.itemNo ?? "",
        note == null ? line.description : `${line.description}\n${note}`,
        line.uomName,
      ];
      const quantities = [
        pdfQuantity(line.previousQuantity),
        pdfQuantity(line.quantity),
        pdfQuantity(line.cumulativeQuantity),
      ];
      return financial
        ? [
            ...head,
            printMoney(line.rate),
            ...quantities,
            printMoney(line.amount),
          ]
        : [...head, ...quantities];
    }),
  );
}

/** Value to date, less previous bills, the gross (Financial). */
export function valueTotals(
  w: DocumentPdfWriter,
  bill: { cumulativeValue: bigint; previousValue: bigint; gross: bigint },
  grossLabel = "Gross this bill",
): void {
  w.down(2);
  w.totals([
    ["Value to date", pdfRupees(bill.cumulativeValue), false],
    ["Less previous bills", pdfMinus(bill.previousValue), false],
    [grossLabel, pdfRupees(bill.gross), true],
  ]);
}

/** A measurement row as part 2 prints it. */
export type DetailRow = {
  measuredOn: string;
  description: string | null;
  sheetTitle: string | null;
  locationLabel: string | null;
  direct: boolean;
  nos: bigint | null;
  length: bigint | null;
  breadth: bigint | null;
  depth: bigint | null;
  quantity: bigint;
};

/** Part 2, the measurement detail behind each line. */
export function measurementDetail(
  w: DocumentPdfWriter,
  lines: readonly (Pick<AbstractLine, "itemNo" | "description" | "uomName"> & {
    rows: readonly DetailRow[];
  })[],
): void {
  const width = w.contentWidth;
  w.heading("Measurement detail");
  for (const line of lines) {
    w.paragraph(
      `${line.itemNo == null ? "" : `${line.itemNo} · `}${line.description} (${line.uomName})`,
      { bold: true },
    );
    w.table(
      [
        { label: "Date", width: 54 },
        {
          label: "Description",
          width: width - 54 - 110 - 36 - 40 - 40 - 40 - 58,
        },
        { label: "Location", width: 110 },
        { label: "Nos", width: 36, align: "right" },
        { label: "L", width: 40, align: "right" },
        { label: "B", width: 40, align: "right" },
        { label: "D/H", width: 40, align: "right" },
        { label: "Qty", width: 58, align: "right" },
      ],
      line.rows.map((row) => [
        printDate(row.measuredOn),
        row.description ?? row.sheetTitle ?? "",
        row.locationLabel ?? "",
        row.direct ? "" : pdfQuantity(row.nos ?? 10_000n),
        pdfQuantity(row.length),
        pdfQuantity(row.breadth),
        pdfQuantity(row.depth),
        pdfQuantity(row.quantity),
      ]),
    );
    w.down(4);
  }
}

type TotalRow = [string, string, boolean];

/** CGST + SGST (half the rate each) or IGST at the rate; none when no GST. */
export function gstRows(bill: {
  gstRate: bigint | null;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
}): TotalRow[] {
  if (bill.cgst + bill.sgst + bill.igst === 0n) return [];
  const rate = bill.gstRate ?? 0n;
  return bill.igst > 0n
    ? [[`IGST ${pdfPercent(rate)}%`, pdfRupees(bill.igst), false]]
    : [
        [`CGST ${pdfPercent(rate / 2n)}%`, pdfRupees(bill.cgst), false],
        [`SGST ${pdfPercent(rate / 2n)}%`, pdfRupees(bill.sgst), false],
      ];
}

/** Each deduction as a "less" row. */
export function deductionRows(
  deductions: readonly {
    kind: DeductionKind;
    description: string | null;
    amount: bigint;
  }[],
): TotalRow[] {
  return deductions.map((deduction) => [
    `${DEDUCTION_KIND_LABELS[deduction.kind]}${deduction.description == null ? "" : ` (${deduction.description})`}`,
    pdfMinus(deduction.amount),
    false,
  ]);
}

/** Without Financial: the deduction kinds only. */
export function deductionKindsOnly(
  w: DocumentPdfWriter,
  deductions: readonly { kind: DeductionKind }[],
): void {
  if (deductions.length === 0) return;
  w.heading("Deductions");
  w.paragraph(
    deductions
      .map((deduction) => DEDUCTION_KIND_LABELS[deduction.kind])
      .join(", "),
  );
}

/** Three signature blocks across the page. */
export function signatureBlocks(
  w: DocumentPdfWriter,
  blocks: readonly [
    { label: string; name: string },
    { label: string; name: string },
    { label: string; name: string },
  ],
): void {
  w.room(70);
  w.down(46);
  const third = w.contentWidth / 3;
  w.rule();
  w.down(12);
  blocks.forEach((block, index) => {
    w.text(block.label, { x: MARGIN + third * index, size: 8.5, muted: true });
  });
  w.down(11);
  blocks.forEach((block, index) => {
    w.text(block.name, { x: MARGIN + third * index, size: 8.5 });
  });
}
