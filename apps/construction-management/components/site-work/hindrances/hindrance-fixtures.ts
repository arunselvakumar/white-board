import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type { SiteWorkAccessMenu } from "@/app/api/construction/site-work/access/access-models";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import { mockSiteWorkDocumentApi } from "@/components/site-work/documents/site-work-document-fixtures";
import { siteWorkAccess } from "@/components/site-work/site-diary/site-diary-fixtures";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import type {
  Hindrance,
  HindranceFormOptions,
  HindrancePage,
} from "@/src/queries/hindrances";
import type { LocationOptions } from "@/src/queries/location-options";

/** Story fixtures for the Hindrance register (CM-607). */

export const HINDRANCES_API = "/api/construction/site-work/hindrances";
export const HINDRANCE_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000f0001";
export const CONTRACTOR_ID = "0199c4a0-0000-7000-8000-0000000f0101";
export const SHEET_ID = "0199c4a0-0000-7000-8000-0000000f0201";
export const OWNER_ID = "user-owner";
export const CULVERT_ID = "0199c4a0-0000-7000-8000-0000000f0301";

const TODAY = localToday();
const KARTHIK = { userId: "user-karthik", name: "Karthik R" };

export const FORM_OPTIONS: HindranceFormOptions = {
  contractors: [
    { id: CONTRACTOR_ID, name: "Velan Constructions", isActive: true },
  ],
  teamMembers: [
    { userId: OWNER_ID, name: "Arun Selva Kumar", isOwner: true },
    { userId: KARTHIK.userId, name: KARTHIK.name, isOwner: false },
  ],
};

export const HINDRANCE_LOCATIONS: LocationOptions = {
  structure: "locations",
  types: ["location"],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [{ id: CULVERT_ID, name: "Culvert C3" }],
};

export function hindrance(extra: Partial<Hindrance> = {}): Hindrance {
  return {
    id: "0199c4a0-0000-7000-8000-0000000f1001",
    projectId: HINDRANCE_PROJECT_ID,
    number: "HR/26-27/00003",
    startDate: addDays(TODAY, -3),
    endDate: null,
    status: "open",
    daysLost: 4,
    hoursLost: "16.5",
    cause: "labour_shortage",
    affectedActivity: "Roof slab shuttering, Block B",
    siteLocation: { type: "location", locationId: CULVERT_ID },
    responsibleParty: "contractor",
    contractor: { id: CONTRACTOR_ID, name: "Velan Constructions" },
    description: "Half the carpenters went to another site after the festival.",
    equipmentUsageSheet: null,
    signOff: null,
    createdBy: KARTHIK,
    createdAt: "2026-10-08T09:00:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
    actions: { edit: true, close: true, delete: true, print: true },
    ...extra,
  };
}

export const HINDRANCES: Hindrance[] = [
  hindrance(),
  hindrance({
    id: "0199c4a0-0000-7000-8000-0000000f1002",
    number: "HR/26-27/00002",
    startDate: addDays(TODAY, -10),
    endDate: addDays(TODAY, -8),
    status: "closed",
    daysLost: 3,
    hoursLost: null,
    cause: "weather",
    affectedActivity: "Excavation for footings",
    siteLocation: null,
    responsibleParty: "force_majeure",
    contractor: null,
    signOff: {
      teamMember: { userId: OWNER_ID, name: "Arun Selva Kumar" },
      partyName: "Suresh Babu",
      partyRole: "PMC engineer",
      signedOn: addDays(TODAY, -8),
    },
    actions: { edit: true, close: false, delete: true, print: true },
  }),
];

export type HindranceApiOptions = {
  hindrances?: Hindrance[];
  flags?: Partial<Record<SiteWorkAccessMenu, Flag[]>>;
  /** Refuse create with this error. */
  createError?: {
    status: number;
    code: string;
    message: string;
    field?: string;
  };
};

/** Answers the Hindrance screens' reads and writes for one story. */
export function hindranceHandler(
  options: HindranceApiOptions = {},
): (call: ApiCall) => Response | undefined {
  const hindrances = options.hindrances ?? HINDRANCES;
  const documents = mockSiteWorkDocumentApi();
  return (call) => {
    const thread = documents(call);
    if (thread != null) return thread;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/site-work/access")
      return Response.json(
        siteWorkAccess(url.searchParams.get("projectId"), options.flags),
      );
    if (
      /\/api\/construction\/projects\/projects\/[^/]+\/location-options$/.test(
        path,
      )
    )
      return Response.json(HINDRANCE_LOCATIONS);
    if (call.method === "GET" && path === `${HINDRANCES_API}/form-options`)
      return Response.json(FORM_OPTIONS);
    if (call.method === "GET" && path === HINDRANCES_API) {
      const status = url.searchParams.get("status");
      const cause = url.searchParams.get("cause");
      const items = hindrances.filter(
        (item) =>
          (status == null || item.status === status) &&
          (cause == null || item.cause === cause),
      );
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies HindrancePage);
    }
    if (call.method === "POST" && path === HINDRANCES_API) {
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
        { ...hindrance(), id: "0199c4a0-0000-7000-8000-0000000f1009" },
        { status: 201 },
      );
    }
    const item =
      /^\/api\/construction\/site-work\/hindrances\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const found = hindrances.find((entry) => entry.id === id) ?? hindrance();
      if (call.method === "GET" && action == null) return Response.json(found);
      if (call.method === "POST" && action === "close") {
        const body = call.body as { endDate: string; hoursLost: string | null };
        return Response.json({
          ...found,
          endDate: body.endDate,
          hoursLost: body.hoursLost,
          status: "closed",
          actions: { ...found.actions, close: false },
        });
      }
      if (call.method === "POST" && action === "update")
        return Response.json(found);
      if (call.method === "POST" && action === "delete")
        return new Response(null, { status: 204 });
    }
    return undefined;
  };
}

export function mockHindranceApi(options: HindranceApiOptions = {}) {
  return mockApi(hindranceHandler(options));
}
