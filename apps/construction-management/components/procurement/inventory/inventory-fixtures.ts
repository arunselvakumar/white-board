import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  PROCUREMENT_ACCESS_MENUS,
  type ProcurementAccessMenu,
} from "@/app/api/construction/procurement/access/access-models";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import { menuByKey, type Flag } from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import type {
  InventoryImportResult,
  InventoryList,
  InventoryRow,
  StockEntry,
  StockRegister,
} from "@/src/queries/inventory";

/** Story fixtures for Current Inventory (CM-506). */

export const SITE = {
  kind: "project" as const,
  id: "0199c4a0-0000-7000-8000-0000000d0001",
  name: "Anugraha Towers",
};

export const INVENTORY_API = "/api/construction/procurement/inventory";

export const CEMENT_ID = "0199c4a0-0000-7000-8000-00000000a001";
export const STEEL_ID = "0199c4a0-0000-7000-8000-00000000a002";
export const SAND_ID = "0199c4a0-0000-7000-8000-00000000a003";
export const PAINT_ID = "0199c4a0-0000-7000-8000-00000000a004";

const CIVIL = "0199c4a0-0000-7000-8000-00000000c001";
const PAINTS = "0199c4a0-0000-7000-8000-00000000c002";

function row(
  extra: Partial<InventoryRow> &
    Pick<InventoryRow, "materialId" | "materialName">,
): InventoryRow {
  return {
    categoryId: CIVIL,
    categoryName: "Civil Work Materials",
    uomId: "0199c4a0-0000-7000-8000-00000000b001",
    uomName: "Bag",
    estimatedQty: null,
    inStock: "0.000",
    inTransitIn: "0.000",
    inTransitOut: "0.000",
    minimum: null,
    minimumOverride: null,
    materialMinimum: null,
    alertEnabled: false,
    state: "in_stock",
    ...extra,
  };
}

export const INVENTORY_ROWS: InventoryRow[] = [
  row({
    materialId: CEMENT_ID,
    materialName: "Cement OPC 53 Grade",
    estimatedQty: "1200.000",
    inStock: "42.000",
    inTransitIn: "100.000",
    minimum: "50.000",
    materialMinimum: "50.000",
    alertEnabled: true,
    state: "low_stock",
  }),
  row({
    materialId: PAINT_ID,
    materialName: "Asian Paints Apex Exterior Emulsion",
    categoryId: PAINTS,
    categoryName: "Colour & Paints",
    uomName: "Litre",
    inStock: "60.000",
    state: "in_stock",
  }),
  row({
    materialId: SAND_ID,
    materialName: "M Sand",
    uomName: "cum",
    estimatedQty: "300.000",
    inStock: "0.000",
    state: "out_of_stock",
  }),
  row({
    materialId: STEEL_ID,
    materialName: "TMT Steel Bar 12 mm",
    uomName: "kg",
    estimatedQty: "18000.000",
    inStock: "2450.500",
    inTransitOut: "500.000",
    minimum: "500.000",
    minimumOverride: "500.000",
    materialMinimum: "500.000",
    state: "in_stock",
  }),
];

export const MOVEMENT_ID = "0199c4a0-0000-7000-8000-0000000e1001";

