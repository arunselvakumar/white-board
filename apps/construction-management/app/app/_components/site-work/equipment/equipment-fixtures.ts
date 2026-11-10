import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  SITE_WORK_ACCESS_MENUS,
  type SiteWorkAccessMenu,
} from "@/app/api/construction/site-work/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";
import type {
  EquipmentDetail,
  EquipmentFormOptions,
  EquipmentPage,
} from "@/src/queries/equipment";
import type { SiteWorkAccess } from "@/src/queries/site-work-access";

/** Story fixtures for the Equipment register (CM-603, CM-605). */

export const EQUIPMENT_API = "/api/construction/site-work/equipment";
export const ACCESS_API = "/api/construction/site-work/access";

export const TOWER = {
  id: "0199c4a0-0000-7000-8000-0000000e0001",
  name: "Anugraha Towers",
};
export const VILLA = {
  id: "0199c4a0-0000-7000-8000-0000000e0002",
  name: "Villa Phase 2",
};
export const VELAN = {
  id: "0199c4a0-0000-7000-8000-0000000e0101",
  name: "Velan Earth Movers",
};

export const JCB_ID = "0199c4a0-0000-7000-8000-0000000e1001";
export const TIPPER_ID = "0199c4a0-0000-7000-8000-0000000e1002";
export const MIXER_ID = "0199c4a0-0000-7000-8000-0000000e1003";

const KARTHIK = { userId: "user-karthik", name: "Karthik R" };

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "print",
  "notification",
  "transfer",
  "report",
  "financial",
];

export const FORM_OPTIONS: EquipmentFormOptions = {
  hireParties: [
    VELAN,
    { id: "0199c4a0-0000-7000-8000-0000000e0102", name: "Sri Murugan Cranes" },
  ],
  projects: [TOWER, VILLA],
};

export const ALL_ACTIONS: EquipmentDetail["actions"] = {
  edit: true,
  delete: true,
  transfer: true,
  logMaintenance: true,
  returnToService: false,
  editMaintenance: true,
  changeAvailability: true,
  changePhoto: true,
  seeRates: true,
  seeCosts: true,
};

/** An owned JCB at Anugraha Towers, moved there from Villa Phase 2. */
export function equipmentDetail(
  extra: Partial<EquipmentDetail> = {},
): EquipmentDetail {
  return {
    id: JCB_ID,
    ownership: "owned",
    name: "JCB 3DX",
    equipmentNumber: "TN-09-AB-1234",
    purchaseYear: 2019,
    fuelType: "diesel",
    fuelUnit: "litre",
    utilisationBasis: "hourly",
    workingTimeMethod: "both",
    targetValue: "8.00",
    targetUnit: "hours_per_day",
    minUtilisationPct: "60.00",
    expectedFuelEfficiency: "6.500",
    contactPersonName: "Senthil",
    contactPersonNumber: "+91 98400 12345",
    companyName: null,
    hireParty: null,
    hireBasis: null,
    hireRate: null,
    idleChargeable: false,
    photo: null,
    currentProject: TOWER,
    currentLocationName: "Block C yard",
    state: "available",
    availableForEntry: true,
    unavailableSince: null,
    openMaintenance: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
    createdBy: KARTHIK,
    movements: [
      {
        id: "0199c4a0-0000-7000-8000-0000000e2001",
        kind: "added",
        movementDate: "2026-09-01",
        before: null,
        toProject: VILLA,
        locationName: "Villa Phase 2",
        remark: null,
        createdAt: "2026-09-01T09:00:00.000Z",
        createdBy: KARTHIK,
      },
      {
        id: "0199c4a0-0000-7000-8000-0000000e2002",
        kind: "to_project",
        movementDate: "2026-10-05",
        before: { project: VILLA, locationName: "Villa Phase 2" },
        toProject: TOWER,
        locationName: "Block C yard",
        remark: "For the basement excavation",
        createdAt: "2026-10-05T09:00:00.000Z",
        createdBy: KARTHIK,
      },
    ],
    maintenance: [
      {
        id: "0199c4a0-0000-7000-8000-0000000e3001",
        kind: "service",
        startDate: "2026-09-20",
        endDate: "2026-09-21",
        description: "500-hour service",
        workshop: "Sri Balaji Motors",
        cost: 1_250_000,
        remark: "Oil and filters changed",
        createdAt: "2026-09-20T09:00:00.000Z",
        updatedAt: "2026-09-21T09:00:00.000Z",
        createdBy: KARTHIK,
      },
    ],
    actions: ALL_ACTIONS,
    ...extra,
  };
}

/** A rented tipper hired from Velan by the trip. */
export function rentedDetail(
  extra: Partial<EquipmentDetail> = {},
): EquipmentDetail {
  return equipmentDetail({
    id: TIPPER_ID,
    ownership: "rented",
    name: "Tipper 10 T",
    equipmentNumber: "TN-10-X-9001",
    purchaseYear: null,
    utilisationBasis: "trip",
    workingTimeMethod: "meter_reading",
    targetValue: "12.00",
    targetUnit: "trips_per_day",
    hireParty: VELAN,
    hireBasis: "trip",
    hireRate: 150_000,
    idleChargeable: false,
    ...extra,
  });
}

