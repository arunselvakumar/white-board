import {
  DocumentPdfWriter,
  printDate,
  printMoney,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { ReconciliationStatement } from "../application/reconciliation-handlers";
import {
  BILL_STATUS_LABELS,
  ISSUE_BASIS_LABELS,
} from "../domain/contract-terms";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import { reconciliationQuantityText } from "../domain/material-reconciliation";
import { billLetterhead, signatureBlocks } from "./ra-bill-pdf-parts";
import type { WorkOrderPdfCompany } from "./work-order-pdf";

export type ReconciliationPdfInput = {
  company: WorkOrderPdfCompany;
  projectName: string;
  statement: ReconciliationStatement;
};

const money = (paise: bigint | null) =>
  paise == null ? "" : printMoney(paise);

/**
 * The material reconciliation statement PDF (CM-1110, ADR CM-0023 §10):
 * the letterhead, the Work Order, Contractor and the bill it is
 * cumulative to, then per material theoretical, allowed, issued, excess
 * and the under-use flag, the penal rate and the recovery, the issues
 * counted, and signature blocks. Plain ASCII and Noto glyphs only: no
 * subscripts or superscripts (CM-1109 printed "I₀" as a box). Without
 * Work Order Financial it prints quantities only.
 */
export async function renderReconciliationPdf(
  input: ReconciliationPdfInput,
): Promise<Uint8Array> {
  const { statement, company } = input;
  const { bill, financial } = statement;
  const number = statement.workOrder.number ?? "Draft";
  const title = "Material Reconciliation";
  const texts = [
    company.name,
    company.address ?? "",
    input.projectName,
    statement.workOrder.contractorName,
    ...statement.materials.map((row) => `${row.materialName} ${row.uomName}`),
    ...statement.issues.map(
      (row) => `${row.deliveryNoteNumber} ${row.materialRequestNumber}`,
    ),
  ];
  const w = await DocumentPdfWriter.create(`${title} ${number}`, texts);
  billLetterhead(w, company, title, number);
  w.facts([
    ["Project", input.projectName],
    ["Contractor", statement.workOrder.contractorName],
    ["Work Order", number],
    [
      "Bill",
      bill == null
        ? "To date"
        : `${bill.number ?? "Draft"}${bill.ordinal == null ? "" : ` (RA ${String(bill.ordinal)})`} · ${BILL_STATUS_LABELS[bill.status]}`,
    ],
    ["Bill date", bill == null ? "" : printDate(bill.billDate)],
    ["Issues up to", bill == null ? "Today" : printDate(bill.measuredUpTo)],
  ]);

  w.heading("Statement (cumulative to the bill)");
  const qty = 58;
  const fixed = qty * 5 + 40 + 44 + 66;
  w.table(
    [
      { label: "Material", width: Math.max(80, w.contentWidth - fixed) },
      { label: "Theoretical", width: qty, align: "right" },
      { label: "Wastage", width: 40, align: "right" },
      { label: "Allowed", width: qty, align: "right" },
      { label: "Issued", width: qty, align: "right" },
      { label: "Excess", width: qty, align: "right" },
      { label: "Under-use", width: qty, align: "right" },
      { label: "Penal rate", width: 44, align: "right" },
      { label: "Recovery (₹)", width: 66, align: "right" },
    ],
    statement.materials.map((row) => [
      `${row.materialName} (${row.uomName}, ${ISSUE_BASIS_LABELS[row.terms.issueBasis]})`,
      reconciliationQuantityText(row.theoretical),
      `${fixedDecimal(row.terms.wastagePercent, PERCENT_SCALE)}%`,
      reconciliationQuantityText(row.allowed),
      reconciliationQuantityText(row.netIssued),
      reconciliationQuantityText(row.excess),
      row.underUse ? "Short" : "",
      financial ? money(row.terms.penalRate) : "",
      financial
        ? money(
            bill?.status === "approved"
              ? (row.onThisBill ?? 0n)
              : row.recoverySuggested,
          )
        : "",
    ]),
  );
  w.down(4);
  w.paragraph(
    "Theoretical = billed quantity x coefficient, over approved running bills up to and including this bill. Allowed = theoretical x (1 + wastage). Excess = issued - allowed, recovered at the penal rate less what earlier bills recovered. Under-use: issued below theoretical x (1 - wastage), so the work may be short of material.",
    { muted: true },
  );
  if (financial) {
    const atCost = statement.materials.filter(
      (row) => row.terms.issueBasis === "at_cost",
    );
    if (atCost.length > 0) {
      w.heading("Material issued at cost");
      w.table(
        [
          { label: "Material", width: w.contentWidth - 270 },
          { label: "Issue rate", width: 60, align: "right" },
          { label: "Value (₹)", width: 70, align: "right" },
          { label: "Deducted before", width: 70, align: "right" },
          { label: "This bill", width: 70, align: "right" },
        ],
        atCost.map((row) => [
          row.materialName,
          money(row.terms.issueRate),
          money(row.atCostValue),
          money(row.atCostDeductedBefore),
          money(
            bill?.status === "approved"
              ? (row.atCostOnThisBill ?? 0n)
              : row.atCostSuggested,
          ),
        ]),
      );
    }
  }

  w.heading("Issues counted");
  if (statement.issues.length === 0) w.paragraph("None.", { muted: true });
  else
    w.table(
      [
        { label: "Delivered on", width: 80 },
        { label: "Delivery Note", width: 110 },
        { label: "Material Request", width: 110 },
        {
          label: "Material",
          width: w.contentWidth - 380,
        },
        { label: "Quantity", width: 80, align: "right" },
      ],
      statement.issues.map((row) => [
        printDate(row.date),
        row.deliveryNoteNumber,
        row.materialRequestNumber,
        statement.materials.find((item) => item.materialId === row.materialId)
          ?.materialName ?? "",
        fixedDecimal(row.quantity, 3),
      ]),
    );
  w.down(4);
  w.paragraph("Returns: none recorded (procurement has no return flow yet).", {
    muted: true,
  });

  signatureBlocks(w, [
    { label: "Prepared by", name: "Stores" },
    {
      label: "For the Contractor",
      name: statement.workOrder.contractorName,
    },
    { label: `For ${company.name}`, name: "Authorised signatory" },
  ]);
  return w.save(`${title} ${number}`);
}
