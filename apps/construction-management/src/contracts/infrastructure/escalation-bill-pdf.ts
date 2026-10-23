import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  DocumentPdfWriter,
  printDate,
  printMoney,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { EscalationBillPrint } from "../application/escalation-bill-handlers";
import {
  BILL_STATUS_LABELS,
  ESCALATION_COMPONENT_LABELS,
} from "../domain/contract-terms";
import { indexText, monthLabel, periodLabel } from "../domain/escalation";
import {
  billLetterhead,
  deductionKindsOnly,
  deductionRows,
  gstRows,
  pdfMinus,
  pdfPercent,
  pdfQuantity,
  pdfRupees,
  signatureBlocks,
} from "./ra-bill-pdf-parts";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

export type EscalationBillPdfInput = {
  company: WorkOrderPdfCompany;
  projectAddress: string | null;
  print: EscalationBillPrint;
};

const signed = (paise: bigint) =>
  paise < 0n ? pdfMinus(-paise) : pdfRupees(paise);

/**
 * The Escalation Bill PDF (CM-1109, ADR CM-0023 §9): the letterhead
 * titled "Escalation Bill", the period, the running bills whose value is
 * escalated (R), the **working** — one row per component with its
 * weight or quantity × base price, series, I₀, each month's index, Ī, the
 * factor and the amount — then GST, deductions and net, and signature
 * blocks. Without the side's Financial it prints the indices only.
 */
export async function renderEscalationBillPdf(
  input: EscalationBillPdfInput,
): Promise<Uint8Array> {
  const { print, company } = input;
  const { bill, financial } = print;
  const working = bill.working;
  const number = bill.number ?? "Draft";
  const texts = [
    company.name,
    company.address ?? "",
    print.project.name,
    print.partyName,
    input.projectAddress ?? "",
    bill.remarks ?? "",
    ...working.components.map((row) => row.series),
    ...print.deductions.map((row) => row.description ?? ""),
  ];
  const w = await DocumentPdfWriter.create(`Escalation Bill ${number}`, texts);
  billLetterhead(w, company, "Escalation Bill", number);
  const state = print.project.stateCode;
  const client = bill.side === "client";
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
    ["Period", periodLabel(bill.periodFrom, bill.periodTo)],
    [client ? "Client" : "Contractor", print.partyName],
    [
      client ? "Contract" : "Work Order",
      client ? "Client contract" : (print.workOrder?.number ?? "Draft"),
    ],
    [
      "Escalation bill",
      bill.ordinal == null ? "" : `No. ${String(bill.ordinal)}`,
    ],
    ["Status", BILL_STATUS_LABELS[bill.status]],
    ["Base month", monthLabel(working.baseMonth)],
    [
      "Non-escalable",
      financial ? `${pdfPercent(working.nonEscalablePercent)}%` : "",
    ],
  ]);

  w.heading("Value of work done in the period (R)");
  w.table(
    [
      { label: "Running bill", width: 120 },
      { label: "Bill date", width: 90 },
      {
        label: "Gross (₹)",
        width: w.contentWidth - 210,
        align: "right",
      },
    ],
    working.bills.map((row) => [
      row.number ?? "",
      printDate(row.billDate),
      financial ? printMoney(row.gross) : "",
    ]),
  );
  if (financial) {
    w.totals([
      ["R", pdfRupees(working.valueOfWork), true],
      ...(working.quantityValue > 0n
        ? ([
            [
              "Less 10CA materials at base price",
              pdfMinus(working.quantityValue),
              false,
            ],
            ["R for 10CC", pdfRupees(working.escalableValue), true],
          ] as [string, string, boolean][])
        : []),
    ]);
  }

  w.heading("Working (CPWD 10CC / 10CA)");
  const months = working.months;
  const monthWidth = 46;
  const fixed = 76 + 44 + 46 + 46 + 50 + 66;
  const seriesWidth = Math.max(
    60,
    w.contentWidth - fixed - monthWidth * months.length,
  );
  w.table(
    [
      { label: "Component", width: 76 },
      { label: "Weight / qty", width: 44, align: "right" },
      { label: "Series", width: seriesWidth },
      // The embedded Noto font has no subscript zero: "I₀" printed a box.
      { label: "Base", width: 46, align: "right" },
      ...months.map((month) => ({
        label: monthLabel(month),
        width: monthWidth,
        align: "right" as const,
      })),
      { label: "Ī", width: 46, align: "right" },
      { label: "Factor", width: 50, align: "right" },
      { label: "Amount (₹)", width: 66, align: "right" },
    ],
    working.components.map((row) => [
      ESCALATION_COMPONENT_LABELS[row.component],
      row.basis === "quantity"
        ? `${pdfQuantity(row.quantity)} × ${financial && row.basePrice != null ? printMoney(row.basePrice) : ""}`
        : financial
          ? `${pdfPercent(row.weightPercent)}%`
          : "",
      row.series,
      indexText(row.baseIndex),
      ...row.indices.map((item) => indexText(item.value)),
      indexText(row.averageIndex),
      row.factor,
      financial ? signed(row.amount) : "",
    ]),
  );
  w.down(4);
  w.paragraph(
    "10CC: amount = R × (1 − NE/100) × weight/100 × (Ī − I0)/I0. 10CA: amount = quantity × base price × (Ī − I0)/I0. I0 is the base month's index and Ī the average of the period's months; each amount is rounded to the paisa from the exact average.",
    { muted: true },
  );

  if (financial) {
    w.heading("GST, deductions and net");
    const gstTotal = bill.cgst + bill.sgst + bill.igst;
    w.totals([
      ["Escalation (gross)", signed(bill.gross), false],
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
      [client ? "Net receivable" : "Net payable", signed(bill.net), true],
    ]);
    if (bill.gross < 0n) {
      w.down(6);
      w.paragraph(
        "The indices fell, so this escalation is recovered: it is deducted on the next running bills (“Escalation recovery”). No invoice is raised for it.",
        { muted: true },
      );
    }
  } else deductionKindsOnly(w, print.deductions);

  if (bill.remarks != null) {
    w.heading("Remarks");
    w.paragraph(bill.remarks);
  }

  signatureBlocks(w, [
    { label: "Prepared by", name: "Accounts" },
    {
      label: client ? "For the Client" : "For the Contractor",
      name: print.partyName,
    },
    { label: `For ${company.name}`, name: "Authorised signatory" },
  ]);

  return w.save(`Escalation Bill ${number}`);
}
