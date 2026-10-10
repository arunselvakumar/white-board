import type { ApiCall } from "../../../.storybook/mocks/api";
import { PROCUREMENT_ACCESS_MENUS } from "@/app/api/construction/procurement/access/access-models";
import { documentsHandler } from "@/components/procurement/documents/document-fixtures";
import {
  MATERIAL_OPTIONS,
  materialOptionsHandler,
} from "@/components/procurement/material-options-fixtures";
import type { LocationOptions } from "@/src/queries/location-options";
import type { ProcurementAccess } from "@/src/queries/procurement-access";
import type {
  PurchaseRequest,
  PurchaseRequestDetail,
  PurchaseRequestPage,
  PurchaseRequestQuantityInfo,
} from "@/src/queries/purchase-requests";
import { PURCHASE_REQUESTS_API } from "@/src/queries/purchase-requests";
import type { Flag } from "@/src/shared-kernel/access";

/** Purchase Request story fixtures (CM-503): a Chennai tower's requests. */

export const PROJECT_ID = "0199c4a0-0000-7000-8000-0000000p0001";
export const TODAY = "2026-10-10";

const [CEMENT, STEEL, SAND] = MATERIAL_OPTIONS as [
  (typeof MATERIAL_OPTIONS)[number],
  (typeof MATERIAL_OPTIONS)[number],
  (typeof MATERIAL_OPTIONS)[number],
];

export { CEMENT, SAND, STEEL };

export const LOCATION_OPTIONS: LocationOptions = {
  structure: "locations",
  types: ["location"],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [
    { id: "0199c4a0-0000-7000-8000-0000000l0001", name: "Culvert C3" },
    { id: "0199c4a0-0000-7000-8000-0000000l0002", name: "Site office" },
  ],
};

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
];

/** The access read: every PR and PO flag unless `flags` says otherwise. */
export function procurementAccess(
  flags: { purchaseRequests?: Flag[]; purchaseOrders?: Flag[] } = {},
): ProcurementAccess {
  const menus = Object.fromEntries(
    PROCUREMENT_ACCESS_MENUS.map((menu) => [menu, ["read"] as Flag[]]),
  ) as ProcurementAccess["menus"];
  menus["procurement.purchase_requests"] = flags.purchaseRequests ?? ALL_FLAGS;
  menus["procurement.purchase_orders"] = flags.purchaseOrders ?? ALL_FLAGS;
  return { projectId: PROJECT_ID, menus };
}

const ALL_ACTIONS = {
  edit: true,
  delete: true,
  approve: true,
  reject: true,
  markOrdered: false,
  generateOrder: false,
  print: true,
};

function item(
  id: string,
  material: (typeof MATERIAL_OPTIONS)[number],
  quantity: string,
  orderedQty = "0.000",
): PurchaseRequestDetail["items"][number] {
  const pending = Math.max(Number(quantity) - Number(orderedQty), 0).toFixed(3);
  return {
    id,
    materialId: material.id,
    materialName: material.name,
    categoryId: material.categoryId,
    categoryName: material.categoryName,
    uomId: material.uomId,
    uomName: material.uomName,
    quantity,
    orderedQty,
    pendingQty: pending,
    remark: null,
  };
}

const KARTHIK = { userId: "user-karthik", name: "Karthik R" };
const OWNER = { userId: "user-owner", name: "Arun Selva Kumar" };

export const PENDING_PR: PurchaseRequestDetail = {
  id: "0199c4a0-0000-7000-8000-0000000r0001",
  projectId: PROJECT_ID,
  number: "PR/26-27/00003",
  requestDate: "2026-10-09",
  requiredDate: "2026-10-15",
  siteLocation: {
    type: "location",
    locationId: "0199c4a0-0000-7000-8000-0000000l0001",
  },
  remark: null,
  separateRemarks: false,
  commonRemark: "For the 3rd floor slab casting",
  source: "manual",
  approvalStatus: "pending",
  decidedAt: null,
  decidedBy: null,
  rejectionReason: null,
  orderStatus: "not_ordered",
  markedOrderedAt: null,
  markedOrderedBy: null,
  createdBy: KARTHIK,
  createdAt: "2026-10-09T05:30:00.000Z",
  updatedAt: "2026-10-09T05:30:00.000Z",
  items: [
    item("0199c4a0-0000-7000-8000-0000000i0001", CEMENT, "100.000"),
    item("0199c4a0-0000-7000-8000-0000000i0002", STEEL, "1250.500"),
  ],
  actions: ALL_ACTIONS,
  purchaseOrders: [],
};

