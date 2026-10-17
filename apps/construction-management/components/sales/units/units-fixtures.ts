import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type { SalesUnit, UnitChart } from "@/src/queries/sales-units";
import type { UnitSalesStatus } from "@/src/sales/domain/sales-terms";

/** Story fixtures for the Units tab (CM-1005). */

export const UNITS_API = "/api/construction/sales/units";
export const SALES_PROJECT_ID = "0199c4a0-0000-7000-8000-00000000a001";
export const TOWER_A_ID = "0199c4a0-0000-7000-8000-00000000a101";
export const TOWER_B_ID = "0199c4a0-0000-7000-8000-00000000a102";
export const BOOKING_ID = "0199c4a0-0000-7000-8000-00000000a301";
export const EXPIRED_BOOKING_ID = "0199c4a0-0000-7000-8000-00000000a302";
const TODAY = "2026-10-17";

let unitSeq = 0;
function unitId(): string {
  unitSeq += 1;
  return `0199c4a0-0000-7000-8000-00000000b${String(unitSeq).padStart(3, "0")}`;
}

type Cell = UnitChart["wing"] extends infer W
  ? W extends { floors: (infer F)[] }
    ? F extends { units: (infer U)[] }
      ? U
      : never
    : never
  : never;

function cell(
  name: string,
  status: UnitSalesStatus,
  extra: Partial<Cell> = {},
): Cell {
  return {
    id: unitId(),
    name,
    status,
    unitType: "2BHK",
    carpetArea: "850",
    areaUnit: "sq_ft",
    booking: null,
    ...extra,
  };
}

/** Tower A: four floors, with every status (and a hold that expired). */
export function towerAFloors() {
  unitSeq = 0;
  return [
    {
      id: "0199c4a0-0000-7000-8000-00000000a204",
      name: "Floor 3",
      kind: "typed",
      units: [
        cell("301", "available", { unitType: "3BHK" }),
        cell("302", "available", {
          booking: {
            id: EXPIRED_BOOKING_ID,
            status: "hold_expired",
            customerName: "Kavya S",
            holdUntil: "2026-10-10",
          },
        }),
      ],
    },
    {
      id: "0199c4a0-0000-7000-8000-00000000a203",
      name: "Floor 2",
      kind: "typed",
      units: [
        cell("201", "booked", {
          booking: {
            id: BOOKING_ID,
            status: "booked",
            customerName: "Meena Raghavan",
            holdUntil: null,
          },
        }),
        cell("202", "on_hold", {
          booking: {
            id: "0199c4a0-0000-7000-8000-00000000a303",
            status: "on_hold",
            customerName: "Ravi Kumar",
            holdUntil: "2026-10-24",
          },
        }),
      ],
    },
    {
      id: "0199c4a0-0000-7000-8000-00000000a202",
      name: "Floor 1",
      kind: "typed",
      units: [cell("101", "available"), cell("102", "available")],
    },
    {
      id: "0199c4a0-0000-7000-8000-00000000a201",
      name: "Ground",
      kind: "ground",
      units: [
        cell("G01", "unavailable", { unitType: "Shop", carpetArea: null }),
        cell("G02", "available", { unitType: "Shop" }),
      ],
    },
  ];
}

function counts(statuses: readonly UnitSalesStatus[]) {
  const value = {
    total: statuses.length,
    available: 0,
    on_hold: 0,
    booked: 0,
    unavailable: 0,
  };
  for (const status of statuses) value[status] += 1;
  return value;
}

export function unitChart(
  options: {
    wings?: "two" | "none";
    canUpdate?: boolean;
    canCreate?: boolean;
  } = {},
): UnitChart {
  const floors = towerAFloors();
  const statuses = floors.flatMap((floor) =>
    floor.units.map((unit) => unit.status),
  );
  const towerA = {
    id: TOWER_A_ID,
    name: "Tower A",
    type: "residential",
    phaseName: "Phase 1",
    counts: counts(statuses),
  };
  const towerB = {
    id: TOWER_B_ID,
    name: "Tower B",
    type: "residential",
    phaseName: "Phase 1",
    counts: counts(["available", "available"]),
  };
  const wings =
    options.wings === "none"
      ? []
      : options.wings === "two"
        ? [towerA, towerB]
        : [towerA];
  return {
    projectId: SALES_PROJECT_ID,
    today: TODAY,
    counts: counts(
      options.wings === "none"
        ? []
        : options.wings === "two"
          ? [...statuses, "available", "available"]
          : statuses,
    ),
    wings,
    wing: options.wings === "none" ? null : { ...towerA, floors },
    actions: {
      update: options.canUpdate ?? true,
      create: options.canCreate ?? true,
    },
  };
}

