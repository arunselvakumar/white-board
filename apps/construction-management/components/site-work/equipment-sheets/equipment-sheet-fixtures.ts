import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import { materialOptionsHandler } from "@/components/procurement/material-options-fixtures";
import {
  mockSiteWorkDocumentApi,
  type SiteWorkDocumentApiOptions,
} from "@/components/site-work/documents/site-work-document-fixtures";
import {
  equipmentDetail,
  rentedDetail,
} from "@/components/site-work/equipment/equipment-fixtures";
import {
  CEMENT,
  CONTRACTOR_ID,
  LOCATION_ID,
  LOCATION_OPTIONS,
  MASONRY_ID,
  PROJECT_ID,
  SQM_ID,
  TODAY,
} from "@/components/site-work/worksheets/worksheet-fixtures";
import {
  SITE_WORK_ACCESS_MENUS,
  type SiteWorkAccessMenu,
} from "@/app/api/construction/site-work/access/access-models";
import type { EquipmentSheetOptions } from "@/src/queries/equipment";
import {
  EQUIPMENT_SHEET_SETTINGS_API,
  EQUIPMENT_SHEETS_API,
  type EquipmentSheetDetail,
  type EquipmentSheetFormOptions,
  type EquipmentSheetPage,
  type EquipmentSheetSettings,
} from "@/src/queries/equipment-sheets";
import type { SiteWorkAccess } from "@/src/queries/site-work-access";
import type { Flag } from "@/src/shared-kernel/access";

/** Equipment Usage sheet story fixtures (CM-604): a Chennai tower's machines. */

export { CEMENT, PROJECT_ID, TODAY };

export const JCB_ID = "0199c4a0-0000-7000-8000-0000000e4001";
export const EXCAVATOR_ID = "0199c4a0-0000-7000-8000-0000000e4002";
export const TIPPER_ID = "0199c4a0-0000-7000-8000-0000000e4003";
export const DUMPER_ID = "0199c4a0-0000-7000-8000-0000000e4004";
export const MIXER_ID = "0199c4a0-0000-7000-8000-0000000e4005";
export const ROLLER_ID = "0199c4a0-0000-7000-8000-0000000e4006";
export const VELAN_ID = "0199c4a0-0000-7000-8000-0000000e0101";
export const SUPERVISOR_ID = "user-senthil";

type OptionItem = EquipmentSheetOptions["items"][number];

function option(
  base: ReturnType<typeof equipmentDetail>,
  lastClosingReading: OptionItem["lastClosingReading"] = null,
): OptionItem {
  const {
    movements: _movements,
    maintenance: _maintenance,
    actions: _actions,
    createdBy: _createdBy,
    ...item
  } = base;
  return { ...item, lastClosingReading };
}

/** JCB 3DX: owned, hourly, time shifts and meter (Both), 6.5 L/h. */
export const JCB = option(
  equipmentDetail({ id: JCB_ID, workingTimeMethod: "both" }),
  { reading: "1250.00", sheetDate: "2026-10-09" },
);
/** Hired excavator: hourly by meter, ₹1,200 an hour, idle chargeable. */
export const EXCAVATOR = option(
  rentedDetail({
    id: EXCAVATOR_ID,
    name: "Hired excavator",
    equipmentNumber: "TN-22-EX-0420",
    utilisationBasis: "hourly",
    workingTimeMethod: "meter_reading",
    targetUnit: "hours_per_day",
    targetValue: "8.00",
    hireBasis: "hourly",
    hireRate: 120_000,
    idleChargeable: true,
    expectedFuelEfficiency: "7.000",
  }),
  { reading: "4210.50", sheetDate: "2026-10-09" },
);
/** Tipper: owned, Km by odometer, 0.25 L/km. */
export const TIPPER = option(
  equipmentDetail({
    id: TIPPER_ID,
    name: "Tipper 10 T",
    equipmentNumber: "TN-10-X-9001",
    utilisationBasis: "km",
    workingTimeMethod: "meter_reading",
    targetUnit: "km_per_day",
    targetValue: "120.00",
    expectedFuelEfficiency: "0.250",
  }),
  { reading: "45210.00", sheetDate: "2026-10-09" },
);
/** Dumper: owned, by the trip, with time shifts. */
export const DUMPER = option(
  equipmentDetail({
    id: DUMPER_ID,
    name: "Site dumper",
    equipmentNumber: "DM-0003",
    utilisationBasis: "trip",
    workingTimeMethod: "time_shifts",
    targetUnit: "trips_per_day",
    targetValue: "20.00",
    expectedFuelEfficiency: null,
  }),
);
/** Road roller: owned, hourly, time shifts only. */
export const ROLLER = option(
  equipmentDetail({
    id: ROLLER_ID,
    name: "Road roller",
    equipmentNumber: "RR-0002",
    workingTimeMethod: "time_shifts",
    expectedFuelEfficiency: "5.000",
  }),
);
const MIXER = option(
  equipmentDetail({
    id: MIXER_ID,
    name: "Concrete mixer",
    equipmentNumber: "MX-0007",
    state: "in_maintenance",
  }),
);