export const PARTLY_ORDERED_PR: PurchaseRequestDetail = {
  ...PENDING_PR,
  id: "0199c4a0-0000-7000-8000-0000000r0002",
  number: "PR/26-27/00002",
  requestDate: "2026-10-05",
  requiredDate: "2026-10-12",
  siteLocation: null,
  commonRemark: null,
  approvalStatus: "approved",
  decidedAt: "2026-10-05T09:00:00.000Z",
  decidedBy: OWNER,
  orderStatus: "partially_ordered",
  createdAt: "2026-10-05T04:00:00.000Z",
  updatedAt: "2026-10-05T09:00:00.000Z",
  items: [
    item("0199c4a0-0000-7000-8000-0000000i0003", SAND, "12.000", "8.000"),
  ],
  actions: {
    ...ALL_ACTIONS,
    edit: false,
    approve: false,
    reject: false,
    markOrdered: true,
    generateOrder: true,
  },
  purchaseOrders: [
    {
      id: "0199c4a0-0000-7000-8000-0000000o0001",
      number: "PO/26-27/00001",
      orderDate: "2026-10-06",
      supplierName: "Sri Murugan Traders",
      approvalStatus: "approved",
      grandTotal: 1_218_000,
    },
  ],
};

export const REJECTED_PR: PurchaseRequestDetail = {
  ...PENDING_PR,
  id: "0199c4a0-0000-7000-8000-0000000r0003",
  number: "PR/26-27/00001",
  requestDate: "2026-10-01",
  approvalStatus: "rejected",
  decidedAt: "2026-10-02T09:00:00.000Z",
  decidedBy: OWNER,
  rejectionReason: "Wrong grade; ask for OPC 53",
  createdAt: "2026-10-01T04:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
  actions: { ...ALL_ACTIONS, approve: false, reject: false },
};

function listItem(pr: PurchaseRequestDetail): PurchaseRequest {
  const { purchaseOrders: _orders, ...rest } = pr;
  return rest;
}

export function prPage(items: PurchaseRequestDetail[]): PurchaseRequestPage {
  return {
    items: items.map(listItem),
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    facets: {
      creators: [KARTHIK],
      materials: [CEMENT, STEEL, SAND].map((m) => ({ id: m.id, name: m.name })),
      categories: [
        { id: CEMENT.categoryId ?? "", name: CEMENT.categoryName ?? "" },
      ],
    },
  };
}

export const QUANTITY_INFO: PurchaseRequestQuantityInfo[] = [
  {
    materialId: CEMENT.id,
    availableStock: "40.000",
    estimatedQty: "500.000",
    onTheWay: "100.000",
    balancedEstimatedQty: "360.000",
  },
  {
    materialId: STEEL.id,
    availableStock: "0.000",
    estimatedQty: null,
    onTheWay: "0.000",
    balancedEstimatedQty: null,
  },
];

export type PrApiOptions = {
  items?: PurchaseRequestDetail[];
  access?: ProcurementAccess;
  /** Answer for a POST, by path suffix (`/bulk-approve`, `/<id>/approve`, ``). */
  post?: (call: ApiCall) => Response | undefined;
};

/**
 * Every read the Purchase Request screens make: access, list, detail,
 * quantity info, location and material options, documents. Unanswered
 * POSTs return the first request.
 */
export function purchaseRequestsHandler(options: PrApiOptions = {}) {
  const items = options.items ?? [PENDING_PR, PARTLY_ORDERED_PR, REJECTED_PR];
  const documents = documentsHandler({ remarks: [], files: [] });
  return (call: ApiCall): Response | undefined => {
    const fromDocs = documents(call) ?? materialOptionsHandler(call);
    if (fromDocs != null) return fromDocs;
    const url = new URL(call.path, "http://storybook.local");
    if (url.pathname === "/api/construction/procurement/access")
      return Response.json(options.access ?? procurementAccess());
    if (url.pathname.endsWith("/location-options"))
      return Response.json(LOCATION_OPTIONS);
    if (call.method === "POST") {
      const answer = options.post?.(call);
      if (answer != null) return answer;
      if (
        url.pathname.endsWith("/bulk-approve") ||
        url.pathname.endsWith("/bulk-reject")
      )
        return Response.json({
          decided: (call.body as { ids: string[] }).ids.length,
        });
      if (url.pathname.endsWith("/delete"))
        return new Response(null, { status: 204 });
      return Response.json(items[0] ?? PENDING_PR, {
        status: url.pathname === PURCHASE_REQUESTS_API ? 201 : 200,
      });
    }
    if (url.pathname === `${PURCHASE_REQUESTS_API}/quantity-info`) {
      const ids = url.searchParams.get("materialIds")?.split(",") ?? [];
      return Response.json({
        items: ids.map(
          (id) =>
            QUANTITY_INFO.find((row) => row.materialId === id) ?? {
              materialId: id,
              availableStock: "0.000",
              estimatedQty: null,
              onTheWay: "0.000",
              balancedEstimatedQty: null,
            },
        ),
      });
    }
    if (url.pathname === PURCHASE_REQUESTS_API) {
      const approval = url.searchParams.get("approvalStatus");
      const order = url.searchParams.get("orderStatus");
      return Response.json(
        prPage(
          items.filter(
            (pr) =>
              (approval == null || pr.approvalStatus === approval) &&
              (order == null || pr.orderStatus === order),
          ),
        ),
      );
    }
    const detail = items.find(
      (pr) => url.pathname === `${PURCHASE_REQUESTS_API}/${pr.id}`,
    );
    if (detail != null) return Response.json(detail);
    return undefined;
  };
}
