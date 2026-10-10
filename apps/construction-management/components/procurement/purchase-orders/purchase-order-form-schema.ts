import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type { MaterialOption } from "@/src/queries/material-options";
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderDetail,
  PurchaseOrderFormOptions,
} from "@/src/queries/purchase-orders";
import {
  defaultSupplyType,
  documentTotals,
  lineAmounts,
  type DocumentTotals,
  type LineAmounts,
  type LineDiscount,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

/**
 * The Purchase Order form's values and the browser side of the GST math
 * (CM-504). Totals use the kernel's `lineAmounts` / `documentTotals`, the
 * same functions the server runs, so the screen shows what is saved.
 */

const QUANTITY_RE = /^\d{1,11}(\.\d{1,3})?$/;
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;
const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export const lineSchema = z
  .object({
    key: z.string(),
    materialId: z.string().min(1, "Choose a material"),
    materialName: z.string(),
    uomName: z.string(),
    purchaseRequestItemId: z.string().nullable(),
    quantity: z
      .string()
      .trim()
      .refine((value) => QUANTITY_RE.test(value) && Number(value) > 0, {
        message: "Enter a quantity more than 0 (at most three decimals)",
      }),
    rate: z
      .string()
      .trim()
      .refine((value) => isRupees(value), { message: "Enter the Unit Rate" }),
    discountType: z.enum(["none", "amount", "percent"]),
    discountValue: z.string().trim(),
    gstRate: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" || (PERCENT_RE.test(value) && Number(value) <= 100),
        {
          message: "Enter a GST rate between 0 and 100",
        },
      ),
    hsnCode: z
      .string()
      .trim()
      .refine((value) => value === "" || HSN_RE.test(value), {
        message: "An HSN code has 4, 6 or 8 digits",
      }),
    remark: z.string().max(500, "Use at most 500 characters"),
  })
  .superRefine((line, context) => {
    if (line.discountType === "amount" && !isRupees(line.discountValue))
      context.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Enter the discount in ₹",
      });
    if (
      line.discountType === "percent" &&
      !(
        PERCENT_RE.test(line.discountValue) && Number(line.discountValue) <= 100
      )
    )
      context.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Enter a percent between 0 and 100",
      });
  });

export type LineValue = z.infer<typeof lineSchema>;

const mobile = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" || normalizeMobile(value)?.startsWith("+91") === true,
    {
      message: "Enter a 10-digit Indian mobile number",
    },
  );

export const purchaseOrderFormSchema = z
  .object({
    orderDate: z.string().min(1, "Enter the Purchase Order Date"),
    purchaseRequestId: z.string(),
    supplierId: z.string().min(1, "Choose a Supplier"),
    expectedDeliveryDate: z.string().min(1, "Enter the Expected Delivery Date"),
    siteLocation: z.custom<LocationRef | null>(),
    lines: z.array(lineSchema).min(1, "Add at least one material"),
    additionalCharges: z
      .string()
      .refine((v) => v.trim() === "" || isRupees(v), {
        message: "Enter an amount",
      }),
    deductionAmount: z.string().refine((v) => v.trim() === "" || isRupees(v), {
      message: "Enter an amount",
    }),
    billingAddressId: z.string().min(1, "Choose a billing address"),
    supplierPocName: z.string().max(120),
    supplierPocMobile: mobile,
    sitePocName: z.string().max(120),
    sitePocMobile: mobile,
    paymentTermsDays: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{1,4}$/.test(v) && Number(v) <= 3650), {
        message: "Enter whole days, 0 to 3650",
      }),
    termsIds: z.array(z.string()),
    deliveryAddressDiffers: z.boolean(),
    deliveryAddress: z.string().max(1000),
    deliveryStateCode: z.string(),
    supplyType: z.enum(["auto", "intra_state", "inter_state"]),
    remark: z.string().max(500, "Use at most 500 characters"),
  })
  .superRefine((value, context) => {
    if (
      value.expectedDeliveryDate !== "" &&
      value.expectedDeliveryDate < value.orderDate
    )
      context.addIssue({
        code: "custom",
        path: ["expectedDeliveryDate"],
        message:
          "Expected Delivery Date cannot be before the Purchase Order Date",
      });
    if (value.deliveryAddressDiffers && value.deliveryAddress.trim() === "")
      context.addIssue({
        code: "custom",
        path: ["deliveryAddress"],
        message: "Enter the delivery address",
      });
  });

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>;

let keys = 0;
export function lineKey(): string {
  keys += 1;
  return `line-${String(keys)}`;
}