/** The panel of a chart cell: its details, booking and actions. */
export function salesUnit(
  chartCell: Cell,
  options: { canUpdate?: boolean; canCreate?: boolean } = {},
): SalesUnit {
  const update = options.canUpdate ?? true;
  const create = options.canCreate ?? true;
  const unavailable = chartCell.status === "unavailable";
  const booking =
    chartCell.booking == null
      ? null
      : {
          id: chartCell.booking.id,
          storedStatus:
            chartCell.booking.status === "booked"
              ? ("booked" as const)
              : ("on_hold" as const),
          status: chartCell.booking.status,
          bookingDate: "2026-10-05",
          holdUntil: chartCell.booking.holdUntil,
          customerName: chartCell.booking.customerName,
          customerMobile: "+919876543210",
          cancelledOn: null,
          cancelReason: null,
        };
  return {
    id: chartCell.id,
    name: chartCell.name,
    projectId: SALES_PROJECT_ID,
    wing: { id: TOWER_A_ID, name: "Tower A", type: "residential" },
    floor: { id: "0199c4a0-0000-7000-8000-00000000a201", name: "Floor" },
    status: chartCell.status,
    profile: {
      unitType: chartCell.unitType,
      carpetArea: chartCell.carpetArea,
      builtUpArea: chartCell.carpetArea == null ? null : "1040",
      superBuiltUpArea: null,
      areaUnit: "sq_ft",
      unavailable,
      unavailableReason: unavailable ? "landowner_share" : null,
      unavailableNote: unavailable ? "Kept for the landowner" : null,
      updatedAt: "2026-10-16T10:00:00.000Z",
    },
    booking,
    bookings:
      booking == null
        ? []
        : [
            booking,
            {
              ...booking,
              id: "0199c4a0-0000-7000-8000-00000000a399",
              storedStatus: "cancelled",
              status: "cancelled",
              customerName: "Suresh P",
              cancelledOn: "2026-09-30",
              cancelReason: "Loan refused",
            },
          ],
    actions: {
      editDetails: update,
      markUnavailable: update && chartCell.status === "available",
      markAvailable: update && unavailable,
      book: create && chartCell.status === "available",
    },
  };
}

export type UnitsApiOptions = {
  wings?: "two" | "none";
  canUpdate?: boolean;
  canCreate?: boolean;
  /** Answer the details / unavailable POSTs with this error. */
  refuse?: { status: number; code: string; message: string; details?: unknown };
  /** Answer the import with these row problems. */
  importErrors?: { row: number; field: string; message: string }[];
};

export function unitsHandler(options: UnitsApiOptions = {}) {
  const chart = unitChart(options);
  const cells = chart.wing?.floors.flatMap((floor) => floor.units) ?? [];
  return (call: ApiCall): Response | undefined => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "GET" && path === UNITS_API) {
      const wingId = new URLSearchParams(call.path.split("?")[1]).get("wingId");
      if (wingId === TOWER_B_ID && chart.wing != null)
        return Response.json({
          ...chart,
          wing: {
            ...chart.wings[1],
            floors: [
              {
                id: "0199c4a0-0000-7000-8000-00000000a2b1",
                name: "Ground",
                kind: "ground",
                units: [cell("B01", "available"), cell("B02", "available")],
              },
            ],
          },
        });
      return Response.json(chart);
    }
    if (call.method === "POST" && path === `${UNITS_API}/import`)
      return options.importErrors == null
        ? Response.json({ updated: 8 })
        : Response.json(
            {
              code: "IMPORT_HAS_ERRORS",
              message:
                "The sheet has problems. Fix them and upload it again; nothing was saved.",
              details: { errors: options.importErrors },
            },
            { status: 400 },
          );
    const match =
      /^\/api\/construction\/sales\/units\/([^/]+)(?:\/([a-z]+))?$/.exec(path);
    if (match != null) {
      const [, id, action] = match;
      const found = cells.find((item) => item.id === id) ?? cells[0];
      if (found == null) return undefined;
      const unit = salesUnit(found, options);
      if (call.method === "GET" && action == null) return Response.json(unit);
      if (call.method === "POST" && options.refuse != null)
        return Response.json(
          {
            code: options.refuse.code,
            message: options.refuse.message,
            details: options.refuse.details,
          },
          { status: options.refuse.status },
        );
      if (call.method === "POST" && action === "details")
        return Response.json({
          ...unit,
          profile: { ...unit.profile, ...(call.body as object) },
        });
      if (call.method === "POST" && action === "unavailable")
        return Response.json({ ...unit, status: "unavailable" });
      if (call.method === "POST" && action === "available")
        return Response.json({ ...unit, status: "available" });
    }
    return undefined;
  };
}

export function mockUnitsApi(options: UnitsApiOptions = {}) {
  return mockApi(unitsHandler(options));
}
