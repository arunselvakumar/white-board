import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import { documentsHandler } from "@/components/procurement/documents/document-fixtures";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import { PROCUREMENT_ACCESS_MENUS } from "@/app/api/construction/procurement/access/access-models";
import type { CentralInventory, StockLedger } from "@/src/queries/central-inventory";
import type { DeliveryNote } from "@/src/queries/delivery-notes";
import type {
  MaterialRequest,
  MaterialRequestFormOptions,
} from "@/src/queries/material-requests";
import type { ProcurementAccess } from "@/src/queries/procurement-access";
import type { Store, StoreFormOptions, StoreStockRow } from "@/src/queries/stores";
import type { Flag } from "@/src/shared-kernel/access";

/** Central Store fixtures for stories (CM-508, CM-509): a Chennai builder. */

export const API = "/api/construction/procurement";

export const IDS = {
  tower: "0199c4a0-0000-7000-8000-0000000001e1",
  villa: "0199c4a0-0000-7000-8000-0000000001e2",
  store: "0199c4a0-0000-7000-8000-0000000001f1",
  keeper: "0199c4a0-0000-7000-8000-0000000001b1",
  keeper2: "0199c4a0-0000-7000-8000-0000000001b2",
  supplier: "0199c4a0-0000-7000-8000-0000000001d2",
  contractor: "0199c4a0-0000-7000-8000-0000000001c1",
  department: "0199c4a0-0000-7000-8000-0000000001d1",
  request: "0199c4a0-0000-7000-8000-0000000001a1",
  cementLine: "0199c4a0-0000-7000-8000-0000000001a2",
  steelLine: "0199c4a0-0000-7000-8000-0000000001a3",
  note: "0199c4a0-0000-7000-8000-0000000001a4",
  cement: "0199c4a0-0000-7000-8000-00000000a001",
  steel: "0199c4a0-0000-7000-8000-00000000a002",
  category: "0199c4a0-0000-7000-8000-00000000c001",
} as const;

const AT = "2026-10-08T05:30:00.000Z";

export const STORE: Store = {
  id: IDS.store,
  name: "Ambattur Central Store",
  address: "Plot 4, SIDCO Industrial Estate, Ambattur, Chennai 600098",
  stateCode: "33",
  stateName: "Tamil Nadu",
  projects: [
    { id: IDS.tower, name: "Anugraha Towers" },
    { id: IDS.villa, name: "Velachery Villas" },
  ],
  keepers: [{ id: IDS.keeper, name: "Murugan K" }],
  suppliers: [{ id: IDS.supplier, name: "Sri Murugan Traders" }],
  createdAt: AT,
  updatedAt: AT,
};

export const STORE_STOCK: StoreStockRow[] = [
  {
    materialId: IDS.cement,
    materialName: "Cement OPC 53 Grade",
    uomName: "Bag",
    categoryId: IDS.category,
    categoryName: "Civil Work Materials",
    stock: "40.000",
    inTransit: "0.000",
    minimum: "50.000",
    state: "low_stock",
  },
  {
    materialId: IDS.steel,
    materialName: "TMT Steel Bar 12 mm",
    uomName: "kg",
    categoryId: IDS.category,
    categoryName: "Civil Work Materials",
    stock: "1250.500",
    inTransit: "200.000",
    minimum: "500.000",
    state: "in_stock",
  },
];

export const FORM_OPTIONS: StoreFormOptions = {
  projects: [
    { id: IDS.tower, name: "Anugraha Towers" },
    { id: IDS.villa, name: "Velachery Villas" },
  ],
  teamMembers: [
    { id: IDS.keeper, name: "Murugan K" },
    { id: IDS.keeper2, name: "Selvi R" },
  ],
  suppliers: [{ id: IDS.supplier, name: "Sri Murugan Traders" }],
};

export const REQUEST: MaterialRequest = {
  id: IDS.request,
  number: "MR/26-27/00007",
  projectId: IDS.tower,
  projectName: "Anugraha Towers",
  storeId: IDS.store,
  storeName: "Ambattur Central Store",
  requestDate: "2026-10-08",
  contractor: { id: IDS.contractor, name: "Velan Constructions" },
  department: null,
  siteLocation: null,
  receiverName: "Prabhu S",
  remark: "Needed for the 3rd floor slab.",
  status: "partially_delivered",
  closedAt: null,
  closeReason: null,
  items: [
    {
      id: IDS.cementLine,
      position: 1,
      materialId: IDS.cement,
      materialName: "Cement OPC 53 Grade",
      uomId: "0199c4a0-0000-7000-8000-00000000b001",
      uomName: "Bag",
      askQty: "100.000",
      deliveredQty: "60.000",
      inFlightQty: "0.000",
      pendingQty: "40.000",
      remark: null,
    },
    {
      id: IDS.steelLine,
      position: 2,
      materialId: IDS.steel,
      materialName: "TMT Steel Bar 12 mm",
      uomId: "0199c4a0-0000-7000-8000-00000000b002",
      uomName: "kg",
      askQty: "500.000",
      deliveredQty: "0.000",
      inFlightQty: "200.000",
      pendingQty: "300.000",
      remark: "Columns C1–C8",
    },
  ],
  deliveryNotes: [
    { id: IDS.note, number: "DN/26-27/00003", deliveryDate: "2026-10-09", status: "in_transit" },
  ],
  createdAt: AT,
  updatedAt: AT,
};