/** A new line with the Material master's rate, discount, GST % and HSN. */
export function lineFromMaterial(
  material: MaterialOption,
  quantity = "",
  purchaseRequestItemId: string | null = null,
): LineValue {
  return {
    key: lineKey(),
    materialId: material.id,
    materialName: material.name,
    uomName: material.uomName,
    purchaseRequestItemId,
    quantity,
    rate: paiseToRupees(material.unitRate),
    discountType: material.discount?.type ?? "none",
    discountValue:
      material.discount == null
        ? ""
        : material.discount.type === "amount"
          ? paiseToRupees(material.discount.paise)
          : trimPercent(material.discount.percent),
    gstRate: material.gstRate == null ? "" : trimPercent(material.gstRate),
    hsnCode: material.hsnCode ?? "",
    remark: "",
  };
}

function trimPercent(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function lineDiscount(line: LineValue): LineDiscount {
  if (line.discountType === "amount") {
    const paise = rupeesToPaise(line.discountValue);
    return paise == null || Number.isNaN(paise)
      ? null
      : { type: "amount", paise: BigInt(paise) };
  }
  if (line.discountType === "percent")
    return line.discountValue.trim() === ""
      ? null
      : { type: "percent", percent: line.discountValue.trim() };
  return null;
}

/** The kernel's amounts for a line, or null while it is incomplete or invalid. */
export function lineAmountsOf(
  line: LineValue,
  supplyType: SupplyType,
): LineAmounts | null {
  const rate = rupeesToPaise(line.rate);
  if (rate == null || Number.isNaN(rate) || rate < 0) return null;
  try {
    return lineAmounts(
      {
        quantity: line.quantity.trim(),
        unitRate: BigInt(rate),
        discount: lineDiscount(line),
        gstRate: line.gstRate.trim() === "" ? "0" : line.gstRate.trim(),
      },
      supplyType,
    );
  } catch {
    return null;
  }
}

function paise(value: string): bigint {
  const parsed = rupeesToPaise(value);
  return parsed == null || Number.isNaN(parsed) || parsed < 0
    ? 0n
    : BigInt(parsed);
}

export function totalsOf(
  lines: readonly LineValue[],
  supplyType: SupplyType,
  additionalCharges: string,
  deductionAmount: string,
): DocumentTotals | null {
  const amounts = lines.map((line) => lineAmountsOf(line, supplyType));
  if (amounts.some((amount) => amount == null)) return null;
  try {
    return documentTotals(amounts as LineAmounts[], {
      additionalCharges: paise(additionalCharges),
      deductionAmount: paise(deductionAmount),
    });
  } catch {
    return null;
  }
}

/** Place of supply → the supply type the PO will use. */
export function effectiveSupplyType(
  values: Pick<
    PurchaseOrderFormValues,
    "supplyType" | "deliveryAddressDiffers" | "deliveryStateCode" | "supplierId"
  >,
  options: PurchaseOrderFormOptions,
): { supplyType: SupplyType; placeOfSupply: string | null } {
  const placeOfSupply = values.deliveryAddressDiffers
    ? values.deliveryStateCode === ""
      ? null
      : values.deliveryStateCode
    : options.location.stateCode;
  const supplier = options.suppliers.find(
    (item) => item.id === values.supplierId,
  );
  return {
    placeOfSupply,
    supplyType:
      values.supplyType === "auto"
        ? defaultSupplyType(supplier?.stateCode ?? null, placeOfSupply)
        : values.supplyType,
  };
}

export function formDefaults(
  today: string,
  options: PurchaseOrderFormOptions,
  existing?: PurchaseOrderDetail,
): PurchaseOrderFormValues {
  const defaultBilling =
    options.billingAddresses.find((item) => item.isDefault)?.id ?? "";
  if (existing == null)
    return {
      orderDate: today,
      purchaseRequestId: "",
      supplierId: "",
      expectedDeliveryDate: "",
      siteLocation: null,
      lines: [],
      additionalCharges: "",
      deductionAmount: "",
      billingAddressId: defaultBilling,
      supplierPocName: "",
      supplierPocMobile: "",
      sitePocName: "",
      sitePocMobile: "",
      paymentTermsDays: "",
      termsIds: [],
      deliveryAddressDiffers: false,
      deliveryAddress: "",
      deliveryStateCode: "",
      supplyType: "auto",
      remark: "",
    };
  return {
    orderDate: existing.orderDate,
    purchaseRequestId: existing.purchaseRequest?.id ?? "",
    supplierId: existing.supplier.id,
    expectedDeliveryDate: existing.expectedDeliveryDate,
    siteLocation: existing.siteLocation,
    lines: existing.items.map((item) => ({
      key: lineKey(),
      materialId: item.materialId,
      materialName: item.materialName,
      uomName: item.uomName,
      purchaseRequestItemId: item.purchaseRequestItemId,
      quantity: trimPercent(item.quantity),
      rate: paiseToRupees(item.unitRate),
      discountType: item.discountType ?? "none",
      discountValue:
        item.discountType === "percent"
          ? trimPercent(item.discountPercent ?? "")
          : item.discountType === "amount"
            ? paiseToRupees(item.discountAmount)
            : "",
      gstRate: trimPercent(item.gstRate),
      hsnCode: item.hsnCode ?? "",
      remark: item.remark ?? "",
    })),
    additionalCharges:
      existing.totals.additionalCharges === 0
        ? ""
        : paiseToRupees(existing.totals.additionalCharges),
    deductionAmount:
      existing.totals.deductionAmount === 0
        ? ""
        : paiseToRupees(existing.totals.deductionAmount),
    billingAddressId: existing.billing.id,
    supplierPocName: existing.supplierPoc.name ?? "",
    supplierPocMobile: existing.supplierPoc.mobile ?? "",
    sitePocName: existing.sitePoc.name ?? "",
    sitePocMobile: existing.sitePoc.mobile ?? "",
    paymentTermsDays:
      existing.paymentTermsDays == null
        ? ""
        : String(existing.paymentTermsDays),
    termsIds: existing.terms.flatMap((term) =>
      term.termsId == null ? [] : [term.termsId],
    ),
    deliveryAddressDiffers: existing.deliveryAddressDiffers,
    deliveryAddress: existing.deliveryAddress ?? "",
    deliveryStateCode: existing.deliveryStateCode ?? "",
    supplyType: existing.supplyType,
    remark: existing.remark ?? "",
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** The request body; totals are never sent (the server prices the lines). */
export function toPurchaseOrderInput(
  values: PurchaseOrderFormValues,
  approve: boolean,
): Omit<CreatePurchaseOrderInput, "projectId" | "storeId"> {
  return {
    orderDate: values.orderDate,
    expectedDeliveryDate: values.expectedDeliveryDate,
    purchaseRequestId: orNull(values.purchaseRequestId),
    supplierId: values.supplierId,
    siteLocation: siteLocationBody(values.siteLocation),
    supplyType: values.supplyType === "auto" ? null : values.supplyType,
    billingAddressId: orNull(values.billingAddressId),
    supplierPoc: {
      name: orNull(values.supplierPocName),
      mobile: orNull(values.supplierPocMobile),
    },
    sitePoc: {
      name: orNull(values.sitePocName),
      mobile: orNull(values.sitePocMobile),
    },
    paymentTermsDays:
      values.paymentTermsDays.trim() === ""
        ? null
        : Number(values.paymentTermsDays),
    termsIds: values.termsIds,
    deliveryAddressDiffers: values.deliveryAddressDiffers,
    deliveryAddress: values.deliveryAddressDiffers
      ? orNull(values.deliveryAddress)
      : null,
    deliveryStateCode: values.deliveryAddressDiffers
      ? orNull(values.deliveryStateCode)
      : null,
    remark: orNull(values.remark),
    additionalCharges: Number(paise(values.additionalCharges)),
    deductionAmount: Number(paise(values.deductionAmount)),
    items: values.lines.map((line) => {
      const discount = lineDiscount(line);
      return {
        materialId: line.materialId,
        purchaseRequestItemId: line.purchaseRequestItemId,
        quantity: line.quantity.trim(),
        unitRate: Number(paise(line.rate)),
        discount:
          discount == null
            ? null
            : discount.type === "amount"
              ? { type: "amount" as const, paise: Number(discount.paise) }
              : discount,
        gstRate: orNull(line.gstRate),
        hsnCode: orNull(line.hsnCode),
        remark: orNull(line.remark),
      };
    }),
    approve,
  };
}

function siteLocationBody(ref: LocationRef | null) {
  if (ref == null) return null;
  switch (ref.type) {
    case "wing":
      return {
        type: ref.type,
        wingId: ref.wingId,
        floorIds: [...ref.floorIds],
        unitIds: [...ref.unitIds],
      };
    case "amenity":
    case "common_development":
      return { type: ref.type, developmentId: ref.developmentId };
    case "location":
      return { type: ref.type, locationId: ref.locationId };
  }
}
