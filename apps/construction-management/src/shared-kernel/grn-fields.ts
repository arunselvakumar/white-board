/**
 * The optional Goods Receipt fields a Company may hide (Settings → GRN
 * fields, ADR CM-0015 §9). Hidden fields are neither shown on the GRN form
 * nor printed. The organization context stores the hidden keys; procurement
 * reads them through its directory port.
 */
export const GRN_OPTIONAL_FIELDS = [
  "invoiceNo",
  "invoiceDate",
  "invoiceAmount",
  "deliveryChallanNo",
  "grnDcNo",
  "vehicleNo",
  "driverName",
  "driverMobile",
  "ewayBillNo",
  "remark",
] as const;

export type GrnOptionalField = (typeof GRN_OPTIONAL_FIELDS)[number];

export const GRN_FIELD_GROUPS = [
  "supplier_details",
  "delivery_details",
  "remark",
] as const;

export type GrnFieldGroup = (typeof GRN_FIELD_GROUPS)[number];

export const GRN_FIELD_GROUP_LABELS: Record<GrnFieldGroup, string> = {
  supplier_details: "Supplier details",
  delivery_details: "Delivery details",
  remark: "Remark",
};

export const GRN_FIELD_INFO: Record<
  GrnOptionalField,
  { label: string; group: GrnFieldGroup }
> = {
  invoiceNo: { label: "Invoice No", group: "supplier_details" },
  invoiceDate: { label: "Invoice Date", group: "supplier_details" },
  invoiceAmount: { label: "Invoice Amount", group: "supplier_details" },
  deliveryChallanNo: {
    label: "Delivery Challan No",
    group: "delivery_details",
  },
  grnDcNo: { label: "GRN/DC No", group: "delivery_details" },
  vehicleNo: { label: "Vehicle No", group: "delivery_details" },
  driverName: { label: "Driver name", group: "delivery_details" },
  driverMobile: { label: "Driver mobile", group: "delivery_details" },
  ewayBillNo: { label: "E-way bill No", group: "delivery_details" },
  remark: { label: "Remark", group: "remark" },
};

const KEYS = new Set<string>(GRN_OPTIONAL_FIELDS);

export function isGrnOptionalField(value: string): value is GrnOptionalField {
  return KEYS.has(value);
}
