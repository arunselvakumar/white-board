import type { ApiCall } from "../../../.storybook/mocks/api";
import { PROCUREMENT_ACCESS_MENUS } from "@/app/api/construction/procurement/access/access-models";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import {
  GOODS_RECEIPTS_API,
  type GoodsReceipt,
  type GoodsReceiptFormOptions,
  type GoodsReceiptListItem,
  type GoodsReceiptPage,
} from "@/src/queries/goods-receipts";
import type { ProcurementAccess } from "@/src/queries/procurement-access";
import type { Flag } from "@/src/shared-kernel/access";

/** Goods Receipt fixtures for stories (CM-505): a Chennai site. */

export const PROJECT_ID = "0199c4a0-0000-7000-8000-000000000101";
export const TODAY = "2026-10-10";

const SUPPLIER = {
  id: "0199c4a0-0000-7000-8000-00000000d001",
  name: "Sri Murugan Traders",
};
const KARNATAKA = {
  id: "0199c4a0-0000-7000-8000-00000000d002",
  name: "Bengaluru Steels",
};
const PO_ID = "0199c4a0-0000-7000-8000-00000000e001";
const CEMENT_LINE = "0199c4a0-0000-7000-8000-00000000e101";
const STEEL_LINE = "0199c4a0-0000-7000-8000-00000000e102";
export const GRN_ID = "0199c4a0-0000-7000-8000-00000000f001";

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "print",
  "report",
  "view_all",
  "notification",
  "financial",
];

/** Access for the Material Received menu only. */
export function accessWith(
  flags: readonly Flag[] = ALL_FLAGS,
): ProcurementAccess {
  const menus = Object.fromEntries(
    PROCUREMENT_ACCESS_MENUS.map((menu) => [
      menu,
      menu === "procurement.material_received" ? [...flags] : ["read"],
    ]),
  ) as ProcurementAccess["menus"];
  return { projectId: PROJECT_ID, menus };
}

export const NO_FINANCIAL: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "print",
];

export const FORM_OPTIONS: GoodsReceiptFormOptions = {
  location: {
    kind: "project",
    id: PROJECT_ID,
    name: "Anugraha Towers",
    stateCode: "33",
  },
  suppliers: [
    { ...KARNATAKA, gstin: "29AABCB1234C1Z5", stateCode: "29" },
    { ...SUPPLIER, gstin: "33AABCU9603R1ZM", stateCode: "33" },
  ],
  purchaseOrders: [
    {
      id: PO_ID,
      number: "PO/26-27/00012",
      orderDate: "2026-09-28",
      supplierId: SUPPLIER.id,
      supplierName: SUPPLIER.name,
      supplyType: "intra_state",
      receiptStatus: "partially_received",
      lines: [
        {
          id: CEMENT_LINE,
          materialId: "0199c4a0-0000-7000-8000-00000000a001",
          materialName: "Cement OPC 53 Grade",
          uomName: "Bag",
          hsnCode: "2523",
          orderedQty: "100.000",
          receivedQty: "60.000",
          unitRate: 40_000,
          gstRate: "28.00",
        },
        {
          id: STEEL_LINE,
          materialId: "0199c4a0-0000-7000-8000-00000000a002",
          materialName: "TMT Steel Bar 12 mm",
          uomName: "kg",
          hsnCode: "7214",
          orderedQty: "500.000",
          receivedQty: "0.000",
          unitRate: 5_400,
          gstRate: "18.00",
        },
      ],
    },
  ],
  hiddenFields: [],
  financial: true,
};

export const RECEIPT: GoodsReceipt = {
  id: GRN_ID,
  number: "GRN/26-27/00007",
  locationKind: "project",
  locationId: PROJECT_ID,
  locationName: "Anugraha Towers",
  receiptDate: "2026-10-08",
  inventoryDate: "2026-10-08",
  supplier: SUPPLIER,
  purchaseOrder: { id: PO_ID, number: "PO/26-27/00012" },
  supplyType: "intra_state",
  invoiceNo: "SMT/2026/118",
  invoiceDate: "2026-10-07",
  invoiceAmount: 3_500_000,
  deliveryChallanNo: "DC-4471",
  grnDcNo: null,
  vehicleNo: "TN 09 AB 1234",
  driverName: "Murugan",
  driverMobile: "+917708165767",
  ewayBillNo: "123456789012",
  remark: "Unloaded near Wing B.",
  taxableTotal: 2_670_000,
  cgstTotal: 360_300,
  sgstTotal: 360_300,
  igstTotal: 0,
  totalValue: 3_390_600,
  lines: [
    {
      id: "0199c4a0-0000-7000-8000-00000000f101",
      purchaseOrderItemId: CEMENT_LINE,
      position: 1,
      materialId: "0199c4a0-0000-7000-8000-00000000a001",
      materialName: "Cement OPC 53 Grade",
      uomName: "Bag",
      hsnCode: "2523",
      receivedQty: "60.000",
      orderedQty: "100.000",
      receivedElsewhereQty: "50.000",
      totalReceivedQty: "110.000",
      excessQty: "10.000",
      unitRate: 40_000,
      gstRate: "28.00",
      taxable: 2_400_000,
      cgst: 336_000,
      sgst: 336_000,
      igst: 0,
      total: 3_072_000,
    },
    {
      id: "0199c4a0-0000-7000-8000-00000000f102",
      purchaseOrderItemId: STEEL_LINE,
      position: 2,
      materialId: "0199c4a0-0000-7000-8000-00000000a002",
      materialName: "TMT Steel Bar 12 mm",
      uomName: "kg",
      hsnCode: "7214",
      receivedQty: "50.000",
      orderedQty: "500.000",
      receivedElsewhereQty: "0.000",
      totalReceivedQty: "50.000",
      excessQty: null,
      unitRate: 5_400,
      gstRate: "18.00",
      taxable: 270_000,
      cgst: 24_300,
      sgst: 24_300,
      igst: 0,
      total: 318_600,
    },
  ],
  hiddenFields: [],
  financial: true,
  paid: false,
  createdBy: { id: "user-1", name: "Prabhu Saravanan" },
  createdAt: "2026-10-08T10:15:00.000Z",
  updatedAt: "2026-10-08T10:15:00.000Z",
};