export function sheetOptions(
  patch: Partial<EquipmentSheetOptions> = {},
): EquipmentSheetOptions {
  return {
    projectId: PROJECT_ID,
    date: TODAY,
    items: [JCB, ROLLER, EXCAVATOR, TIPPER, DUMPER],
    blocked: [{ equipment: MIXER, reason: "EQUIPMENT_IN_MAINTENANCE" }],
    ...patch,
  };
}

export function equipmentSheetSettings(
  patch: Partial<EquipmentSheetSettings> = {},
): EquipmentSheetSettings {
  return {
    projectId: PROJECT_ID,
    showOperator: true,
    showSupervisor: true,
    showLocation: true,
    showApproxWorkDone: true,
    showBillableQty: true,
    showFuel: true,
    showRemarks: true,
    showFiles: true,
    showMaterials: true,
    showMeterReadings: true,
    showBreakdownHours: true,
    approvalEnabled: false,
    updatedAt: null,
    ...patch,
  };
}

export function formOptions(
  settings: Partial<EquipmentSheetSettings> = {},
): EquipmentSheetFormOptions {
  return {
    settings: equipmentSheetSettings(settings),
    supervisors: [
      { userId: "user-karthik", name: "Karthik R" },
      { userId: SUPERVISOR_ID, name: "Senthil Kumar" },
    ],
    contractors: [
      {
        id: CONTRACTOR_ID,
        name: "Velan Constructions",
        departmentIds: [MASONRY_ID],
      },
    ],
    departments: [{ id: MASONRY_ID, name: "Masonry & Plaster" }],
    units: [
      { id: SQM_ID, name: "sqm" },
      { id: "0199c4a0-0000-7000-8000-0000000f0002", name: "cum" },
    ],
  };
}

const AT = "2026-10-10T11:30:00.000Z";
let serial = 0;

/** A saved sheet: the JCB's day by default. */
export function equipmentSheet(
  patch: Partial<EquipmentSheetDetail> = {},
): EquipmentSheetDetail {
  serial += 1;
  const n = String(serial).padStart(4, "0");
  return {
    id: `0199c4a0-0000-7000-8000-00000007${n}`,
    projectId: PROJECT_ID,
    number: `EU/26-27/0${n}`,
    sheetDate: TODAY,
    shift: "shift_1",
    equipment: {
      id: JCB_ID,
      name: "JCB 3DX",
      equipmentNumber: "TN-09-AB-1234",
      fuelUnit: "litre",
      expectedFuelEfficiency: "6.500",
      hireParty: null,
      hireBasis: null,
      hireRate: null,
      idleChargeable: false,
    },
    ownership: "owned",
    utilisationBasis: "hourly",
    workingTimeMethod: "both",
    operatorName: "Ramesh K",
    supervisor: { userId: SUPERVISOR_ID, name: "Senthil Kumar" },
    contractor: null,
    department: null,
    workItem: "Basement excavation, Block C",
    siteLocation: { type: "location", locationId: LOCATION_ID },
    timeShifts: [
      { startTime: "08:00", endTime: "12:00", minutes: 240 },
      { startTime: "13:00", endTime: "17:30", minutes: 270 },
    ],
    shiftHours: "8.50",
    openingReading: "1250.00",
    closingReading: "1258.50",
    meterDelta: "8.50",
    usageHours: "8.50",
    distanceKm: null,
    trips: null,
    idleHours: "1.00",
    breakdownHours: "0.00",
    approxWorkQty: null,
    approxWorkUnit: null,
    fuelQty: "52.000",
    fuelBorneBy: "company",
    fuelOverrun: false,
    unitRate: null,
    billableQty: null,
    hireCost: null,
    remark: null,
    approvalStatus: "not_required",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    duplicatedFromId: null,
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: AT,
    updatedAt: AT,
    materials: [],
    actions: {
      edit: true,
      delete: true,
      approve: false,
      reject: false,
      duplicate: true,
    },
    previousClosing: { reading: "1250.00", sheetDate: "2026-10-09" },
    meterGap: "0.00",
    ...patch,
  };
}

/** The hired excavator's day: 7.5 h by meter + 0.5 h idle, ₹9,600. */
export function rentedSheet(
  patch: Partial<EquipmentSheetDetail> = {},
): EquipmentSheetDetail {
  return equipmentSheet({
    equipment: {
      id: EXCAVATOR_ID,
      name: "Hired excavator",
      equipmentNumber: "TN-22-EX-0420",
      fuelUnit: "litre",
      expectedFuelEfficiency: "7.000",
      hireParty: { id: VELAN_ID, name: "Velan Earth Movers" },
      hireBasis: "hourly",
      hireRate: 120_000,
      idleChargeable: true,
    },
    ownership: "rented",
    workingTimeMethod: "meter_reading",
    timeShifts: [],
    shiftHours: null,
    openingReading: "4210.50",
    closingReading: "4218.00",
    meterDelta: "7.50",
    usageHours: "7.50",
    idleHours: "0.50",
    fuelQty: "40.000",
    fuelBorneBy: "hire_party",
    unitRate: 120_000,
    billableQty: "8.000",
    hireCost: 960_000,
    previousClosing: { reading: "4210.50", sheetDate: "2026-10-09" },
    ...patch,
  });
}

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "financial",
];

