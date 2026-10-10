import type { ApiCall } from "../../../.storybook/mocks/api";
import {
  CEMENT,
  LOCATION_OPTIONS,
  PARTLY_ORDERED_PR,
  PROJECT_ID,
  procurementAccess,
  QUANTITY_INFO,
  SAND,
  STEEL,
} from "@/components/procurement/purchase-requests/purchase-request-fixtures";
import { documentsHandler } from "@/components/procurement/documents/document-fixtures";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import type { ProcurementAccess } from "@/src/queries/procurement-access";
import {
  PURCHASE_ORDERS_API,
  type PurchaseOrderDetail,
  type PurchaseOrderFormOptions,
  type PurchaseOrderPage,
} from "@/src/queries/purchase-orders";

/** Purchase Order story fixtures (CM-504). */

export { CEMENT, PROJECT_ID, SAND, STEEL };
export const TODAY = "2026-10-10";

export const SUPPLIER = {
  id: "0199c4a0-0000-7000-8000-0000000s0001",
  name: "முருகன் டிரேடர்ஸ்",
  gstin: "33AABCU9603R1ZM",
  stateCode: "33",
  mobile: "+917708165767",
  contactPerson: "Murugan",
};

export const FORM_OPTIONS: PurchaseOrderFormOptions = {
  location: {
    kind: "project",
    id: PROJECT_ID,
    name: "Tower A",
    address: "Anna Nagar, Chennai",
    stateCode: "33",
  },
  suppliers: [SUPPLIER],
  billingAddresses: [
    {
      id: "0199c4a0-0000-7000-8000-0000000b0001",
      name: "Head office",
      address: "12, Anna Salai, Chennai 600002",
      stateCode: "33",
      gstin: "33AAACA1234A1Z5",
      isDefault: true,
    },
  ],
  terms: [
    {
      id: "0199c4a0-0000-7000-8000-0000000t0001",
      title: "Delivery",
      body: "Material to be delivered at site between 9 am and 6 pm.",
    },
  ],
  purchaseRequests: [
    {
      id: PARTLY_ORDERED_PR.id,
      number: PARTLY_ORDERED_PR.number,
      requestDate: PARTLY_ORDERED_PR.requestDate,
      requiredDate: PARTLY_ORDERED_PR.requiredDate,
      items: PARTLY_ORDERED_PR.items.map((item) => ({
        id: item.id,
        materialId: item.materialId,
        materialName: item.materialName,
        uomName: item.uomName,
        quantity: item.quantity,
        orderedQty: item.orderedQty,
        pendingQty: item.pendingQty,
      })),
    },
  ],
};

const ACTIONS = {
  edit: true,
  delete: true,
  approve: true,
  reject: true,
  markOrdered: false,
  close: false,
  print: true,
};

export const PENDING_PO: PurchaseOrderDetail = {
  id: "0199c4a0-0000-7000-8000-0000000o0002",
  locationKind: "project",
  locationId: PROJECT_ID,
  number: "PO/26-27/00002",
  orderDate: "2026-10-09",
  expectedDeliveryDate: "2026-10-14",
  purchaseRequest: null,
  supplier: {
    id: SUPPLIER.id,
    name: SUPPLIER.name,
    gstin: SUPPLIER.gstin,
    stateCode: "33",
  },
  siteLocation: null,
  supplyType: "intra_state",
  placeOfSupplyStateCode: "33",
  billing: {
    id: "0199c4a0-0000-7000-8000-0000000b0001",
    name: "Head office",
    address: "12, Anna Salai, Chennai 600002",
    stateCode: "33",
    gstin: "33AAACA1234A1Z5",
  },
  supplierPoc: { name: "Murugan", mobile: "+917708165767" },
  sitePoc: { name: null, mobile: null },
  paymentTermsDays: 30,
  deliveryAddressDiffers: false,
  deliveryAddress: null,
  deliveryStateCode: null,
  remark: null,
  totals: {
    subTotal: 3_850_000,
    discountTotal: 0,
    taxableTotal: 3_850_000,
    cgstTotal: 539_000,
    sgstTotal: 539_000,
    igstTotal: 0,
    itemsTotal: 4_928_000,
    additionalCharges: 0,
    deductionAmount: 0,
    grandTotal: 4_928_000,
  },
  terms: [
    {
      termsId: "0199c4a0-0000-7000-8000-0000000t0001",
      title: "Delivery",
      body: "Material to be delivered at site between 9 am and 6 pm.",
    },
  ],
  approvalStatus: "pending",
  decidedAt: null,
  decidedBy: null,
  rejectionReason: null,
  stage: "pending",
  orderedAt: null,
  orderedBy: null,
  receiptStatus: "not_received",
  closedAt: null,
  closedBy: null,
  closeReason: null,
  createdBy: { userId: "user-karthik", name: "Karthik R" },
  createdAt: "2026-10-09T06:00:00.000Z",
  updatedAt: "2026-10-09T06:00:00.000Z",
  items: [
    {
      id: "0199c4a0-0000-7000-8000-0000000j0001",
      materialId: CEMENT.id,
      materialName: CEMENT.name,
      uomId: CEMENT.uomId,
      uomName: CEMENT.uomName,
      purchaseRequestItemId: null,
      hsnCode: "2523",
      quantity: "100.000",
      unitRate: 38_500,
      discountType: null,
      discountPercent: null,
      gstRate: "28.00",
      subTotal: 3_850_000,
      discountAmount: 0,
      taxable: 3_850_000,
      cgst: 539_000,
      sgst: 539_000,
      igst: 0,
      total: 4_928_000,
      remark: null,
      receivedQty: "0.000",
    },
  ],
  actions: ACTIONS,
  goodsReceipts: [],
};

