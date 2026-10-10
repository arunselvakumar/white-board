import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type { ProcurementAccessMenu } from "@/app/api/construction/procurement/access/access-models";
import { documentsHandler } from "@/components/procurement/documents/document-fixtures";
import { procurementAccess } from "@/components/procurement/inventory/inventory-fixtures";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import type { Flag } from "@/src/shared-kernel/access";
import type {
  MaterialTransfer,
  MaterialTransferPage,
  TransferLocations,
} from "@/src/queries/material-transfers";

/** Story fixtures for Material Transfers (CM-507). */

export const TRANSFERS_API = "/api/construction/procurement/transfers";

export const TOWER = {
  kind: "project" as const,
  id: "0199c4a0-0000-7000-8000-0000000d0001",
  name: "Anugraha Towers",
};
export const VILLA = {
  kind: "project" as const,
  id: "0199c4a0-0000-7000-8000-0000000d0002",
  name: "Villa Phase 2",
};
export const STORE = {
  kind: "store" as const,
  id: "0199c4a0-0000-7000-8000-0000000d0101",
  name: "Ambattur Central Store",
};

export const CEMENT_ID = "0199c4a0-0000-7000-8000-00000000a001";
export const STEEL_ID = "0199c4a0-0000-7000-8000-00000000a002";

export const LOCATIONS: TransferLocations = {
  projects: [TOWER, VILLA].map(({ id, name }) => ({ id, name })),
  stores: [{ id: STORE.id, name: STORE.name }],
};

const KARTHIK = { userId: "user-karthik", name: "Karthik R" };
const ANITHA = { userId: "user-anitha", name: "Anitha S" };

export function transfer(
  extra: Partial<MaterialTransfer> = {},
): MaterialTransfer {
  return {
    id: "0199c4a0-0000-7000-8000-0000000a0001",
    number: "MT/26-27/00004",
    transferDate: "2026-10-05",
    type: "project_to_project",
    from: TOWER,
    to: VILLA,
    receiverName: "Murugan",
    remark: "For the ground floor slab",
    status: "pending",
    approvalStatus: "pending",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    deliveredOn: null,
    deliveredAt: null,
    deliveredBy: null,
    createdBy: KARTHIK,
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
    lines: [
      {
        id: "0199c4a0-0000-7000-8000-0000000a1001",
        position: 1,
        materialId: CEMENT_ID,
        materialName: "Cement OPC 53 Grade",
        uomId: "0199c4a0-0000-7000-8000-00000000b001",
        uomName: "Bag",
        quantity: "40.000",
        remark: null,
      },
      {
        id: "0199c4a0-0000-7000-8000-0000000a1002",
        position: 2,
        materialId: STEEL_ID,
        materialName: "TMT Steel Bar 12 mm",
        uomId: "0199c4a0-0000-7000-8000-00000000b002",
        uomName: "kg",
        quantity: "500.000",
        remark: "Cut lengths",
      },
    ],
    ...extra,
  };
}

export const TRANSFERS: MaterialTransfer[] = [
  transfer(),
  transfer({
    id: "0199c4a0-0000-7000-8000-0000000a0002",
    number: "MT/26-27/00003",
    transferDate: "2026-10-03",
    type: "store_to_project",
    from: STORE,
    to: TOWER,
    status: "in_transit",
    approvalStatus: "approved",
    decidedAt: "2026-10-03T11:00:00.000Z",
    decidedBy: ANITHA,
    lines: transfer().lines.slice(0, 1),
  }),
  transfer({
    id: "0199c4a0-0000-7000-8000-0000000a0003",
    number: "MT/26-27/00002",
    transferDate: "2026-10-01",
    status: "delivered",
    approvalStatus: "approved",
    decidedAt: "2026-10-01T10:00:00.000Z",
    decidedBy: ANITHA,
    deliveredOn: "2026-10-02",
    deliveredAt: "2026-10-02T08:00:00.000Z",
    deliveredBy: ANITHA,
  }),
];

export type TransferApiOptions = {
  transfers?: MaterialTransfer[];
  /** Flags per menu on every Project (all supported flags otherwise). */
  flags?: Partial<Record<ProcurementAccessMenu, Flag[]>>;
  /** Stock at the source, per material. */
  stock?: Record<string, string>;
  /** Refuse approve with STOCK_INSUFFICIENT. */
  short?: boolean;
};

/** Answers the transfer screens' reads and writes for one story. */
export function transferHandler(
  options: TransferApiOptions = {},
): (call: ApiCall) => Response | undefined {
  const transfers = options.transfers ?? TRANSFERS;
  const documents = documentsHandler();
  return (call) => {
    const answered = documents(call) ?? materialOptionsHandler(call);
    if (answered != null) return answered;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/procurement/access")
      return Response.json(
        procurementAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (call.method === "GET" && path === TRANSFERS_API) {
      const direction = url.searchParams.get("direction");
      const status = url.searchParams.get("status");
      const here = url.searchParams.get("locationId");
      const items = transfers.filter(
        (item) =>
          (status == null || item.status === status) &&
          (direction == null ||
            (direction === "out"
              ? item.from.id === here
              : item.to.id === here)),
      );
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies MaterialTransferPage);
    }
    if (call.method === "GET" && path === `${TRANSFERS_API}/locations`)
      return Response.json(LOCATIONS);
    if (call.method === "GET" && path === `${TRANSFERS_API}/available-stock`) {
      const ids = (url.searchParams.get("materialIds") ?? "")
        .split(",")
        .filter(Boolean);
      return Response.json({
        stock: Object.fromEntries(
          ids.map((id) => [id, options.stock?.[id] ?? "100.000"]),
        ),
      });
    }
    const item =
      /^\/api\/construction\/procurement\/transfers\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const found = transfers.find((entry) => entry.id === id) ?? transfers[0];
      if (found == null) return undefined;
      if (call.method === "GET" && action == null) return Response.json(found);
      if (call.method === "POST" && action === "approve") {
        if (options.short === true)
          return Response.json(
            {
              code: "STOCK_INSUFFICIENT",
              message:
                "Not enough TMT Steel Bar 12 mm in stock: 120 short on 2026-10-05.",
              details: {
                shortfalls: [
                  {
                    locationKind: "project",
                    locationId: TOWER.id,
                    materialId: STEEL_ID,
                    materialName: "TMT Steel Bar 12 mm",
                    shortBy: "120.000",
                    onDate: "2026-10-05",
                  },
                ],
              },
            },
            { status: 409 },
          );
        return Response.json({
          ...found,
          status: "in_transit",
          approvalStatus: "approved",
        });
      }
      if (call.method === "POST" && action === "reject")
        return Response.json({
          ...found,
          status: "rejected",
          approvalStatus: "rejected",
        });
      if (call.method === "POST" && action === "deliver")
        return Response.json({ ...found, status: "delivered" });
      if (call.method === "POST" && action === "delete")
        return new Response(null, { status: 204 });
      if (call.method === "POST" && action === "update")
        return Response.json(found);
    }
    if (call.method === "POST" && path === TRANSFERS_API)
      return Response.json(
        { ...transfers[0], id: "0199c4a0-0000-7000-8000-0000000a0009" },
        { status: 201 },
      );
    return undefined;
  };
}

export function mockTransferApi(options: TransferApiOptions = {}) {
  return mockApi(transferHandler(options));
}
