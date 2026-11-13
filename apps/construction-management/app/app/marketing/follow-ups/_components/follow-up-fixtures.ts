import { mockApi, type ApiCall } from "@/.storybook/mocks/api";
import type { FollowUpDue } from "@/src/marketing/domain/marketing-terms";
import {
  MARKETING_FOLLOW_UPS_API,
  type FollowUp,
  type FollowUpFormOptions,
  type FollowUpPage,
} from "@/src/queries/marketing-follow-ups";

import {
  BALAJI_ID,
  BALAJI_VISIT_ID,
  COMPANIES,
  KAVERI_ID,
  OWNER_MEMBER_ID,
  PRIYA_MEMBER_ID,
  RAVI_MEMBER_ID,
  STEEL_ID,
  TEXTILES_ID,
} from "../../companies/_components/company-fixtures";
import {
  MISSED_ID,
  visitHandler,
  type VisitApiOptions,
} from "../../visits/_components/visit-fixtures";

export { MARKETING_FOLLOW_UPS_API };

/** The Company's today in the stories (12 Nov 2026, Asia/Kolkata). */
export const TODAY = "2026-11-12";

export const OVERDUE_VISIT_ID = "0199d000-0000-7000-8000-000000000a01";
export const TODAY_CALL_ID = "0199d000-0000-7000-8000-000000000a02";
export const UPCOMING_QUOTE_ID = "0199d000-0000-7000-8000-000000000a03";
export const RAVI_EMAIL_ID = "0199d000-0000-7000-8000-000000000a04";
export const DONE_CALL_ID = "0199d000-0000-7000-8000-000000000a05";
export const CANCELLED_ID = "0199d000-0000-7000-8000-000000000a06";
export const NEW_FOLLOW_UP_ID = "0199d000-0000-7000-8000-000000000a99";

