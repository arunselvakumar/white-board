import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type {
  GoodsReceipt,
  GoodsReceiptFormOptions,
  PostGoodsReceiptInput,
  ReceivableOrder,
} from "@/src/queries/goods-receipts";
import {
  defaultSupplyType,
  lineAmounts,
  type LineAmounts,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";

const QTY_RE = /^\d{1,11}(\.\d{1,3})?$/;
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;
const HSN_RE = /^\d{4,8}$/;

function positive(value: string): boolean {
  return QTY_RE.test(value.trim()) && Number(value) > 0;
}

const optionalText = z.string().max(100, "Use at most 100 characters.");

const rate = z
  .string()
  .refine((value) => value.trim() === "" || isRupees(value), "Enter a rate.");

const gst = z
  .string()
  .refine(
    (value) =>
      value.trim() === "" ||
      (PERCENT_RE.test(value.trim()) && Number(value) <= 100),
    "0 to 100.",
  );

const orderLine = z.object({
  purchaseOrderItemId: z.string(),
  /** The stored GRN line it keeps (edit). */
  id: z.string(),
  materialName: z.string(),
  uomName: z.string(),
  orderedQty: z.string(),
  /** Received on other GRNs. */
  receivedQty: z.string(),
  quantity: z
    .string()
    .refine(
      (value) => value.trim() === "" || QTY_RE.test(value.trim()),
      "Up to three decimals.",
    ),
  rate,
  gstRate: gst,
});

const manualLine = z.object({
  id: z.string(),
  materialId: z.string().min(1, "Choose a material."),
  uomName: z.string(),
  quantity: z.string().refine(positive, "Enter more than 0."),
  rate,
  gstRate: gst,
  hsnCode: z
    .string()
    .refine(
      (value) => value.trim() === "" || HSN_RE.test(value.trim()),
      "4 to 8 digits.",
    ),
});

export const goodsReceiptFormSchema = z
  .object({
    receiptDate: z.iso.date("Choose the GR Date."),
    inventoryDate: z.iso.date("Choose the Inventory Date."),
    supplierId: z.string().min(1, "Choose a Supplier."),
    purchaseOrderId: z.string(),
    supplyType: z.enum(["intra_state", "inter_state"]),
    invoiceNo: optionalText,
    invoiceDate: z
      .string()
      .refine(
        (value) => value === "" || z.iso.date().safeParse(value).success,
        "Choose a date.",
      ),
    invoiceAmount: z
      .string()
      .refine(
        (value) => value.trim() === "" || isRupees(value),
        "Enter the amount in rupees.",
      ),
    deliveryChallanNo: optionalText,
    grnDcNo: optionalText,
    vehicleNo: optionalText,
    driverName: optionalText,
    driverMobile: z.string().refine((value) => {
      const digits = value.replace(/\D/g, "");
      return (
        value.trim() === "" ||
        /^[6-9]\d{9}$/.test(digits.length === 12 ? digits.slice(2) : digits)
      );
    }, "Enter a 10-digit mobile number."),
    ewayBillNo: z
      .string()
      .refine(
        (value) =>
          value.trim() === "" || /^\d{12}$/.test(value.replace(/\s/g, "")),
        "An e-way bill number has 12 digits.",
      ),
    remark: z.string().max(500, "Use at most 500 characters."),
    orderLines: z.array(orderLine),
    manualLines: z.array(manualLine),
  })
  .refine((value) => value.inventoryDate >= value.receiptDate, {
    message: "The Inventory Date cannot be before the GR Date.",
    path: ["inventoryDate"],
  })
  .refine(
    (value) =>
      value.purchaseOrderId === "" ||
      value.orderLines.some((line) => positive(line.quantity)),
    {
      message: "Enter the quantity received on at least one line.",
      path: ["orderLines"],
    },
  )
  .refine(
    (value) => value.purchaseOrderId !== "" || value.manualLines.length > 0,
    { message: "Add at least one material received.", path: ["manualLines"] },
  );

export type GoodsReceiptFormValues = z.infer<typeof goodsReceiptFormSchema>;
export type OrderLineValues = GoodsReceiptFormValues["orderLines"][number];
export type ManualLineValues = GoodsReceiptFormValues["manualLines"][number];

function pending(ordered: string, received: string): string {
  const left = Math.round((Number(ordered) - Number(received)) * 1000) / 1000;
  return left > 0 ? String(left) : "";
}

/** The PO's lines on the form; `receipt` fills what this GRN received. */
export function orderLineValues(
  order: ReceivableOrder,
  receipt: GoodsReceipt | null,
): OrderLineValues[] {
  const own = new Map(
    (receipt?.lines ?? [])
      .filter((line) => line.purchaseOrderItemId != null)
      .map((line) => [line.purchaseOrderItemId, line]),
  );
  return order.lines.map((line) => {
    const kept = own.get(line.id);
    return {
      purchaseOrderItemId: line.id,
      id: kept?.id ?? "",
      materialName: line.materialName,
      uomName: line.uomName,
      orderedQty: line.orderedQty,
      receivedQty: line.receivedQty,
      quantity:
        receipt == null
          ? pending(line.orderedQty, line.receivedQty)
          : kept == null
            ? ""
            : String(Number(kept.receivedQty)),
      rate: paiseToRupees(kept?.unitRate ?? line.unitRate),
      gstRate: String(Number(kept?.gstRate ?? line.gstRate)),
    };
  });
}

export function supplyTypeFor(
  options: GoodsReceiptFormOptions,
  supplierId: string,
  order: ReceivableOrder | null,
): SupplyType {
  if (order != null) return order.supplyType;
  const supplier = options.suppliers.find((item) => item.id === supplierId);
  return defaultSupplyType(
    supplier?.stateCode ?? null,
    options.location.stateCode,
  );
}

export function goodsReceiptFormDefaults(
  options: GoodsReceiptFormOptions,
  receipt: GoodsReceipt | null,
  today: string,
): GoodsReceiptFormValues {
  const order =
    receipt?.purchaseOrder == null
      ? null
      : (options.purchaseOrders.find(
          (item) => item.id === receipt.purchaseOrder?.id,
        ) ?? null);
  const onlySupplier =
    options.suppliers.length === 1 ? (options.suppliers[0]?.id ?? "") : "";
  const supplierId = receipt?.supplier.id ?? onlySupplier;
  return {
    receiptDate: receipt?.receiptDate ?? today,
    inventoryDate: receipt?.inventoryDate ?? today,
    supplierId,
    purchaseOrderId: order?.id ?? "",
    supplyType: receipt?.supplyType ?? supplyTypeFor(options, supplierId, null),
    invoiceNo: receipt?.invoiceNo ?? "",
    invoiceDate: receipt?.invoiceDate ?? "",
    invoiceAmount: paiseToRupees(receipt?.invoiceAmount),
    deliveryChallanNo: receipt?.deliveryChallanNo ?? "",
    grnDcNo: receipt?.grnDcNo ?? "",
    vehicleNo: receipt?.vehicleNo ?? "",
    driverName: receipt?.driverName ?? "",
    driverMobile: receipt?.driverMobile?.replace(/^\+91/, "") ?? "",
    ewayBillNo: receipt?.ewayBillNo ?? "",
    remark: receipt?.remark ?? "",
    orderLines: order == null ? [] : orderLineValues(order, receipt),
    manualLines:
      order != null || receipt == null
        ? []
        : receipt.lines.map((line) => ({
            id: line.id,
            materialId: line.materialId,
            uomName: line.uomName,
            quantity: String(Number(line.receivedQty)),
            rate: paiseToRupees(line.unitRate),
            gstRate: String(Number(line.gstRate)),
            hsnCode: line.hsnCode ?? "",
          })),
  };
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function paise(value: string): number | null {
  const amount = rupeesToPaise(value);
  return amount == null || Number.isNaN(amount) ? null : amount;
}

type Body = Omit<PostGoodsReceiptInput, "locationKind" | "locationId">;

/**
 * The request body. Without Financial no rate, GST or invoice amount is
 * sent (the server ignores them anyway); hidden fields are not sent.
 */
export function goodsReceiptPayload(
  values: GoodsReceiptFormValues,
  options: { financial: boolean; hidden: ReadonlySet<string> },
): Body {
  const { financial, hidden } = options;
  const field = (name: string, value: string | null) =>
    hidden.has(name) ? undefined : value;
  const lines: Body["lines"] =
    values.purchaseOrderId === ""
      ? values.manualLines.map((line) => ({
          id: text(line.id),
          materialId: line.materialId,
          quantity: line.quantity.trim(),
          unitRate: financial ? paise(line.rate) : undefined,
          gstRate: financial ? text(line.gstRate) : undefined,
          hsnCode: text(line.hsnCode),
        }))
      : values.orderLines
          .filter((line) => positive(line.quantity))
          .map((line) => ({
            id: text(line.id),
            purchaseOrderItemId: line.purchaseOrderItemId,
            quantity: line.quantity.trim(),
            unitRate: financial ? paise(line.rate) : undefined,
            gstRate: financial ? text(line.gstRate) : undefined,
          }));
  return {
    receiptDate: values.receiptDate,
    inventoryDate: values.inventoryDate,
    supplierId: values.supplierId,
    purchaseOrderId:
      values.purchaseOrderId === "" ? null : values.purchaseOrderId,
    supplyType: values.supplyType,
    invoiceNo: field("invoiceNo", text(values.invoiceNo)),
    invoiceDate: field("invoiceDate", text(values.invoiceDate)),
    invoiceAmount:
      financial && !hidden.has("invoiceAmount")
        ? paise(values.invoiceAmount)
        : undefined,
    deliveryChallanNo: field(
      "deliveryChallanNo",
      text(values.deliveryChallanNo),
    ),
    grnDcNo: field("grnDcNo", text(values.grnDcNo)),
    vehicleNo: field("vehicleNo", text(values.vehicleNo)),
    driverName: field("driverName", text(values.driverName)),
    driverMobile: field("driverMobile", text(values.driverMobile)),
    ewayBillNo: field("ewayBillNo", text(values.ewayBillNo)),
    remark: field("remark", text(values.remark)),
    lines,
  };
}

/** The line's amounts as the server will compute them, or null while incomplete. */
export function liveAmounts(
  line: { quantity: string; rate: string; gstRate: string },
  supplyType: SupplyType,
): LineAmounts | null {
  if (!positive(line.quantity)) return null;
  const unitRate = paise(line.rate) ?? 0;
  const gstRate = line.gstRate.trim() === "" ? "0" : line.gstRate.trim();
  if (!PERCENT_RE.test(gstRate) || Number(gstRate) > 100) return null;
  try {
    return lineAmounts(
      { quantity: line.quantity.trim(), unitRate: BigInt(unitRate), gstRate },
      supplyType,
    );
  } catch {
    return null;
  }
}

export function receivesNow(line: OrderLineValues): boolean {
  return positive(line.quantity);
}

/** Received elsewhere + now − ordered when above 0, else null. */
export function excessNow(line: OrderLineValues): number | null {
  if (!positive(line.quantity)) return null;
  const excess =
    Math.round(
      (Number(line.receivedQty) +
        Number(line.quantity) -
        Number(line.orderedQty)) *
        1000,
    ) / 1000;
  return excess > 0 ? excess : null;
}

export function pendingOf(line: OrderLineValues): string {
  return pending(line.orderedQty, line.receivedQty) || "0";
}