export const NOTE: DeliveryNote = {
  id: IDS.note,
  number: "DN/26-27/00003",
  materialRequestId: IDS.request,
  materialRequestNumber: "MR/26-27/00007",
  storeId: IDS.store,
  storeName: "Ambattur Central Store",
  projectId: IDS.tower,
  projectName: "Anugraha Towers",
  deliveryDate: "2026-10-09",
  deliveredTo: "Prabhu S",
  remark: null,
  status: "pending",
  approvedAt: null,
  deliveredOn: null,
  deliveredAt: null,
  items: [
    {
      id: "0199c4a0-0000-7000-8000-0000000001a5",
      materialRequestItemId: IDS.steelLine,
      position: 1,
      materialId: IDS.steel,
      materialName: "TMT Steel Bar 12 mm",
      uomName: "kg",
      quantity: "200.000",
      requestedQty: "500.000",
      pendingQty: "500.000",
    },
  ],
  createdAt: AT,
  updatedAt: AT,
};

export const MR_FORM_OPTIONS: MaterialRequestFormOptions = {
  stores: [{ id: IDS.store, name: "Ambattur Central Store", stateCode: "33" }],
  contractors: [{ id: IDS.contractor, name: "Velan Constructions" }],
  departments: [{ id: IDS.department, name: "Civil" }],
};

const position = (
  kind: "project" | "store",
  id: string,
  name: string,
  stock: string,
  inTransit: string,
  state: "in_stock" | "low_stock" | "out_of_stock",
) => ({ location: { kind, id, name }, stock, inTransit, minimum: "50.000", state });

export const INVENTORY: CentralInventory = {
  locations: [
    { kind: "project", id: IDS.tower, name: "Anugraha Towers" },
    { kind: "project", id: IDS.villa, name: "Velachery Villas" },
    { kind: "store", id: IDS.store, name: "Ambattur Central Store" },
  ],
  categories: [{ id: IDS.category, name: "Civil Work Materials" }],
  materials: [
    {
      materialId: IDS.cement,
      materialName: "Cement OPC 53 Grade",
      uomName: "Bag",
      categoryId: IDS.category,
      categoryName: "Civil Work Materials",
      totalStock: "245.000",
      totalInTransit: "0.000",
      positions: [
        position("project", IDS.tower, "Anugraha Towers", "180", "0", "in_stock"),
        position("project", IDS.villa, "Velachery Villas", "25", "0", "low_stock"),
        position("store", IDS.store, "Ambattur Central Store", "40", "0", "low_stock"),
      ],
    },
    {
      materialId: IDS.steel,
      materialName: "TMT Steel Bar 12 mm",
      uomName: "kg",
      categoryId: IDS.category,
      categoryName: "Civil Work Materials",
      totalStock: "1250.500",
      totalInTransit: "200.000",
      positions: [
        position("project", IDS.tower, "Anugraha Towers", "0", "200", "out_of_stock"),
        position("store", IDS.store, "Ambattur Central Store", "1250.5", "0", "in_stock"),
      ],
    },
  ],
};

const zero = {
  opening: "0.000",
  received: "0.000",
  transferred_in: "0.000",
  transferred_out: "0.000",
  issued: "0.000",
  received_from_store: "0.000",
  consumed: "0.000",
  missing: "0.000",
  adjustment: "0.000",
};

export const LEDGER: StockLedger = {
  from: "2026-10-01",
  to: "2026-10-10",
  rows: [
    {
      location: { kind: "store", id: IDS.store, name: "Ambattur Central Store" },
      materialId: IDS.cement,
      materialName: "Cement OPC 53 Grade",
      uomName: "Bag",
      categoryName: "Civil Work Materials",
      opening: "100.000",
      movements: { ...zero, issued: "-60.000" },
      closing: "40.000",
    },
  ],
};

export function access(
  flags: Partial<Record<(typeof PROCUREMENT_ACCESS_MENUS)[number], Flag[]>> | "all" = "all",
): ProcurementAccess {
  const all: Flag[] = [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "print",
  ];
  return {
    projectId: null,
    menus: Object.fromEntries(
      PROCUREMENT_ACCESS_MENUS.map((menu) => [
        menu,
        flags === "all" ? all : (flags[menu] ?? []),
      ]),
    ) as ProcurementAccess["menus"],
  };
}

