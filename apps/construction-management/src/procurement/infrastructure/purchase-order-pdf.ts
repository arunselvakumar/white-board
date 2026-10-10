import { gstStateName } from "@/src/shared-kernel/gst-states";

import type { PurchaseOrderReadModel } from "../application/purchase-order-handlers";
import { rupeesInWords } from "../domain/purchase-order-amount-words";
import {
  DocumentPdfWriter,
  MARGIN,
  printDate,
  printMoney,
  printQuantity,
  type Column,
} from "./purchase-order-pdf-writer";
import { companyBlock, type CompanyHeader } from "./purchase-request-pdf";

export type PurchaseOrderPdfInput = {
  company: CompanyHeader;
  /** The Project's or Store's name and address. */
  locationName: string;
  locationAddress: string | null;
  locationStateCode: string | null;
  siteLocationLabel: string | null;
  supplierAddress: string | null;
  order: PurchaseOrderReadModel;
};

function state(code: string | null): string {
  if (code == null) return "";
  return `${gstStateName(code) ?? "State"} (${code})`;
}

/** `18.00` → `18`, `2.50` → `2.5`. */
function percent(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Half of a GST rate for the CGST and SGST columns. */
function halfRate(rate: string): string {
  const hundredths = Math.round(Number(rate) * 100);
  return percent((hundredths / 200).toFixed(3));
}

/**
 * The Purchase Order PDF (CM-504): Company header, supplier with GSTIN,
 * billing and delivery addresses, lines with HSN, rate, discount, taxable
 * value and CGST + SGST or IGST by the PO's supply type, totals with
 * charges and deduction, the grand total in words (lakh / crore), payment
 * terms, Terms & Conditions and the points of contact. Noto fonts, so
 * names in Tamil and other Indian scripts print.
 */
export async function renderPurchaseOrderPdf(
  input: PurchaseOrderPdfInput,
): Promise<Uint8Array> {
  const { order, company } = input;
  const totals = order.totals;
  const texts = [
    company.name,
    company.address ?? "",
    input.locationName,
    input.locationAddress ?? "",
    input.siteLocationLabel ?? "",
    input.supplierAddress ?? "",
    order.supplierName,
    order.billingName,
    order.billingAddress,
    order.deliveryAddress ?? "",
    order.supplierPocName ?? "",
    order.sitePocName ?? "",
    order.remark ?? "",
    order.closeReason ?? "",
    ...order.items.flatMap((item) => [
      item.materialName,
      item.uomName,
      item.remark ?? "",
    ]),
    ...order.terms.flatMap((term) => [term.title, term.body]),
  ];
  const w = await DocumentPdfWriter.create(
    `Purchase Order ${order.number}`,
    texts,
  );
  companyBlock(w, company, "Purchase Order", order.number);

  w.facts(
    [
      ["Purchase Order Date", printDate(order.orderDate)],
      ["Expected Delivery Date", printDate(order.expectedDeliveryDate)],
      [
        order.location.kind === "project" ? "Project" : "Store",
        input.locationName,
      ],
      ["Purchase Request", order.purchaseRequestNumber ?? ""],
      ["Site location", input.siteLocationLabel ?? ""],
      ["Place of supply", state(order.placeOfSupplyStateCode)],
    ],
    3,
  );

  // Supplier | Bill to | Ship to
  w.down(4);
  const top = w.y;
  const third = w.contentWidth / 3;
  const blocks: [string, string[]][] = [
    [
      "Supplier",
      [
        order.supplierName,
        input.supplierAddress ?? "",
        order.supplierGstin == null
          ? "GSTIN: not registered"
          : `GSTIN: ${order.supplierGstin}`,
        order.supplierStateCode == null
          ? ""
          : `State: ${state(order.supplierStateCode)}`,
      ],
    ],
    [
      "Bill to",
      [
        order.billingName,
        order.billingAddress,
        order.billingGstin == null ? "" : `GSTIN: ${order.billingGstin}`,
        order.billingStateCode == null
          ? ""
          : `State: ${state(order.billingStateCode)}`,
      ],
    ],
    [
      "Deliver to",
      order.deliveryAddressDiffers
        ? [
            order.deliveryAddress ?? "",
            order.deliveryStateCode == null
              ? ""
              : `State: ${state(order.deliveryStateCode)}`,
          ]
        : [
            input.locationName,
            input.locationAddress ?? "",
            input.locationStateCode == null
              ? ""
              : `State: ${state(input.locationStateCode)}`,
          ],
    ],
  ];
  let bottom = top;
  blocks.forEach(([label, lines], index) => {
    w.y = top;
    const x = MARGIN + index * third;
    w.text(label, { x, size: 7.5, muted: true });
    w.down(11);
    lines
      .filter((line) => line !== "")
      .forEach((line, lineIndex) => {
        w.paragraph(line, {
          x,
          width: third - 10,
          bold: lineIndex === 0 && index < 2,
        });
      });
    bottom = Math.min(bottom, w.y);
  });
  w.y = bottom - 6;

  // Lines
  w.heading("Materials");
  const intra = order.supplyType === "intra_state";
  const columns: Column[] = [
    { label: "#", width: 16 },
    { label: "Material", width: 0 },
    { label: "HSN", width: 38 },
    { label: "Qty", width: 40, align: "right" },
    { label: "Unit", width: 30 },
    { label: "Rate", width: 50, align: "right" },
    { label: "Discount", width: 42, align: "right" },
    { label: "Taxable", width: 56, align: "right" },
    ...(intra
      ? [
          { label: "CGST", width: 46, align: "right" as const },
          { label: "SGST", width: 46, align: "right" as const },
        ]
      : [{ label: "IGST", width: 60, align: "right" as const }]),
    { label: "Total", width: 60, align: "right" },
  ];
  const used = columns.reduce((sum, column) => sum + column.width, 0);
  const material = columns[1];
  if (material != null) material.width = w.contentWidth - used;
  w.table(
    columns,
    order.items.map((item, index) => {
      const gst = intra
        ? [
            `${printMoney(item.cgst)}\n@${halfRate(item.gstRate)}%`,
            `${printMoney(item.sgst)}\n@${halfRate(item.gstRate)}%`,
          ]
        : [`${printMoney(item.igst)}\n@${percent(item.gstRate)}%`];
      return [
        String(index + 1),
        item.remark == null
          ? item.materialName
          : `${item.materialName}\n${item.remark}`,
        item.hsnCode ?? "",
        printQuantity(item.quantity),
        item.uomName,
        printMoney(item.unitRate),
        item.discountAmount === 0n
          ? ""
          : item.discountType === "percent" && item.discountPercent != null
            ? `${printMoney(item.discountAmount)}\n${percent(item.discountPercent)}%`
            : printMoney(item.discountAmount),
        printMoney(item.taxable),
        ...gst,
        printMoney(item.total),
      ];
    }),
  );

  // Totals
  w.down(4);
  const rows: [string, string, boolean?][] = [
    ["Sub Total", printMoney(totals.subTotal)],
  ];
  if (totals.discountTotal > 0n)
    rows.push(["Discount", `-${printMoney(totals.discountTotal)}`]);
  rows.push(["Taxable value", printMoney(totals.taxableTotal)]);
  if (intra) {
    rows.push(["CGST", printMoney(totals.cgstTotal)]);
    rows.push(["SGST", printMoney(totals.sgstTotal)]);
  } else rows.push(["IGST", printMoney(totals.igstTotal)]);
  rows.push(["Items total", printMoney(totals.itemsTotal)]);
  if (totals.additionalCharges > 0n)
    rows.push(["Additional Charges", printMoney(totals.additionalCharges)]);
  if (totals.deductionAmount > 0n)
    rows.push(["Deduction", `-${printMoney(totals.deductionAmount)}`]);
  rows.push(["Grand Total (₹)", printMoney(totals.grandTotal), true]);
  w.totals(rows);
  w.paragraph(rupeesInWords(totals.grandTotal), { size: 8.5, bold: true });
  w.down(4);

  const contact = (name: string | null, mobile: string | null) =>
    [name, mobile].filter((v) => v != null).join(" · ");
  w.facts(
    [
      [
        "Payment Terms",
        order.paymentTermsDays == null
          ? ""
          : `${String(order.paymentTermsDays)} days`,
      ],
      ["Supplier POC", contact(order.supplierPocName, order.supplierPocMobile)],
      ["Site POC", contact(order.sitePocName, order.sitePocMobile)],
    ],
    3,
  );
  if (order.remark != null) {
    w.heading("Remark");
    w.paragraph(order.remark);
  }
  if (order.terms.length > 0) {
    w.heading("Terms & Conditions");
    order.terms.forEach((term, index) => {
      w.paragraph(`${String(index + 1)}. ${term.title}`, { bold: true });
      w.paragraph(term.body, { x: MARGIN + 10, width: w.contentWidth - 10 });
      w.down(3);
    });
  }
  w.down(36);
  w.room(30);
  w.text("Prepared by", { x: MARGIN, muted: true });
  w.text(`For ${company.name}`, { right: w.right, muted: true });
  w.down(12);
  w.text("Authorised signatory", { right: w.right, muted: true, size: 7.5 });
  return w.save(`${order.number} · ${company.name}`);
}