/** The same GRN as a member without Financial sees it. */
export const RECEIPT_NO_FINANCIAL: GoodsReceipt = {
  ...RECEIPT,
  financial: false,
  invoiceAmount: null,
  taxableTotal: null,
  cgstTotal: null,
  sgstTotal: null,
  igstTotal: null,
  totalValue: null,
  lines: RECEIPT.lines.map((line) => ({
    ...line,
    unitRate: null,
    taxable: null,
    cgst: null,
    sgst: null,
    igst: null,
    total: null,
  })),
};

const LIST_ITEMS: GoodsReceiptListItem[] = [
  {
    id: GRN_ID,
    number: "GRN/26-27/00007",
    receiptDate: "2026-10-08",
    inventoryDate: "2026-10-08",
    supplier: SUPPLIER,
    purchaseOrder: { id: PO_ID, number: "PO/26-27/00012" },
    invoiceNo: "SMT/2026/118",
    deliveryChallanNo: "DC-4471",
    totalValue: 3_390_600,
    lineCount: 2,
    createdAt: "2026-10-08T10:15:00.000Z",
  },
  {
    id: "0199c4a0-0000-7000-8000-00000000f002",
    number: "GRN/26-27/00006",
    receiptDate: "2026-10-05",
    inventoryDate: "2026-10-06",
    supplier: KARNATAKA,
    purchaseOrder: null,
    invoiceNo: null,
    deliveryChallanNo: "BS-118",
    totalValue: 1_475_000,
    lineCount: 1,
    createdAt: "2026-10-05T09:00:00.000Z",
  },
];

export function listPage(
  items: GoodsReceiptListItem[] = LIST_ITEMS,
  financial = true,
): GoodsReceiptPage {
  return {
    items: items.map((item) =>
      financial ? item : { ...item, totalValue: null },
    ),
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    suppliers: [KARNATAKA, SUPPLIER],
    financial,
  };
}

/**
 * Answers the GRN routes, the access read and the material picker for
 * a story's `mockApi`.
 */
export function goodsReceiptHandler(options: {
  access?: ProcurementAccess;
  page?: (url: URL) => GoodsReceiptPage;
  formOptions?: GoodsReceiptFormOptions;
  receipt?: GoodsReceipt;
  post?: (call: ApiCall) => Response;
  update?: (call: ApiCall) => Response;
  remove?: (call: ApiCall) => Response;
}) {
  return (call: ApiCall): Response | undefined => {
    const url = new URL(call.path, "http://storybook.local");
    if (url.pathname === "/api/construction/procurement/access")
      return Response.json(options.access ?? accessWith());
    const material = materialOptionsHandler(call);
    if (material != null) return material;
    if (call.method === "GET") {
      if (url.pathname === GOODS_RECEIPTS_API)
        return Response.json((options.page ?? (() => listPage()))(url));
      if (url.pathname === `${GOODS_RECEIPTS_API}/form-options`)
        return Response.json(options.formOptions ?? FORM_OPTIONS);
      if (url.pathname === `${GOODS_RECEIPTS_API}/${GRN_ID}`)
        return Response.json(options.receipt ?? RECEIPT);
      return undefined;
    }
    if (url.pathname === GOODS_RECEIPTS_API)
      return options.post?.(call) ?? Response.json(RECEIPT, { status: 201 });
    if (url.pathname === `${GOODS_RECEIPTS_API}/${GRN_ID}/update`)
      return options.update?.(call) ?? Response.json(RECEIPT);
    if (url.pathname === `${GOODS_RECEIPTS_API}/${GRN_ID}/delete`)
      return options.remove?.(call) ?? new Response(null, { status: 204 });
    return undefined;
  };
}