export type CentralStoreApiOptions = {
  stores?: Store[];
  stock?: StoreStockRow[];
  request?: MaterialRequest;
  requests?: MaterialRequest[];
  note?: DeliveryNote;
  notes?: DeliveryNote[];
  inventory?: CentralInventory;
  access?: ProcurementAccess;
  /** Answers a write with this error instead. */
  writeError?: { status: number; code: string; message: string };
};

function page<T>(items: T[]) {
  return { items, nextCursor: null, prevCursor: null, total: items.length };
}

/** One mock API for every Central Store story; writes echo a saved record. */
export function centralStoreHandler(options: CentralStoreApiOptions = {}) {
  const stores = options.stores ?? [STORE];
  let request = options.request ?? REQUEST;
  let note = options.note ?? NOTE;
  const requests = options.requests ?? [request];
  const notes = options.notes ?? [note];
  const inventory = options.inventory ?? INVENTORY;
  const docs = documentsHandler();
  return (call: ApiCall): Response | undefined => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "POST" && options.writeError != null && path.startsWith(API))
      return Response.json(options.writeError, { status: options.writeError.status });
    const answered = docs(call) ?? materialOptionsHandler(call);
    if (answered != null) return answered;
    if (path.endsWith("/location-options"))
      return Response.json({
        types: ["location"],
        wings: [],
        amenities: [],
        commonDevelopments: [],
        locations: [{ id: "0199c4a0-0000-7000-8000-0000000001a6", name: "Culvert C3" }],
      });
    if (path === `${API}/access`) return Response.json(options.access ?? access());
    if (path === `${API}/stores` && call.method === "GET")
      return Response.json(page(stores));
    if (path === `${API}/stores` && call.method === "POST")
      return Response.json({ ...STORE, ...(call.body as object), id: IDS.store }, { status: 201 });
    if (path === `${API}/stores/form-options`) return Response.json(FORM_OPTIONS);
    if (path === `${API}/stores/${IDS.store}`) return Response.json(stores[0] ?? STORE);
    if (path === `${API}/stores/${IDS.store}/stock`)
      return Response.json({ items: options.stock ?? STORE_STOCK });
    if (path === `${API}/stores/${IDS.store}/update`) return Response.json(STORE);
    if (path === `${API}/stores/${IDS.store}/delete`) return new Response(null, { status: 204 });
    if (path === `${API}/material-requests/form-options`) return Response.json(MR_FORM_OPTIONS);
    if (path === `${API}/material-requests` && call.method === "GET")
      return Response.json(page(requests));
    if (path === `${API}/material-requests` && call.method === "POST")
      return Response.json(request, { status: 201 });
    if (path === `${API}/material-requests/${request.id}`) return Response.json(request);
    if (path === `${API}/material-requests/${request.id}/close`) {
      request = {
        ...request,
        status: "closed",
        closeReason: (call.body as { reason: string }).reason,
        items: request.items.map((item) => ({ ...item, pendingQty: "0.000" })),
      };
      return Response.json(request);
    }
    if (path.startsWith(`${API}/material-requests/${request.id}/`))
      return Response.json(request);
    if (path === `${API}/delivery-notes` && call.method === "GET")
      return Response.json(page(notes));
    if (path === `${API}/delivery-notes` && call.method === "POST")
      return Response.json(note, { status: 201 });
    if (path === `${API}/delivery-notes/${note.id}`) return Response.json(note);
    if (path === `${API}/delivery-notes/${note.id}/approve`) {
      note = { ...note, status: "in_transit", approvedAt: AT };
      return Response.json(note);
    }
    if (path === `${API}/delivery-notes/${note.id}/mark-delivered`) {
      const { deliveredOn } = call.body as { deliveredOn: string };
      note = { ...note, status: "delivered", deliveredOn, deliveredAt: AT };
      return Response.json(note);
    }
    if (path === `${API}/central-inventory`) {
      const query = new URL(call.path, "http://storybook.local").searchParams;
      const state = query.get("state");
      return Response.json({
        ...inventory,
        materials: inventory.materials
          .map((material) => ({
            ...material,
            positions: material.positions.filter(
              (row) => state == null || row.state === state,
            ),
          }))
          .filter((material) => material.positions.length > 0),
      });
    }
    if (path === `${API}/central-inventory/stock-ledger`) return Response.json(LEDGER);
    return undefined;
  };
}

/** `beforeEach` for a story: the mock API, restored after. */
export function mockCentralStoreApi(options: CentralStoreApiOptions = {}) {
  return mockApi(centralStoreHandler(options));
}
