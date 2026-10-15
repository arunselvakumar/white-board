import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  TRACKING_ACCESS_MENUS,
  type TrackingAccessMenu,
} from "@/app/api/construction/tracking/access/access-models";
import { localToday } from "@/components/payments/payment-format";
import {
  mockTrackingDocumentApi,
  trackingFile,
  trackingSwatch,
} from "@/components/tracking/documents/tracking-document-fixtures";
import type { LocationOptions } from "@/src/queries/location-options";
import type {
  Inspection,
  InspectionFormOptions,
  InspectionObservation,
  InspectionPage,
  InspectionReinspection,
  InspectionRemark,
} from "@/src/queries/tracking-inspections";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { menuByKey } from "@/src/shared-kernel/access/menus";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";

/** Story fixtures for Inspection Requests (CM-804). */

export const INSPECTIONS_API = "/api/construction/tracking/inspections";
export const INSPECTION_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000d0001";
export const CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000d0101";
export const DEPARTMENT_ID = "0199c4a0-0000-7000-8000-0000000d0201";
export const INSPECTOR_ID = "0199c4a0-0000-7000-8000-0000000d0301";
export const DRAWING_ID = "0199c4a0-0000-7000-8000-0000000d0401";
export const ALBUM_ID = "0199c4a0-0000-7000-8000-0000000d0501";
export const CULVERT_ID = "0199c4a0-0000-7000-8000-0000000d0601";
export const PENDING_ID = "0199c4a0-0000-7000-8000-0000000d1001";
export const APPROVED_ID = "0199c4a0-0000-7000-8000-0000000d1002";
export const REJECTED_ID = "0199c4a0-0000-7000-8000-0000000d1003";
export const REINSPECTION_ID = "0199c4a0-0000-7000-8000-0000000d1004";
export const SNAG_ID = "0199c4a0-0000-7000-8000-0000000d2001";

const TODAY = localToday();
const KARTHIK = { userId: "user-karthik", name: "Karthik R" };
const MEENA = { userId: "user-meena", name: "Meena Iyer" };

export function trackingAccess(
  projectId: string | null,
  flags: Partial<Record<TrackingAccessMenu, Flag[]>> = {},
) {
  return {
    projectId,
    menus: Object.fromEntries(
      TRACKING_ACCESS_MENUS.map((menu) => [
        menu,
        flags[menu] ?? fromMask(menuByKey(menu)?.supported ?? 0),
      ]),
    ),
  };
}

export const FORM_OPTIONS: InspectionFormOptions = {
  members: [
    {
      id: "0199c4a0-0000-7000-8000-0000000d0300",
      name: "Arun Selva Kumar",
      isOwner: true,
    },
    { id: INSPECTOR_ID, name: MEENA.name, isOwner: false },
  ],
  departments: [{ id: DEPARTMENT_ID, name: "Civil" }],
  contractors: [{ id: CONTRACTOR_ID, name: "Velan Constructions" }],
  drawings: [
    {
      id: DRAWING_ID,
      name: "Ground floor slab",
      albumName: "Structural",
      revision: 2,
    },
    {
      id: "0199c4a0-0000-7000-8000-0000000d0402",
      name: "Column schedule",
      albumName: "Structural",
      revision: null,
    },
  ],
};

export const INSPECTION_LOCATIONS: LocationOptions = {
  structure: "locations",
  types: ["location"],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [{ id: CULVERT_ID, name: "Culvert C3" }],
};

const ALL_ACTIONS = {
  edit: true,
  delete: true,
  approve: true,
  reject: true,
  observe: true,
  remark: true,
  reinspect: false,
  raiseSnag: true,
  print: true,
};

const DECIDED_ACTIONS = {
  ...ALL_ACTIONS,
  edit: false,
  delete: false,
  approve: false,
  reject: false,
  observe: false,
};

export function inspection(extra: Partial<Inspection> = {}): Inspection {
  return {
    id: PENDING_ID,
    projectId: INSPECTION_PROJECT_ID,
    number: "IR/26-27/00004",
    inspectionDate: TODAY,
    inspectionTime: "10:30",
    status: "pending",
    department: { id: DEPARTMENT_ID, name: "Civil" },
    contractor: { id: CONTRACTOR_ID, name: "Velan Constructions" },
    inspector: { memberId: INSPECTOR_ID, name: MEENA.name },
    workDescription: "Slab reinforcement before the pour, Block B roof",
    siteLocation: { type: "location", locationId: CULVERT_ID },
    drawings: [
      {
        id: DRAWING_ID,
        name: "Ground floor slab",
        albumId: ALBUM_ID,
        albumName: "Structural",
        revision: 2,
      },
    ],
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    reinspectionOf: null,
    reinspections: [],
    snags: [],
    createdBy: KARTHIK,
    createdAt: "2026-10-14T04:30:00.000Z",
    updatedAt: "2026-10-14T04:30:00.000Z",
    actions: ALL_ACTIONS,
    ...extra,
  };
}

