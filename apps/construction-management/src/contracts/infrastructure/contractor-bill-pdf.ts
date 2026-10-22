import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  DocumentPdfWriter,
  MARGIN,
  printDate,
  printMoney,
  printQuantity,
  type Column,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { ContractorBillPrint } from "../application/contractor-bill-handlers";
import { quantityText } from "../domain/boq";
import {
  BILL_STATUS_LABELS,
  DEDUCTION_KIND_LABELS,
} from "../domain/contract-terms";
import { TDS_ESTIMATE_NOTE } from "../domain/contractor-bill";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

export type ContractorBillPdfInput = {
  company: WorkOrderPdfCompany;
  /** The Project's site address, when it has one. */
  projectAddress: string | null;
  /** The Contractor's address, when it has one. */
  contractorAddress: string | null;
  print: ContractorBillPrint;
};

/** `18.00` → `18`, `2.50` → `2.5`. */
function percent(value: bigint | null): string {
  if (value == null) return "";
  return fixedDecimal(value, PERCENT_SCALE).replace(/\.?0+$/, "");
}

function quantity(value: bigint | null): string {
  return value == null ? "" : printQuantity(quantityText(value));
}

function rupees(paise: bigint): string {
  return `₹${printMoney(paise)}`;
}

function minus(paise: bigint): string {
  return `− ₹${printMoney(paise)}`;
}