export const ORDERED_PO: PurchaseOrderDetail = {
  ...PENDING_PO,
  id: "0199c4a0-0000-7000-8000-0000000o0001",
  number: "PO/26-27/00001",
  orderDate: "2026-10-06",
  purchaseRequest: {
    id: PARTLY_ORDERED_PR.id,
    number: PARTLY_ORDERED_PR.number,
  },
  approvalStatus: "approved",
  decidedAt: "2026-10-06T09:00:00.000Z",
  decidedBy: { userId: "user-owner", name: "Arun Selva Kumar" },
  stage: "ordered",
  orderedAt: "2026-10-06T10:00:00.000Z",
  orderedBy: { userId: "user-owner", name: "Arun Selva Kumar" },
  receiptStatus: "partially_received",
  createdAt: "2026-10-06T06:00:00.000Z",
  updatedAt: "2026-10-06T10:00:00.000Z",
  actions: {
    ...ACTIONS,
    edit: false,
    approve: false,
    reject: false,
    close: true,
  },
  goodsReceipts: [
    {
      id: "0199c4a0-0000-7000-8000-0000000g0001",
      number: "GRN/26-27/00001",
      receiptDate: "2026-10-08",
    },
  ],
};

export function poPage(items: PurchaseOrderDetail[]): PurchaseOrderPage {
  return {
    items: items.map(({ goodsReceipts: _receipts, ...rest }) => rest),
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    facets: { suppliers: [{ id: SUPPLIER.id, name: SUPPLIER.name }] },
  };
}

export type PoApiOptions = {
  items?: PurchaseOrderDetail[];
  access?: ProcurementAccess;
  options?: PurchaseOrderFormOptions;
};

/** Every read the Purchase Order screens make. POSTs answer with the first PO. */
export function purchaseOrdersHandler(options: PoApiOptions = {}) {
  const items = options.items ?? [PENDING_PO, ORDERED_PO];
  const documents = documentsHandler({ remarks: [], files: [] });
  return (call: ApiCall): Response | undefined => {
    const shared = documents(call) ?? materialOptionsHandler(call);
    if (shared != null) return shared;
    const url = new URL(call.path, "http://storybook.local");
    if (url.pathname === "/api/construction/procurement/access")
      return Response.json(options.access ?? procurementAccess());
    if (url.pathname.endsWith("/location-options"))
      return Response.json(LOCATION_OPTIONS);
    if (
      url.pathname ===
      "/api/construction/procurement/purchase-requests/quantity-info"
    )
      return Response.json({ items: QUANTITY_INFO });
    if (call.method === "POST") {
      if (
        url.pathname.endsWith("/bulk-approve") ||
        url.pathname.endsWith("/bulk-reject")
      )
        return Response.json({
          decided: (call.body as { ids: string[] }).ids.length,
        });
      if (url.pathname.endsWith("/delete"))
        return new Response(null, { status: 204 });
      return Response.json(items[0] ?? PENDING_PO, {
        status: url.pathname === PURCHASE_ORDERS_API ? 201 : 200,
      });
    }
    if (url.pathname === `${PURCHASE_ORDERS_API}/form-options`)
      return Response.json(options.options ?? FORM_OPTIONS);
    if (url.pathname === PURCHASE_ORDERS_API) {
      const approval = url.searchParams.get("approvalStatus");
      return Response.json(
        poPage(
          items.filter(
            (po) => approval == null || po.approvalStatus === approval,
          ),
        ),
      );
    }
    const detail = items.find(
      (po) => url.pathname === `${PURCHASE_ORDERS_API}/${po.id}`,
    );
    if (detail != null) return Response.json(detail);
    return undefined;
  };
}
