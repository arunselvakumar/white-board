import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  DocumentPdfWriter,
  MARGIN,
  printDate,
  printMoney,
  printQuantity,
  type Column,
} from "@/src/shared-kernel/pdf/document-pdf-writer";

import type { WorkOrderPrint } from "../application/work-order-handlers";
import { quantityText } from "../domain/boq";
import {
  ISSUE_BASIS_LABELS,
  TDS_NATURE_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "../domain/contract-terms";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";

/** The Company as the letterhead prints it. */
export type WorkOrderPdfCompany = {
  name: string;
  address: string | null;
  gstin: string | null;
  mobile: string | null;
  email: string | null;
};

export type WorkOrderPdfInput = {
  company: WorkOrderPdfCompany;
  /** The Project's site address, when it has one. */
  projectAddress: string | null;
  /** The Contractor's address, when it has one. */
  contractorAddress: string | null;
  print: WorkOrderPrint;
};

/** `18.00` → `18`, `2.50` → `2.5`. */
function percent(value: bigint | null): string {
  if (value == null) return "";
  const text = fixedDecimal(value, PERCENT_SCALE);
  return text.replace(/\.?0+$/, "");
}

function quantity(value: bigint): string {
  return printQuantity(quantityText(value));
}

function rupees(paise: bigint): string {
  return `₹${printMoney(paise)}`;
}

/** The Company's name, address and contacts at the left; the title and number at the right. */
function letterhead(
  w: DocumentPdfWriter,
  company: WorkOrderPdfCompany,
  number: string,
  revision: number,
): void {
  const top = w.y;
  w.text("Work Order", { right: w.right, size: 15, bold: true });
  w.down(16);
  w.text(number, { right: w.right, size: 10, bold: true });
  if (revision > 0) {
    w.down(12);
    w.text(`Revision ${String(revision)}`, { right: w.right, size: 9 });
  }
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
 * The Work Order PDF (CM-1104, ADR CM-0023 §5): the Company's letterhead,
 * the Project and the Contractor (with its Department), the number,
 * revision and dates; the lines with item no, description, UoM, quantity,
 * rate and amount and the total; the terms (retention and its cap,
 * mobilisation advance and recovery, DLP, TDS nature, SAC, GST and
 * reverse charge), the scope note and signature blocks. Without Work Order
 * Financial it prints quantities only. Noto fonts, so names in Tamil and
 * other Indian scripts print.
 */
export async function renderWorkOrderPdf(
  input: WorkOrderPdfInput,
): Promise<Uint8Array> {
  const { print, company } = input;
  const { workOrder, financial } = print;
  const { terms } = workOrder;
  const number = workOrder.number ?? "Draft";
  const contractor = print.contractor;
  const texts = [
    company.name,
    company.address ?? "",
    print.project.name,
    print.project.clientName ?? "",
    input.projectAddress ?? "",
    workOrder.contractorName,
    workOrder.departmentName ?? "",
    input.contractorAddress ?? "",
    workOrder.scope ?? "",
    ...print.lines.flatMap((line) => [
      line.itemNo ?? "",
      line.description,
      line.uomName,
    ]),
    ...print.materials.flatMap((material) => [
      material.materialName,
      material.uomName,
    ]),
  ];
  const w = await DocumentPdfWriter.create(`Work Order ${number}`, texts);
  letterhead(w, company, number, workOrder.revision);

  const state = print.project.stateCode;
  w.facts([
    ["Project", print.project.name],
    ["Order date", printDate(workOrder.orderDate)],
    [
      "Site",
      [
        input.projectAddress ?? "",
        state == null ? "" : `${gstStateName(state) ?? "State"} (${state})`,
      ]
        .filter((part) => part !== "")
        .join(", "),
    ],
    ["Valid until", printDate(workOrder.validUntil)],
    ...(print.project.clientName == null
      ? []
      : ([["Client", print.project.clientName]] as [string, string][])),
    ["Status", WORK_ORDER_STATUS_LABELS[workOrder.status]],
  ]);
  w.down(4);
  w.heading("Contractor");
  w.facts([
    ["Name", workOrder.contractorName],
    ["Department", workOrder.departmentName ?? ""],
    ["Address", input.contractorAddress ?? ""],
    [
      "GSTIN / PAN",
      [contractor?.gstin, contractor?.pan]
        .filter((value) => value != null && value !== "")
        .join(" / "),
    ],
  ]);

  if (workOrder.scope != null) {
    w.heading("Scope of work");
    w.paragraph(workOrder.scope);
    w.down(4);
  }

  w.heading("Items");
  const width = w.contentWidth;
  const columns: Column[] = financial
    ? [
        { label: "Item no", width: 52 },
        { label: "Description", width: width - 52 - 40 - 64 - 70 - 84 },
        { label: "UoM", width: 40 },
        { label: "Qty", width: 64, align: "right" },
        { label: "Rate (₹)", width: 70, align: "right" },
        { label: "Amount (₹)", width: 84, align: "right" },
      ]
    : [
        { label: "Item no", width: 60 },
        { label: "Description", width: width - 60 - 50 - 80 },
        { label: "UoM", width: 50 },
        { label: "Qty", width: 80, align: "right" },
      ];
  w.table(
    columns,
    print.lines.map((line) => {
      const row = [
        line.itemNo ?? "",
        line.description,
        line.uomName,
        quantity(line.quantity),
      ];
      return financial
        ? [...row, printMoney(line.rate), printMoney(line.amount)]
        : row;
    }),
  );
  if (financial) {
    w.down(2);
    w.totals([["Total (excluding GST)", rupees(workOrder.value), true]]);
  }

  w.heading("Terms");
  const termRows: [string, string][] = [
    ["Retention", `${percent(terms.retentionPercent)}% of each bill`],
    [
      "Retention cap",
      terms.retentionCapPercent == null
        ? "No cap"
        : `${percent(terms.retentionCapPercent)}% of the Work Order value`,
    ],
    [
      "Retention release",
      `${percent(terms.retentionCompletionPercent)}% on completion, the rest at the end of the DLP`,
    ],
    [
      "Defects liability period",
      terms.dlpMonths == null
        ? ""
        : `${String(terms.dlpMonths)} ${terms.dlpMonths === 1 ? "month" : "months"}`,
    ],
    ...(financial
      ? ([
          [
            "Mobilisation advance",
            terms.mobilisationAdvance == null
              ? ""
              : rupees(terms.mobilisationAdvance),
          ],
        ] as [string, string][])
      : []),
    [
      "Advance recovery",
      terms.mobilisationRecoveryPercent == null
        ? ""
        : `${percent(terms.mobilisationRecoveryPercent)}% of each bill`,
    ],
    [
      "TDS nature",
      terms.tdsNature == null ? "None" : TDS_NATURE_LABELS[terms.tdsNature],
    ],
    ["SAC", terms.sacCode ?? ""],
    ["GST", terms.gstRate == null ? "" : `${percent(terms.gstRate)}%`],
    ["Reverse charge (RCM)", terms.reverseCharge ? "Yes" : "No"],
  ];
  w.facts(termRows);

  if (print.materials.length > 0) {
    w.heading("Materials issued by the Company");
    w.table(
      [
        { label: "Material", width: width - 70 - 70 - 70 },
        { label: "Basis", width: 70 },
        { label: "Wastage %", width: 70, align: "right" },
        { label: "UoM", width: 70 },
      ],
      print.materials.map((material) => [
        material.materialName,
        ISSUE_BASIS_LABELS[material.issueBasis],
        percent(material.wastagePercent),
        material.uomName,
      ]),
    );
  }

  // Signature blocks.
  w.room(70);
  w.down(46);
  const half = w.contentWidth / 2;
  w.rule();
  w.down(12);
  w.text("For the Contractor (accepted)", {
    x: MARGIN,
    size: 8.5,
    muted: true,
  });
  w.text(`For ${company.name}`, { x: MARGIN + half, size: 8.5, muted: true });
  w.down(11);
  w.text(workOrder.contractorName, { x: MARGIN, size: 8.5 });
  w.text("Authorised signatory", { x: MARGIN + half, size: 8.5 });

  return w.save(`Work Order ${number}`);
}
