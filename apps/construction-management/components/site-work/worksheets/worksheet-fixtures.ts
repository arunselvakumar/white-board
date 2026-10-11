import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  MATERIAL_OPTIONS,
  materialOptionsHandler,
} from "@/components/procurement/material-options-fixtures";
import {
  mockSiteWorkDocumentApi,
  type SiteWorkDocumentApiOptions,
} from "@/components/site-work/documents/site-work-document-fixtures";
import { SITE_WORK_ACCESS_MENUS } from "@/app/api/construction/site-work/access/access-models";
import type { LocationOptions } from "@/src/queries/location-options";
import type { SiteWorkAccess } from "@/src/queries/site-work-access";
import {
  WORKSHEET_SETTINGS_API,
  WORKSHEETS_API,
  type Worksheet,
  type WorksheetAttendance,
  type WorksheetFormOptions,
  type WorksheetPage,
  type WorksheetSettings,
} from "@/src/queries/worksheets";
import type { Flag } from "@/src/shared-kernel/access";

/** Daily Worksheet story fixtures (CM-602): a Chennai tower's site day. */

export const PROJECT_ID = "0199c4a0-0000-7000-8000-0000000b0001";
export const TODAY = "2026-10-10";

export const CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000c0001";
export const OTHER_CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000c0002";
export const MASONRY_ID = "0199c4a0-0000-7000-8000-0000000d0001";
export const CENTERING_ID = "0199c4a0-0000-7000-8000-0000000d0002";
export const BRICKWORK_ID = "0199c4a0-0000-7000-8000-0000000e0001";
export const SQM_ID = "0199c4a0-0000-7000-8000-0000000f0001";
export const LOCATION_ID = "0199c4a0-0000-7000-8000-0000000a0101";

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
    { id: LOCATION_ID, name: "Pump house" },
    { id: "0199c4a0-0000-7000-8000-0000000a0102", name: "Site office" },
  ],
};

export function worksheetSettings(
  patch: Partial<WorksheetSettings> = {},
): WorksheetSettings {
  return {
    projectId: PROJECT_ID,
    showLocation: true,
    showWorkType: true,
    showApproxWorkDone: true,
    showLabour: true,
    showMaterials: true,
    showRemark: true,
    showPhotos: true,
    sectionOrder: ["location", "basic", "materials", "other"],
    approvalEnabled: false,
    updatedAt: null,
    ...patch,
  };
}

export function formOptions(
  settings: Partial<WorksheetSettings> = {},
): WorksheetFormOptions {
  return {
    settings: worksheetSettings(settings),
    contractors: [
      {
        id: CONTRACTOR_ID,
        name: "Velan Constructions",
        departmentIds: [MASONRY_ID],
      },
      {
        id: OTHER_CONTRACTOR_ID,
        name: "Sri Balaji Centering Works",
        departmentIds: [CENTERING_ID],
      },
    ],
    departments: [
      { id: CENTERING_ID, name: "Centering" },
      { id: MASONRY_ID, name: "Masonry & Plaster" },
    ],
    workTypes: [
      {
        id: BRICKWORK_ID,
        name: "Brickwork",
        departmentId: MASONRY_ID,
        materialIds: [SAND.id],
      },
    ],
    units: [
      { id: SQM_ID, name: "sqm" },
      { id: "0199c4a0-0000-7000-8000-0000000f0002", name: "cum" },
    ],
  };
}

export const ATTENDANCE: WorksheetAttendance = {
  date: TODAY,
  attendance: { skilled: 12, unskilled: 18 },
  onWorksheets: { skilled: 4, unskilled: 6 },
  remaining: { skilled: 8, unskilled: 12 },
};

const AT = "2026-10-10T11:30:00.000Z";

let serial = 0;

export function worksheet(patch: Partial<Worksheet> = {}): Worksheet {
  serial += 1;
  const n = String(serial).padStart(4, "0");
  return {
    id: `0199c4a0-0000-7000-8000-00000009${n}`,
    projectId: PROJECT_ID,
    number: `WS/26-27/0${n}`,
    sheetDate: TODAY,
    shift: "shift_1",
    contractor: { id: CONTRACTOR_ID, name: "Velan Constructions" },
    department: { id: MASONRY_ID, name: "Masonry & Plaster" },
    workType: { id: BRICKWORK_ID, name: "Brickwork" },
    skilledCount: 4,
    unskilledCount: 6,
    approxWorkQty: "42.500",
    approxWorkUnit: { id: SQM_ID, name: "sqm" },
    siteLocation: { type: "location", locationId: LOCATION_ID },
    remark: "Brickwork on the east wall, ground floor.",
    approvalStatus: "not_required",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    duplicatedFromId: null,
    createdBy: { userId: "user-karthik", name: "Karthik R" },
    createdAt: AT,
    updatedAt: AT,
    materials: [
      {
        id: `0199c4a0-0000-7000-8000-00000008${n}`,
        materialId: CEMENT.id,
        materialName: CEMENT.name,
        unitName: CEMENT.uomName,
        quantity: "12.000",
        remark: null,
      },
    ],
    actions: {
      edit: true,
      delete: true,
      approve: false,
      reject: false,
      duplicate: true,
    },
    ...patch,
  };
}

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
];