const OWNER = { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar" };
const RAVI = { id: RAVI_MEMBER_ID, name: "Ravi Shankar" };
const PRIYA = { id: PRIYA_MEMBER_ID, name: "Priya Raman" };

const company = (id: string, canOpen = true) => {
  const found = COMPANIES.find((item) => item.id === id);
  return { id, name: found?.name ?? "Unknown", canOpen };
};

const FOLLOW_UP_PEOPLE: FollowUpFormOptions["people"] = [
  { ...OWNER, mobile: "+919840000001", isOwner: true, active: true },
  { ...PRIYA, mobile: "+919840000003", isOwner: false, active: true },
  { ...RAVI, mobile: "+919840000002", isOwner: false, active: true },
];

export const FOLLOW_UP_FORM_OPTIONS: FollowUpFormOptions = {
  people: FOLLOW_UP_PEOPLE,
  allPeople: [
    ...FOLLOW_UP_PEOPLE,
    {
      id: "5c0e7d1a-3b2f-4e6a-9d8c-7b6a5f4e3d2c",
      name: "Karthik Raja",
      mobile: "+919840000004",
      isOwner: false,
      active: false,
    },
  ],
  selfMemberId: OWNER_MEMBER_ID,
  companies: COMPANIES.map((item) => ({ id: item.id, name: item.name })).sort(
    (a, b) => a.name.localeCompare(b.name),
  ),
  today: TODAY,
  canSeeAll: true,
};

const OPEN_ACTIONS: FollowUp["actions"] = {
  canUpdate: true,
  canClose: true,
  canDelete: true,
};
const CLOSED_ACTIONS: FollowUp["actions"] = {
  canUpdate: false,
  canClose: false,
  canDelete: true,
};

function due(
  followUp: Pick<FollowUp, "status" | "dueDate">,
): FollowUpDue | null {
  if (followUp.status !== "open") return null;
  if (followUp.dueDate < TODAY) return "overdue";
  return followUp.dueDate === TODAY ? "today" : "upcoming";
}

/** The viewer's call to Sri Balaji due today, from MV-0003. */
export function followUp(overrides: Partial<FollowUp> = {}): FollowUp {
  const base: FollowUp = {
    id: TODAY_CALL_ID,
    prospectCompany: company(BALAJI_ID),
    visit: { id: BALAJI_VISIT_ID, number: "MV-0003", canOpen: true },
    type: "call",
    dueDate: TODAY,
    due: "today",
    owner: OWNER,
    note: "Ask if the drawings reached them",
    status: "open",
    resultNote: null,
    doneOn: null,
    createdByName: "Ravi Shankar",
    createdAt: "2026-11-10T09:00:00.000Z",
    updatedAt: "2026-11-10T09:00:00.000Z",
    actions: OPEN_ACTIONS,
  };
  const next = { ...base, ...overrides };
  return { ...next, due: due(next) };
}

/** Mine: overdue, today and upcoming; a colleague's; one Done, one Cancelled. */
export const FOLLOW_UPS: FollowUp[] = [
  followUp({
    id: CANCELLED_ID,
    prospectCompany: company(STEEL_ID),
    visit: null,
    type: "other",
    dueDate: "2026-11-05",
    owner: PRIYA,
    note: "Ask about the second shed",
    status: "cancelled",
    actions: CLOSED_ACTIONS,
  }),
  followUp({
    id: OVERDUE_VISIT_ID,
    prospectCompany: company(KAVERI_ID),
    visit: { id: MISSED_ID, number: "MV-0002", canOpen: true },
    type: "visit",
    dueDate: "2026-11-09",
    note: "Go again with the PEB brochure",
  }),
  followUp({
    id: RAVI_EMAIL_ID,
    prospectCompany: company(TEXTILES_ID, false),
    visit: null,
    type: "email",
    dueDate: "2026-11-10",
    owner: RAVI,
    note: null,
  }),
  followUp({
    id: DONE_CALL_ID,
    dueDate: "2026-11-11",
    note: "Check the drawings reached them",
    status: "done",
    resultNote: "Sent the rates",
    doneOn: "2026-11-11",
    actions: CLOSED_ACTIONS,
  }),
  followUp(),
  followUp({
    id: UPCOMING_QUOTE_ID,
    type: "send_quotation",
    dueDate: "2026-11-16",
    note: "PEB warehouse rates",
  }),
];

export type FollowUpApiOptions = {
  followUps?: FollowUp[];
  formOptions?: Partial<FollowUpFormOptions>;
  /** Answers before the defaults (an error a story wants). */
  extra?: (call: ApiCall) => Response | undefined;
  /** The Visit and Prospect Company reads behind it. */
  visits?: VisitApiOptions;
};

const SAVED_AT = "2026-11-12T06:40:00.000Z";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function text(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Answers the Follow-up screens' reads and writes, then the Visit ones. */
export function followUpHandler(
  options: FollowUpApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let followUps = [...(options.followUps ?? FOLLOW_UPS)];
  const formOptions = { ...FOLLOW_UP_FORM_OPTIONS, ...options.formOptions };
  const visits = visitHandler(options.visits);
  const person = (id: unknown) => {
    const found = formOptions.people.find((item) => item.id === id);
    return found == null ? OWNER : { id: found.id, name: found.name };
  };
  const save = (next: FollowUp) => {
    const fresh = { ...next, due: due(next), updatedAt: SAVED_AT };
    followUps = followUps.map((item) => (item.id === next.id ? fresh : item));
    return json(fresh);
  };

  return (call) => {
    const extra = options.extra?.(call);
    if (extra != null) return extra;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    const body = (call.body ?? {}) as Record<string, unknown>;

    if (!path.startsWith(MARKETING_FOLLOW_UPS_API)) return visits(call);

    if (
      call.method === "GET" &&
      path === `${MARKETING_FOLLOW_UPS_API}/form-options`
    )
      return json(formOptions);

    if (call.method === "GET" && path === MARKETING_FOLLOW_UPS_API) {
      const get = (key: string) => url.searchParams.get(key);
      const statuses = get("status")?.split(",");
      const mine = get("mine") === "1";
      const matching = followUps
        .filter(
          (item) =>
            (!mine || item.owner.id === formOptions.selfMemberId) &&
            (get("ownerMemberId") == null ||
              item.owner.id === get("ownerMemberId")) &&
            (statuses == null || statuses.includes(item.status)) &&
            (get("prospectCompanyId") == null ||
              item.prospectCompany.id === get("prospectCompanyId")) &&
            (get("visitId") == null || item.visit?.id === get("visitId")),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return json({
        items: matching,
        nextCursor: null,
        total: matching.length,
        today: TODAY,
      } satisfies FollowUpPage);
    }

    if (call.method === "POST" && path === MARKETING_FOLLOW_UPS_API) {
      const target = COMPANIES.find(
        (item) => item.id === body["prospectCompanyId"],
      );
      const visitId = text(body, "visitId");
      const created = followUp({
        id: NEW_FOLLOW_UP_ID,
        prospectCompany: company(target?.id ?? BALAJI_ID),
        visit:
          visitId == null
            ? null
            : { id: visitId, number: "MV-0003", canOpen: true },
        type: body["type"] as FollowUp["type"],
        dueDate: String(body["dueDate"]),
        owner: person(body["ownerMemberId"]),
        note: text(body, "note"),
        createdByName: "Arun Selva Kumar",
        createdAt: SAVED_AT,
        updatedAt: SAVED_AT,
      });
      followUps = [...followUps, created];
      return json(created, 201);
    }

    const match =
      /^\/api\/construction\/marketing\/follow-ups\/([^/]+)(?:\/(update|done|cancel|delete))?$/.exec(
        path,
      );
    if (match == null) return undefined;
    const [, id, action] = match;
    const found = followUps.find((item) => item.id === id);
    if (found == null)
      return json(
        {
          code: "FOLLOW_UP_NOT_FOUND",
          message: "This Follow-up was not found.",
        },
        404,
      );
    if (call.method === "GET" && action == null) return json(found);
    if (call.method !== "POST") return undefined;

    switch (action) {
      case "update":
        return save({
          ...found,
          type: body["type"] as FollowUp["type"],
          dueDate: String(body["dueDate"]),
          owner: person(body["ownerMemberId"] ?? found.owner.id),
          note: text(body, "note"),
        });
      case "done":
        return save({
          ...found,
          status: "done",
          resultNote: text(body, "resultNote"),
          doneOn: text(body, "doneOn") ?? TODAY,
          actions: CLOSED_ACTIONS,
        });
      case "cancel":
        return save({ ...found, status: "cancelled", actions: CLOSED_ACTIONS });
      case "delete":
        followUps = followUps.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}

export function mockFollowUpApi(options: FollowUpApiOptions = {}) {
  return mockApi(followUpHandler(options));
}