export const APPROVED = inspection({
  id: APPROVED_ID,
  number: "IR/26-27/00003",
  inspectionDate: addDays(TODAY, -2),
  inspectionTime: null,
  workDescription: "Shuttering for columns C1–C8",
  inspector: null,
  status: "approved",
  decidedAt: "2026-10-12T10:00:00.000Z",
  decidedBy: MEENA,
  actions: DECIDED_ACTIONS,
});

export const REJECTED = inspection({
  id: REJECTED_ID,
  number: "IR/26-27/00002",
  inspectionDate: addDays(TODAY, -5),
  workDescription: "Waterproofing of the terrace",
  status: "rejected",
  decidedAt: "2026-10-09T11:15:00.000Z",
  decidedBy: MEENA,
  rejectionReason: "Lap joints not sealed at the parapet.",
  snags: [{ id: SNAG_ID, number: "ISS/26-27/00011" }],
  actions: { ...DECIDED_ACTIONS, reinspect: true },
});

export const REINSPECTION = inspection({
  id: REINSPECTION_ID,
  number: "IR/26-27/00005",
  workDescription: "Waterproofing of the terrace",
  reinspectionOf: {
    id: REJECTED_ID,
    number: REJECTED.number,
    status: "rejected",
  },
});

export const INSPECTIONS: Inspection[] = [inspection(), APPROVED, REJECTED];

export const OBSERVATIONS: InspectionObservation[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000d3001",
    body: "Cover blocks 20 mm at C4; two missing near the cut-out.",
    createdBy: MEENA,
    createdAt: "2026-10-14T05:10:00.000Z",
    files: [
      trackingFile(
        "C4 cover.jpg",
        {
          entryId: "0199c4a0-0000-7000-8000-0000000d3001",
          thumbUrl: trackingSwatch("#a8a29e"),
        },
        { type: "inspection", id: PENDING_ID },
      ),
    ],
    canDelete: false,
  },
];

export const REMARKS: InspectionRemark[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000d4001",
    body: "Contractor says the blocks arrive this afternoon.",
    createdBy: KARTHIK,
    createdAt: "2026-10-14T06:00:00.000Z",
  },
];

export const REINSPECTION_DRAFT: InspectionReinspection = {
  reinspectionOfId: REJECTED_ID,
  departmentId: DEPARTMENT_ID,
  contractorId: CONTRACTOR_ID,
  inspectorMemberId: INSPECTOR_ID,
  workDescription: REJECTED.workDescription,
  siteLocation: { type: "location", locationId: CULVERT_ID },
  drawingIds: [DRAWING_ID],
};

export type InspectionApiOptions = {
  inspections?: Inspection[];
  observations?: InspectionObservation[];
  remarks?: InspectionRemark[];
  files?: TrackingDocumentFile[];
  flags?: Partial<Record<TrackingAccessMenu, Flag[]>>;
  /** Refuse create with this error. */
  createError?: {
    status: number;
    code: string;
    message: string;
    field?: string;
  };
};

function counts(items: readonly Inspection[]) {
  return {
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  };
}