/** Every Equipment Usage flag (and Hindrance create) unless told otherwise. */
export function siteWorkAccess(
  flags: Partial<Record<SiteWorkAccessMenu, Flag[]>> = {},
): SiteWorkAccess {
  const menus = Object.fromEntries(
    SITE_WORK_ACCESS_MENUS.map((menu) => [menu, flags[menu] ?? ["read"]]),
  ) as SiteWorkAccess["menus"];
  menus["site_work.equipment_usage"] =
    flags["site_work.equipment_usage"] ?? ALL_FLAGS;
  menus["site_work.hindrances"] = flags["site_work.hindrances"] ?? [
    "read",
    "create",
  ];
  return { projectId: PROJECT_ID, menus };
}

export type EquipmentSheetApiOptions = {
  flags?: Partial<Record<SiteWorkAccessMenu, Flag[]>>;
  settings?: Partial<EquipmentSheetSettings>;
  options?: EquipmentSheetOptions;
  items?: EquipmentSheetDetail[];
  /** Answers a POST before the defaults (e.g. a refusal). */
  post?: (call: ApiCall) => Response | undefined;
  documents?: SiteWorkDocumentApiOptions;
};

/** Every read and write the usage-sheet screens make, plus the document thread. */
export function equipmentSheetHandler(options: EquipmentSheetApiOptions = {}) {
  const items = options.items ?? [equipmentSheet()];
  const documents = mockSiteWorkDocumentApi(options.documents);
  let settings = equipmentSheetSettings(options.settings);
  return (call: ApiCall): Response | undefined => {
    const fromShared = documents(call) ?? materialOptionsHandler(call);
    if (fromShared != null) return fromShared;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/site-work/access")
      return Response.json(siteWorkAccess(options.flags));
    if (path.endsWith("/location-options"))
      return Response.json(LOCATION_OPTIONS);
    if (path === "/api/construction/site-work/equipment/sheet-options")
      return Response.json({
        ...(options.options ?? sheetOptions()),
        date: url.searchParams.get("date") ?? TODAY,
      });
    if (path === EQUIPMENT_SHEET_SETTINGS_API) {
      if (call.method === "POST") {
        const body = call.body as Omit<EquipmentSheetSettings, "updatedAt">;
        settings = { ...settings, ...body, updatedAt: AT };
      }
      return Response.json(settings);
    }
    if (call.method === "POST") {
      const answer = options.post?.(call);
      if (answer != null) return answer;
      if (path.endsWith("/bulk-approve") || path.endsWith("/bulk-reject"))
        return Response.json({
          decided: (call.body as { ids: string[] }).ids.length,
        });
      if (path.endsWith("/delete")) return new Response(null, { status: 204 });
      return Response.json(items[0] ?? equipmentSheet(), {
        status: path === EQUIPMENT_SHEETS_API ? 201 : 200,
      });
    }
    if (path === `${EQUIPMENT_SHEETS_API}/form-options`)
      return Response.json(formOptions(settings));
    if (path === `${EQUIPMENT_SHEETS_API}/available-stock`) {
      const ids = (url.searchParams.get("materialIds") ?? "")
        .split(",")
        .filter(Boolean);
      return Response.json({
        stock: Object.fromEntries(ids.map((id) => [id, "20.000"])),
      });
    }
    if (path === EQUIPMENT_SHEETS_API) {
      const status = url.searchParams.get("approvalStatus");
      const ownership = url.searchParams.get("ownership");
      const rows = items.filter(
        (item) =>
          (status == null || item.approvalStatus === status) &&
          (ownership == null || item.ownership === ownership),
      );
      return Response.json({
        items: rows,
        nextCursor: null,
        prevCursor: null,
        total: rows.length,
        totals: {
          usageHours: "16.00",
          distanceKm: "0.00",
          trips: 0,
          idleHours: "1.50",
          breakdownHours: "0.00",
        },
        facets: {
          filledBy: [{ userId: "user-karthik", name: "Karthik R" }],
          equipment: [
            { id: JCB_ID, name: "JCB 3DX", equipmentNumber: "TN-09-AB-1234" },
            {
              id: EXCAVATOR_ID,
              name: "Hired excavator",
              equipmentNumber: "TN-22-EX-0420",
            },
          ],
        },
      } satisfies EquipmentSheetPage);
    }
    const one =
      /^\/api\/construction\/site-work\/equipment-sheets\/([^/]+)$/.exec(path);
    if (one != null)
      return Response.json(
        items.find((item) => item.id === one[1]) ??
          items[0] ??
          equipmentSheet(),
      );
    return undefined;
  };
}

export function mockEquipmentSheetApi(options: EquipmentSheetApiOptions = {}) {
  return mockApi(equipmentSheetHandler(options));
}