export const CEMENT_HISTORY: StockEntry[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000f0004",
    entryDate: "2026-10-08",
    type: "consumed",
    typeLabel: "Consumed",
    quantity: "-18.000",
    balance: "42.000",
    source: {
      type: "stock_movement",
      id: MOVEMENT_ID,
      number: null,
      href: null,
    },
    counterpartyLabel: null,
    siteLocation: null,
    remark: "Plastering, 3rd floor",
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: "2026-10-08T10:15:00.000Z",
    reversesEntryId: null,
    reversed: false,
    movement: {
      id: MOVEMENT_ID,
      kind: "consumed",
      editable: true,
      updatedAt: "2026-10-08T10:15:00.000Z",
    },
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000f0003",
    entryDate: "2026-10-05",
    type: "transferred_out",
    typeLabel: "Transferred out",
    quantity: "-40.000",
    balance: "60.000",
    source: {
      type: "material_transfer",
      id: "0199c4a0-0000-7000-8000-0000000a0001",
      number: "MT/26-27/00004",
      href: `/app/projects/${SITE.id}/materials/transfers/0199c4a0-0000-7000-8000-0000000a0001`,
    },
    counterpartyLabel: "To Villa Phase 2",
    siteLocation: null,
    remark: null,
    createdBy: { userId: "user-anitha", name: "Anitha S" },
    createdAt: "2026-10-05T09:00:00.000Z",
    reversesEntryId: null,
    reversed: false,
    movement: null,
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000f0002",
    entryDate: "2026-10-02",
    type: "received",
    typeLabel: "Received",
    quantity: "100.000",
    balance: "100.000",
    source: {
      type: "goods_receipt",
      id: "0199c4a0-0000-7000-8000-0000000b0001",
      number: "GRN/26-27/00012",
      href: `/app/projects/${SITE.id}/materials/goods-received/0199c4a0-0000-7000-8000-0000000b0001`,
    },
    counterpartyLabel: "From Sri Murugan Traders",
    siteLocation: null,
    remark: null,
    createdBy: { userId: "user-anitha", name: "Anitha S" },
    createdAt: "2026-10-02T12:30:00.000Z",
    reversesEntryId: null,
    reversed: false,
    movement: null,
  },
];

export const REGISTER: StockRegister = {
  location: SITE,
  from: "2026-10-01",
  to: "2026-10-10",
  items: [
    {
      materialId: CEMENT_ID,
      materialName: "Cement OPC 53 Grade",
      categoryName: "Civil Work Materials",
      uomName: "Bag",
      opening: "0.000",
      received: "100.000",
      transferredIn: "0.000",
      transferredOut: "40.000",
      issued: "0.000",
      receivedFromStore: "0.000",
      consumed: "18.000",
      missing: "0.000",
      adjustment: "0.000",
      closing: "42.000",
    },
    {
      materialId: STEEL_ID,
      materialName: "TMT Steel Bar 12 mm",
      categoryName: "Civil Work Materials",
      uomName: "kg",
      opening: "2000.000",
      received: "1000.000",
      transferredIn: "0.000",
      transferredOut: "0.000",
      issued: "0.000",
      receivedFromStore: "250.000",
      consumed: "799.500",
      missing: "0.000",
      adjustment: "0.000",
      closing: "2450.500",
    },
  ],
};

/** Every flag each procurement menu supports, unless `flags` narrows it. */
export function procurementAccess(
  projectId: string | null,
  flags: Partial<Record<ProcurementAccessMenu, Flag[]>> = {},
) {
  return {
    projectId,
    menus: Object.fromEntries(
      PROCUREMENT_ACCESS_MENUS.map((menu) => [
        menu,
        flags[menu] ?? fromMask(menuByKey(menu)?.supported ?? 0),
      ]),
    ),
  };
}

export const LOCATION_OPTIONS_EMPTY = {
  types: [],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [],
};

export type InventoryApiOptions = {
  rows?: InventoryRow[];
  history?: StockEntry[];
  /** Refuse consume / missing with STOCK_INSUFFICIENT. */
  shortfall?: {
    materialId: string;
    materialName: string;
    shortBy: string;
    onDate: string;
  };
  flags?: Partial<Record<ProcurementAccessMenu, Flag[]>>;
  importResult?: InventoryImportResult;
  register?: StockRegister;
};

function summaryOf(rows: readonly InventoryRow[]): InventoryList["summary"] {
  return {
    materials: rows.length,
    inStock: rows.filter((item) => item.state === "in_stock").length,
    lowStock: rows.filter((item) => item.state === "low_stock").length,
    outOfStock: rows.filter((item) => item.state === "out_of_stock").length,
  };
}

/**
 * Answers Current Inventory's reads and writes for one story (and the
 * picker's material options and location options). Writes answer as the
 * server would; the list stays as given.
 */
