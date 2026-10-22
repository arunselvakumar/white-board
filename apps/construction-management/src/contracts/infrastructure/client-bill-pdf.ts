import { rupeesInWords } from "@/src/shared-kernel/amount-in-words";
import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  DocumentPdfWriter,
  printDate,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { ClientBillPrint } from "../application/client-bill-handlers";
import { BILL_STATUS_LABELS } from "../domain/contract-terms";
import {
  abstractTable,
  billLetterhead,
  deductionKindsOnly,
  deductionRows,
  gstRows,
  measurementDetail,
  pdfPercent,
  pdfQuantity,
  pdfRupees,
  signatureBlocks,
  valueTotals,
} from "./ra-bill-pdf-parts";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

export type ClientBillPdfInput = {
  company: WorkOrderPdfCompany;
  /** The Project's site address, when it has one. */
  projectAddress: string | null;
  print: ClientBillPrint;
};

function state(code: string | null): string {
  if (code == null || code === "") return "";
  return `${gstStateName(code) ?? "State"} (${code})`;
}

/**
 * A Client Bill as a **tax invoice** (CM-1107, ADR CM-0023 §7, §11): the
 * supplier (the Company's name, the billing address whose GSTIN it
 * carries), the recipient (the Client's name, address, GSTIN and state),
 * the place of supply (the Project's state), the invoice number and date,
 * SAC; then the abstract against the BOQ items with deviation notes, the
 * measurement detail, the taxable value, CGST + SGST or IGST with their
 * rates, the invoice value in words, what the Client holds back, the net
 * receivable in words, the `GSTIN_NOT_IN_STATE` warning when there is one,
 * and signature blocks. Without Client Bill Financial it prints quantities
 * only. Noto fonts, so Indian scripts print.
 */
export async function renderClientBillPdf(
  input: ClientBillPdfInput,
): Promise<Uint8Array> {
  const { print, company } = input;
  const { bill, financial } = print;
  const number = bill.number ?? "Draft";
  const supplier = print.supplier;
  const client = print.client;
  const texts = [
    company.name,
    company.address ?? "",
    supplier?.name ?? "",
    supplier?.address ?? "",
    print.project.name,
    input.projectAddress ?? "",
    client?.name ?? bill.clientName,
    client?.address ?? "",
    bill.remarks ?? "",
    ...print.warnings.map((warning) => warning.message),
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
  const w = await DocumentPdfWriter.create(`Tax Invoice ${number}`, texts);
  billLetterhead(
    w,
    {
      ...company,
      address: supplier?.address ?? company.address,
      gstin: bill.supplierGstin,
    },
    "Tax Invoice",
    number,
  );

  w.facts([
    ["Invoice no.", number],
    ["Invoice date", printDate(bill.billDate)],
    ["Place of supply", state(bill.placeOfSupplyStateCode)],
    ["SAC", bill.sacCode ?? ""],
    ["Project", print.project.name],
    ["Site", input.projectAddress ?? ""],
    [
      "RA bill",
      bill.ordinal == null
        ? ""
        : `No. ${String(bill.ordinal)}${bill.isFinal ? " (Final bill)" : ""}`,
    ],
    ["Measured up to", printDate(bill.measuredUpTo)],
    ["Reverse charge", "No"],
    ["Status", BILL_STATUS_LABELS[bill.status]],
  ]);
  w.down(4);
  w.heading("Supplier");
  w.facts([
    ["Name", company.name],
    ["Address", supplier?.address ?? company.address ?? ""],
    ["GSTIN", bill.supplierGstin ?? "Not registered"],
    [
      "State",
      state(bill.supplierGstin?.slice(0, 2) ?? supplier?.stateCode ?? null),
    ],
  ]);
  w.heading("Recipient (Client)");
  w.facts([
    ["Name", client?.name ?? bill.clientName],
    [
      "Address",
      [client?.address ?? "", client?.pinCode ?? ""]
        .filter((part) => part !== "")
        .join(" – "),
    ],
    ["GSTIN", bill.recipientGstin ?? "Unregistered"],
    ["State", state(client?.stateCode ?? null)],
  ]);
  for (const warning of print.warnings) {
    w.down(4);
    w.paragraph(`Warning (${warning.code}): ${warning.message}`, {
      bold: true,
    });
  }

  // Part 1: the abstract against the BOQ.
  w.heading("Abstract");
  abstractTable(w, print.lines, financial, (_line, index) => {
    const line = print.lines[index];
    if (line?.deviation.over !== true) return null;
    const over =
      line.deviation.percentOver == null
        ? ""
        : ` (${pdfPercent(line.deviation.percentOver)}% over)`;
    return `Deviation: billed ${pdfQuantity(line.cumulativeQuantity)} against BOQ ${pdfQuantity(line.boqQuantity ?? 0n)}${over}${line.deviation.overLimit ? ", needs a Variation" : ""}`;
  });
  if (financial) valueTotals(w, bill, "Taxable value this bill");

  // Part 2: the measurement detail.
  measurementDetail(w, print.lines);

  // Part 3: tax, deductions and net.
  if (financial) {
    const gstTotal = bill.cgst + bill.sgst + bill.igst;
    const invoiceValue = bill.gross + gstTotal;
    w.heading("Tax, deductions and net");
    w.totals([
      ["Taxable value", pdfRupees(bill.gross), false],
      ...gstRows(bill),
      ["Invoice value", pdfRupees(invoiceValue), true],
    ]);
    w.down(4);
    w.paragraph(`Invoice value in words: ${rupeesInWords(invoiceValue)}`, {
      muted: true,
    });
    if (print.deductions.length > 0) {
      w.down(4);
      w.totals([
        ...deductionRows(print.deductions),
        ["Net receivable", pdfRupees(bill.net), true],
      ]);
    } else {
      w.totals([["Net receivable", pdfRupees(bill.net), true]]);
    }
    w.down(4);
    w.paragraph(`Net receivable in words: ${rupeesInWords(bill.net)}`, {
      bold: true,
    });
  } else deductionKindsOnly(w, print.deductions);

  if (bill.remarks != null) {
    w.heading("Remarks");
    w.paragraph(bill.remarks);
  }

  // Signature blocks: measured and checked, the Client, the Company.
  signatureBlocks(w, [
    { label: "Measured and checked by", name: "Site engineer" },
    { label: "Received by the Client", name: client?.name ?? bill.clientName },
    { label: `For ${company.name}`, name: "Authorised signatory" },
  ]);

  return w.save(`Tax Invoice ${number}`);
}