/** The site-work access read: every worksheet flag unless `flags` says otherwise. */
export function siteWorkAccess(flags: Flag[] = ALL_FLAGS): SiteWorkAccess {
  const menus = Object.fromEntries(
    SITE_WORK_ACCESS_MENUS.map((menu) => [menu, ["read"] as Flag[]]),
  ) as SiteWorkAccess["menus"];
  menus["site_work.daily_worksheet"] = flags;
  return { projectId: PROJECT_ID, menus };
}

export type WorksheetApiOptions = {
  flags?: Flag[];
  settings?: Partial<WorksheetSettings>;
  items?: Worksheet[];
  /** Stock per material id on the sheet date; others have 100. */
  stock?: Record<string, string>;
  /** Answers a POST before the defaults (e.g. a refusal). */
  post?: (call: ApiCall) => Response | undefined;
  documents?: SiteWorkDocumentApiOptions;
};

/** Every read and write the worksheet screens make, plus the document thread. */
export function worksheetHandler(options: WorksheetApiOptions = {}) {
  const items = options.items ?? [worksheet()];
  const documents = mockSiteWorkDocumentApi(options.documents);
  let settings = worksheetSettings(options.settings);
  return (call: ApiCall): Response | undefined => {
    const fromShared = documents(call) ?? materialOptionsHandler(call);
    if (fromShared != null) return fromShared;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/site-work/access")
      return Response.json(siteWorkAccess(options.flags));
    if (path.endsWith("/location-options"))
      return Response.json(LOCATION_OPTIONS);
    if (path === WORKSHEET_SETTINGS_API) {
      if (call.method === "POST") {
        const body = call.body as Omit<WorksheetSettings, "updatedAt">;
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
      return Response.json(items[0] ?? worksheet(), {
        status: path === WORKSHEETS_API ? 201 : 200,
      });
    }
    if (path === `${WORKSHEETS_API}/form-options`)
      return Response.json(formOptions(settings));
    if (path === `${WORKSHEETS_API}/attendance`)
      return Response.json({
        ...ATTENDANCE,
        date: url.searchParams.get("date") ?? TODAY,
      });
    if (path === `${WORKSHEETS_API}/available-stock`) {
      const ids = (url.searchParams.get("materialIds") ?? "")
        .split(",")
        .filter(Boolean);
      return Response.json({
        stock: Object.fromEntries(
          ids.map((id) => [id, options.stock?.[id] ?? "100.000"]),
        ),
      });
    }
    if (path === WORKSHEETS_API) {
      const status = url.searchParams.get("approvalStatus");
      const rows = items.filter(
        (item) => status == null || item.approvalStatus === status,
      );
      return Response.json({
        items: rows,
        nextCursor: null,
        prevCursor: null,
        total: rows.length,
        facets: {
          filledBy: [{ userId: "user-karthik", name: "Karthik R" }],
          contractors: [{ id: CONTRACTOR_ID, name: "Velan Constructions" }],
          departments: [{ id: MASONRY_ID, name: "Masonry & Plaster" }],
        },
      } satisfies WorksheetPage);
    }
    const one = /^\/api\/construction\/site-work\/worksheets\/([^/]+)$/.exec(
      path,
    );
    if (one != null)
      return Response.json(
        items.find((item) => item.id === one[1]) ?? items[0] ?? worksheet(),
      );
    return undefined;
  };
}

export function mockWorksheetApi(options: WorksheetApiOptions = {}) {
  return mockApi(worksheetHandler(options));
}

/** The 409 a save gets when a line would take stock below zero. */
export function stockRefusal(): Response {
  return Response.json(
    {
      code: "STOCK_INSUFFICIENT",
      message:
        "Not enough Cement OPC 53 Grade in stock: 18 short on 2026-10-10.",
      details: {
        shortfalls: [
          {
            locationKind: "project",
            locationId: PROJECT_ID,
            materialId: CEMENT.id,
            materialName: CEMENT.name,
            shortBy: "18.000",
            onDate: TODAY,
          },
        ],
      },
    },
    { status: 409 },
  );
}