export function inventoryHandler(
  options: InventoryApiOptions = {},
): (call: ApiCall) => Response | undefined {
  const rows = options.rows ?? INVENTORY_ROWS;
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    if (path === "/api/construction/procurement/access")
      return Response.json(
        procurementAccess(
          new URL(call.path, "http://storybook.local").searchParams.get(
            "projectId",
          ),
          options.flags,
        ),
      );
    if (
      /\/api\/construction\/projects\/projects\/[^/]+\/location-options$/.test(
        path,
      )
    )
      return Response.json(LOCATION_OPTIONS_EMPTY);
    const material = materialOptionsHandler(call);
    if (material != null) return material;
    if (call.method === "GET" && path === INVENTORY_API)
      return Response.json({
        location: SITE,
        items: rows,
        summary: summaryOf(rows),
      } satisfies InventoryList);
    if (call.method === "GET" && path === `${INVENTORY_API}/history`) {
      const materialId = new URL(
        call.path,
        "http://storybook.local",
      ).searchParams.get("materialId");
      const items =
        materialId === CEMENT_ID ? (options.history ?? CEMENT_HISTORY) : [];
      return Response.json({
        material: rows.find((item) => item.materialId === materialId) ?? null,
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      });
    }
    if (call.method === "GET" && path === `${INVENTORY_API}/register`)
      return Response.json(options.register ?? REGISTER);
    if (call.method === "POST" && path === `${INVENTORY_API}/movements`) {
      if (options.shortfall != null)
        return Response.json(
          {
            code: "STOCK_INSUFFICIENT",
            message: `Not enough ${options.shortfall.materialName} in stock.`,
            details: {
              shortfalls: [
                {
                  locationKind: "project",
                  locationId: SITE.id,
                  ...options.shortfall,
                },
              ],
            },
          },
          { status: 409 },
        );
      const body = call.body as {
        lines: { materialId: string }[];
        kind: string;
      };
      return Response.json(
        {
          items: body.lines.map((item, index) => ({
            id: `0199c4a0-0000-7000-8000-0000000e2${String(index).padStart(3, "0")}`,
            location: { kind: "project", id: SITE.id },
            kind: body.kind,
            date: "2026-10-10",
            materialId: item.materialId,
            quantity: "1.000",
            siteLocation: null,
            remark: null,
            createdAt: "2026-10-10T10:00:00.000Z",
            updatedAt: "2026-10-10T10:00:00.000Z",
          })),
        },
        { status: 201 },
      );
    }
    if (call.method === "POST" && path === `${INVENTORY_API}/adjustments`)
      return Response.json({ id: MOVEMENT_ID }, { status: 201 });
    if (call.method === "POST" && path === `${INVENTORY_API}/settings`) {
      const body = call.body as { materialId: string };
      return Response.json(
        rows.find((item) => item.materialId === body.materialId),
      );
    }
    if (
      call.method === "POST" &&
      path.startsWith(`${INVENTORY_API}/movements/`)
    )
      return path.endsWith("/delete")
        ? new Response(null, { status: 204 })
        : Response.json({ id: MOVEMENT_ID });
    if (call.method === "POST" && path === `${INVENTORY_API}/import`) {
      const result = options.importResult ?? IMPORT_PREVIEW;
      const dryRun = call.path.includes("dryRun=true");
      return Response.json(
        dryRun ? result : { ...result, imported: 1, estimatesSet: 2 },
        { status: dryRun ? 200 : 201 },
      );
    }
    return undefined;
  };
}

export const IMPORT_PREVIEW: InventoryImportResult = {
  rows: [
    {
      row: 2,
      material: "Cement OPC 53 Grade",
      materialId: CEMENT_ID,
      quantity: "120.000",
      estimatedQty: "500.000",
      errors: [],
    },
    {
      row: 3,
      material: "M Sand",
      materialId: SAND_ID,
      quantity: null,
      estimatedQty: "300.000",
      errors: [],
    },
  ],
  errorCount: 0,
  imported: 0,
  estimatesSet: 0,
};

export const IMPORT_WITH_ERRORS: InventoryImportResult = {
  rows: [
    ...IMPORT_PREVIEW.rows,
    {
      row: 4,
      material: "Granite slab",
      materialId: null,
      quantity: "10.000",
      estimatedQty: null,
      errors: [
        {
          code: "MATERIAL_NOT_FOUND",
          message: "No material named “Granite slab” in Masters.",
        },
      ],
    },
  ],
  errorCount: 1,
  imported: 0,
  estimatesSet: 0,
};

/** `mockApi` with the inventory handler. */
export function mockInventoryApi(options: InventoryApiOptions = {}) {
  return mockApi(inventoryHandler(options));
}
