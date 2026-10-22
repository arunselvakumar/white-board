import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  DocumentPdfWriter,
  printDate,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { ContractorBillPrint } from "../application/contractor-bill-handlers";
import { BILL_STATUS_LABELS } from "../domain/contract-terms";
import { TDS_ESTIMATE_NOTE } from "../domain/contractor-bill";
import {
  abstractTable,
  billLetterhead,
  deductionKindsOnly,
  deductionRows,
  gstRows,
  measurementDetail,
  pdfMinus,
  pdfRupees,
  signatureBlocks,
  valueTotals,
} from "./ra-bill-pdf-parts";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

export type ContractorBillPdfInput = {
  company: WorkOrderPdfCompany;
  /** The Project's site address, when it has one. */
  projectAddress: string | null;
  /** The Contractor's address, when it has one. */
  contractorAddress: string | null;
  print: ContractorBillPrint;
};

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
  billLetterhead(w, company, title, number);

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
  abstractTable(w, print.lines, financial);
  if (financial) valueTotals(w, bill);

  // Part 2: the measurement detail.
  measurementDetail(w, print.lines);

  // Part 3: deductions, GST and net.
  if (financial) {
    w.heading("Deductions, GST and net");
    const gstTotal = bill.cgst + bill.sgst + bill.igst;
    w.totals([
      ["Gross", pdfRupees(bill.gross), false],
      ...gstRows(bill),
      ...(bill.reverseCharge && gstTotal > 0n
        ? ([
            [
              "GST under reverse charge (paid by the Company)",
              pdfMinus(gstTotal),
              false,
            ],
          ] as [string, string, boolean][])
        : []),
      ...deductionRows(print.deductions),
      ["Net payable", pdfRupees(bill.net), true],
    ]);
    if (print.tdsEstimate != null) {
      w.down(6);
      w.paragraph(
        print.tdsEstimate.applicable
          ? `TDS (${print.tdsEstimate.label}) at ${print.tdsEstimate.rate}% on ${pdfRupees(print.tdsEstimate.base)}: about ${pdfRupees(print.tdsEstimate.amount)}. ${TDS_ESTIMATE_NOTE}`
          : `No TDS: the Contractor's TDS settings say it does not apply. ${TDS_ESTIMATE_NOTE}`,
        { muted: true },
      );
    }
  } else deductionKindsOnly(w, print.deductions);

  if (bill.remarks != null) {
    w.heading("Remarks");
    w.paragraph(bill.remarks);
  }

  // Signature blocks: measured and checked, the Contractor, the Company.
  signatureBlocks(w, [
    { label: "Measured and checked by", name: "Site engineer" },
    { label: "For the Contractor", name: bill.contractorName },
    { label: `For ${company.name}`, name: "Authorised signatory" },
  ]);

  return w.save(`Contractor Bill ${number}`);
}