function letterhead(
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

/**
 * The Contractor Bill PDF (CM-1106, ADR CM-0023 §7) in three parts: the
 * **abstract** (item no, description, UoM, rate, previous / this /
 * cumulative quantity and amount), the **measurement detail** behind each
 * line (sheet date, description, location, nos × L × B × D and quantity),
 * and the **deductions**, GST and net, with the TDS estimate noted as an
 * estimate and signature blocks. Without Contractor Bill Financial it
 * prints quantities only. Noto fonts, so Indian scripts print.
 */
export async function renderContractorBillPdf(
  input: ContractorBillPdfInput,
): Promise<Uint8Array> {
  const { print, company } = input;
  const { bill, financial } = print;
  const number = bill.number ?? "Draft";
  const contractor = print.contractor;
  const texts = [
    company.name,
    company.address ?? "",
    print.project.name,
    print.project.clientName ?? "",
    input.projectAddress ?? "",
    bill.contractorName,
    bill.departmentName ?? "",
    input.contractorAddress ?? "",
    bill.remarks ?? "",
    ...print.lines.flatMap((line) => [
      line.itemNo ?? "",
      line.description,
      line.uomName,
      ...line.rows.flatMap((row) => [
        row.description ?? "",
        row.locationLabel ?? "",
        row.sheetTitle ?? "",
      ]),
    ]),
    ...print.deductions.map((deduction) => deduction.description ?? ""),
  ];
  const title = bill.isFinal ? "Final Bill" : "Running Account Bill";
  const w = await DocumentPdfWriter.create(`Contractor Bill ${number}`, texts);
  letterhead(w, company, title, number);

  const state = print.project.stateCode;
  w.facts([
    ["Project", print.project.name],
    ["Bill date", printDate(bill.billDate)],
    [
      "Site",
      [
        input.projectAddress ?? "",
        state == null ? "" : `${gstStateName(state) ?? "State"} (${state})`,
      ]
        .filter((part) => part !== "")
        .join(", "),
    ],
    ["Measured up to", printDate(bill.measuredUpTo)],
    ["Work Order", print.workOrder.number ?? "Draft"],
    [
      "RA bill",
      bill.ordinal == null
        ? ""
        : `No. ${String(bill.ordinal)}${bill.isFinal ? " (Final)" : ""}`,
    ],
    ["Status", BILL_STATUS_LABELS[bill.status]],
  ]);
  w.down(4);
  w.heading("Contractor");
  w.facts([
    ["Name", bill.contractorName],
    ["Department", bill.departmentName ?? ""],
    ["Address", input.contractorAddress ?? ""],
    [
      "GSTIN / PAN",
      [contractor?.gstin, contractor?.pan]
        .filter((value) => value != null && value !== "")
        .join(" / "),
    ],
  ]);

  // Part 1: the abstract.
  w.heading("Abstract");
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
    print.lines.map((line) => {
      const head = [line.itemNo ?? "", line.description, line.uomName];
      const quantities = [
        quantity(line.previousQuantity),
        quantity(line.quantity),
        quantity(line.cumulativeQuantity),
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
  if (financial) {
    w.down(2);
    w.totals([
      ["Value to date", rupees(bill.cumulativeValue), false],
      ["Less previous bills", minus(bill.previousValue), false],
      ["Gross this bill", rupees(bill.gross), true],
    ]);
  }

  // Part 2: the measurement detail.
  w.heading("Measurement detail");
  for (const line of print.lines) {
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
        row.direct ? "" : quantity(row.nos ?? 10_000n),
        quantity(row.length),
        quantity(row.breadth),
        quantity(row.depth),
        quantity(row.quantity),
      ]),
    );
    w.down(4);
  }

  // Part 3: deductions, GST and net.
  if (financial) {
    w.heading("Deductions, GST and net");
    const gstTotal = bill.cgst + bill.sgst + bill.igst;
    const rate = percent(bill.gstRate);
    const gstRows: [string, string, boolean][] =
      bill.igst > 0n
        ? [[`IGST ${rate}%`, rupees(bill.igst), false]]
        : [
            [
              `CGST ${percent((bill.gstRate ?? 0n) / 2n)}%`,
              rupees(bill.cgst),
              false,
            ],
            [
              `SGST ${percent((bill.gstRate ?? 0n) / 2n)}%`,
              rupees(bill.sgst),
              false,
            ],
          ];
    w.totals([
      ["Gross", rupees(bill.gross), false],
      ...(gstTotal > 0n ? gstRows : []),
      ...(bill.reverseCharge && gstTotal > 0n
        ? ([
            [
              "GST under reverse charge (paid by the Company)",
              minus(gstTotal),
              false,
            ],
          ] as [string, string, boolean][])
        : []),
      ...print.deductions.map(
        (deduction) =>
          [
            `${DEDUCTION_KIND_LABELS[deduction.kind]}${deduction.description == null ? "" : ` (${deduction.description})`}`,
            minus(deduction.amount),
            false,
          ] as [string, string, boolean],
      ),
      ["Net payable", rupees(bill.net), true],
    ]);
    if (print.tdsEstimate != null) {
      w.down(6);
      w.paragraph(
        print.tdsEstimate.applicable
          ? `TDS (${print.tdsEstimate.label}) at ${print.tdsEstimate.rate}% on ${rupees(print.tdsEstimate.base)}: about ${rupees(print.tdsEstimate.amount)}. ${TDS_ESTIMATE_NOTE}`
          : `No TDS: the Contractor's TDS settings say it does not apply. ${TDS_ESTIMATE_NOTE}`,
        { muted: true },
      );
    }
  } else if (print.deductions.length > 0) {
    w.heading("Deductions");
    w.paragraph(
      print.deductions
        .map((deduction) => DEDUCTION_KIND_LABELS[deduction.kind])
        .join(", "),
    );
  }

  if (bill.remarks != null) {
    w.heading("Remarks");
    w.paragraph(bill.remarks);
  }

  // Signature blocks: measured and checked, the Contractor, the Company.
  w.room(70);
  w.down(46);
  const third = w.contentWidth / 3;
  w.rule();
  w.down(12);
  w.text("Measured and checked by", { x: MARGIN, size: 8.5, muted: true });
  w.text("For the Contractor", { x: MARGIN + third, size: 8.5, muted: true });
  w.text(`For ${company.name}`, {
    x: MARGIN + third * 2,
    size: 8.5,
    muted: true,
  });
  w.down(11);
  w.text("Site engineer", { x: MARGIN, size: 8.5 });
  w.text(bill.contractorName, { x: MARGIN + third, size: 8.5 });
  w.text("Authorised signatory", { x: MARGIN + third * 2, size: 8.5 });

  return w.save(`Contractor Bill ${number}`);
}