/** The JCB in maintenance and marked unavailable. */
export function brokenDetail(): EquipmentDetail {
  const base = equipmentDetail();
  const open = {
    id: "0199c4a0-0000-7000-8000-0000000e3002",
    kind: "breakdown" as const,
    startDate: "2026-10-09",
    endDate: null,
    description: "Hydraulic hose burst",
    workshop: "Sri Balaji Motors",
    cost: 450_000,
    remark: null,
    createdAt: "2026-10-09T09:00:00.000Z",
    updatedAt: "2026-10-09T09:00:00.000Z",
    createdBy: KARTHIK,
  };
  return {
    ...base,
    state: "in_maintenance",
    availableForEntry: false,
    unavailableSince: "2026-10-08",
    openMaintenance: {
      id: open.id,
      kind: open.kind,
      startDate: open.startDate,
    },
    maintenance: [open, ...base.maintenance],
    actions: {
      ...ALL_ACTIONS,
      transfer: false,
      logMaintenance: false,
      returnToService: true,
    },
  };
}

function listItem(detail: EquipmentDetail): EquipmentPage["items"][number] {
  const {
    movements: _movements,
    maintenance: _maintenance,
    actions: _actions,
    createdBy: _createdBy,
    ...item
  } = detail;
  return item;
}

export const REGISTER: EquipmentPage["items"] = [
  listItem(equipmentDetail()),
  listItem(rentedDetail()),
  listItem({
    ...brokenDetail(),
    id: MIXER_ID,
    name: "Concrete mixer",
    equipmentNumber: "MX-0007",
    currentProject: null,
    currentLocationName: "Ambattur godown",
  }),
];

export function siteWorkAccess(
  flags: Partial<Record<SiteWorkAccessMenu, Flag[]>> = {},
  projectId: string | null = null,
): SiteWorkAccess {
  return {
    projectId,
    menus: Object.fromEntries(
      SITE_WORK_ACCESS_MENUS.map((menu) => [menu, flags[menu] ?? ALL_FLAGS]),
    ) as SiteWorkAccess["menus"],
  };
}

export type EquipmentApiOptions = {
  items?: EquipmentPage["items"];
  detail?: EquipmentDetail;
  flags?: Partial<Record<SiteWorkAccessMenu, Flag[]>>;
  /** The error a write answers with, e.g. `TRANSFER_BEFORE_LAST_SHEET`. */
  refuse?: { code: string; message: string; field?: string; status?: number };
};

export function equipmentHandler(options: EquipmentApiOptions = {}) {
  const items = options.items ?? REGISTER;
  const detail = options.detail ?? equipmentDetail();
  return (call: ApiCall): Response | undefined => {
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (call.method === "GET" && path === ACCESS_API)
      return Response.json(
        siteWorkAccess(options.flags, url.searchParams.get("projectId")),
      );
    if (call.method === "GET" && path === EQUIPMENT_API) {
      const ownership = url.searchParams.get("ownership");
      const state = url.searchParams.get("state");
      const projectId = url.searchParams.get("projectId");
      const warehouse = url.searchParams.get("warehouse") === "true";
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const found = items.filter(
        (item) =>
          (ownership == null || item.ownership === ownership) &&
          (state == null || item.state === state) &&
          (projectId == null || item.currentProject?.id === projectId) &&
          (!warehouse || item.currentProject == null) &&
          (search === "" ||
            item.name.toLowerCase().includes(search) ||
            item.equipmentNumber.toLowerCase().includes(search)),
      );
      return Response.json({
        items: found,
        nextCursor: null,
        total: found.length,
      } satisfies EquipmentPage);
    }
    if (call.method === "GET" && path === `${EQUIPMENT_API}/form-options`)
      return Response.json(FORM_OPTIONS);
    if (call.method === "POST" && options.refuse != null)
      return Response.json(
        {
          code: options.refuse.code,
          message: options.refuse.message,
          details:
            options.refuse.field == null
              ? undefined
              : { field: options.refuse.field },
        },
        { status: options.refuse.status ?? 400 },
      );
    if (call.method === "POST" && path === EQUIPMENT_API)
      return Response.json(
        { ...detail, id: "0199c4a0-0000-7000-8000-0000000e1009" },
        { status: 201 },
      );
    const item =
      /^\/api\/construction\/site-work\/equipment\/([^/]+)(\/.*)?$/.exec(path);
    if (item == null) return undefined;
    const [, , rest] = item;
    if (call.method === "GET" && rest == null) return Response.json(detail);
    if (call.method === "POST" && rest === "/delete")
      return new Response(null, { status: 204 });
    if (call.method === "POST" && rest === "/availability") {
      const available = (call.body as { available: boolean }).available;
      return Response.json({
        ...detail,
        availableForEntry: available,
        unavailableSince: available ? null : "2026-10-11",
        state: available ? "available" : "unavailable",
      });
    }
    if (call.method === "POST") return Response.json(detail);
    return undefined;
  };
}

export function mockEquipmentApi(options: EquipmentApiOptions = {}) {
  return mockApi(equipmentHandler(options));
}