/** Answers the Inspection Request screens' reads and writes for one story. */
export function inspectionHandler(
  options: InspectionApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let inspections = [...(options.inspections ?? INSPECTIONS)];
  let observations = [...(options.observations ?? OBSERVATIONS)];
  let remarks = [...(options.remarks ?? REMARKS)];
  const files = mockTrackingDocumentApi({ files: options.files ?? [] });
  return (call) => {
    const answered = files(call);
    if (answered != null) return answered;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/tracking/access")
      return Response.json(
        trackingAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (
      /\/api\/construction\/projects\/projects\/[^/]+\/location-options$/.test(
        path,
      )
    )
      return Response.json(INSPECTION_LOCATIONS);
    if (call.method === "GET" && path === `${INSPECTIONS_API}/form-options`)
      return Response.json(FORM_OPTIONS);
    if (call.method === "GET" && path === INSPECTIONS_API) {
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search")?.toLowerCase() ?? "";
      const others = inspections.filter(
        (item) =>
          search === "" ||
          item.number.toLowerCase().includes(search) ||
          item.workDescription.toLowerCase().includes(search),
      );
      const items = others.filter(
        (item) => status == null || item.status === status,
      );
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
        counts: counts(others),
      } satisfies InspectionPage);
    }
    if (call.method === "POST" && path === INSPECTIONS_API) {
      const error = options.createError;
      if (error != null)
        return Response.json(
          {
            code: error.code,
            message: error.message,
            ...(error.field == null ? {} : { details: { field: error.field } }),
          },
          { status: error.status },
        );
      return Response.json(
        inspection({ id: "0199c4a0-0000-7000-8000-0000000d1009" }),
        { status: 201 },
      );
    }
    if (call.method === "POST" && path.startsWith(`${INSPECTIONS_API}/bulk-`)) {
      const body = call.body as { ids: string[]; raiseSnag?: boolean };
      const approve = path.endsWith("bulk-approve");
      let decided = 0;
      inspections = inspections.map((item) => {
        if (!body.ids.includes(item.id) || item.status !== "pending")
          return item;
        decided += 1;
        return {
          ...item,
          status: approve ? "approved" : "rejected",
          actions: DECIDED_ACTIONS,
        };
      });
      return Response.json({
        decided,
        skipped: body.ids.length - decided,
        snags:
          !approve && body.raiseSnag === true
            ? body.ids.slice(0, decided).map((inspectionId, index) => ({
                inspectionId,
                issueId: SNAG_ID,
                number: `ISS/26-27/0002${String(index)}`,
              }))
            : [],
      });
    }
    const item =
      /^\/api\/construction\/tracking\/inspections\/([^/]+)(?:\/([a-z]+))?(?:\/([^/]+)\/delete)?$/.exec(
        path,
      );
    if (item == null) return undefined;
    const [, id, action, observationId] = item;
    const found =
      inspections.find((entry) => entry.id === id) ??
      [REINSPECTION].find((entry) => entry.id === id) ??
      inspection();
    const replace = (next: Inspection) => {
      inspections = inspections.map((entry) =>
        entry.id === next.id ? next : entry,
      );
      return Response.json(next);
    };
    if (call.method === "GET" && action == null) return Response.json(found);
    if (call.method === "GET" && action === "reinspection")
      return Response.json(REINSPECTION_DRAFT);
    if (action === "observations") {
      if (call.method === "GET") return Response.json({ items: observations });
      if (call.method === "POST" && observationId != null) {
        observations = observations.filter((o) => o.id !== observationId);
        return new Response(null, { status: 204 });
      }
      if (call.method === "POST") {
        const body = call.body as { body: string | null };
        const added: InspectionObservation = {
          id: `0199c4a0-0000-7000-8000-0000000d30${String(observations.length + 10)}`,
          body: body.body,
          createdBy: KARTHIK,
          createdAt: new Date().toISOString(),
          files: [],
          canDelete: true,
        };
        observations = [...observations, added];
        return Response.json(added, { status: 201 });
      }
    }
    if (action === "remarks") {
      if (call.method === "GET") return Response.json({ items: remarks });
      const body = call.body as { body: string };
      const added: InspectionRemark = {
        id: `0199c4a0-0000-7000-8000-0000000d40${String(remarks.length + 10)}`,
        body: body.body,
        createdBy: KARTHIK,
        createdAt: new Date().toISOString(),
      };
      remarks = [...remarks, added];
      return Response.json(added, { status: 201 });
    }
    if (call.method === "POST" && action === "approve")
      return replace({
        ...found,
        status: "approved",
        decidedAt: new Date().toISOString(),
        decidedBy: KARTHIK,
        actions: DECIDED_ACTIONS,
      });
    if (call.method === "POST" && action === "reject") {
      const body = call.body as { reason: string; raiseSnag: boolean };
      return replace({
        ...found,
        status: "rejected",
        decidedAt: new Date().toISOString(),
        decidedBy: KARTHIK,
        rejectionReason: body.reason,
        snags: body.raiseSnag
          ? [{ id: SNAG_ID, number: "ISS/26-27/00012" }]
          : [],
        actions: { ...DECIDED_ACTIONS, reinspect: true },
      });
    }
    if (call.method === "POST" && action === "update")
      return Response.json(found);
    if (call.method === "POST" && action === "delete")
      return new Response(null, { status: 204 });
    return undefined;
  };
}

export function mockInspectionApi(options: InspectionApiOptions = {}) {
  return mockApi(inspectionHandler(options));
}
