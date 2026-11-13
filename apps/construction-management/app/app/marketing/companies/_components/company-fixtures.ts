import { mockApi, type ApiCall } from "@/.storybook/mocks/api";
import type { Stage } from "@/src/marketing/domain/marketing-terms";
import type { NeedsReassigning } from "@/src/queries/marketing-team";
import {
  MARKETING_COMPANIES_API,
  type ProspectCompany,
  type ProspectCompanyContact,
  type ProspectCompanyFormOptions,
  type ProspectCompanyListItem,
  type ProspectCompanyPage,
  type ProspectCompanyTimelineItem,
} from "@/src/queries/marketing-companies";

export { MARKETING_COMPANIES_API };

export const OWNER_MEMBER_ID = "0199d000-0000-7000-8000-000000000001";
export const RAVI_MEMBER_ID = "0199d000-0000-7000-8000-000000000002";
export const PRIYA_MEMBER_ID = "0199d000-0000-7000-8000-000000000003";
export const MANI_MEMBER_ID = "0199d000-0000-7000-8000-000000000004";

export const BALAJI_ID = "0199d000-0000-7000-8000-000000000101";
export const TEXTILES_ID = "0199d000-0000-7000-8000-000000000102";
export const KAVERI_ID = "0199d000-0000-7000-8000-000000000103";
export const STEEL_ID = "0199d000-0000-7000-8000-000000000104";
export const NEW_COMPANY_ID = "0199d000-0000-7000-8000-000000000199";

export const SENTHIL_ID = "0199d000-0000-7000-8000-000000000201";
export const LAKSHMI_ID = "0199d000-0000-7000-8000-000000000202";
export const MURUGAN_ID = "0199d000-0000-7000-8000-000000000203";

const RAVI = { id: RAVI_MEMBER_ID, name: "Ravi Shankar" };
const PRIYA = { id: PRIYA_MEMBER_ID, name: "Priya Raman" };
const OWNER = { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar" };

export const COMPANY_FORM_OPTIONS: ProspectCompanyFormOptions = {
  people: [
    { ...OWNER, mobile: "+919840000001", isOwner: true, active: true },
    { ...PRIYA, mobile: "+919840000003", isOwner: false, active: true },
    { ...RAVI, mobile: "+919840000002", isOwner: false, active: true },
    {
      id: MANI_MEMBER_ID,
      name: "Mani Kandan",
      mobile: null,
      isOwner: false,
      active: false,
    },
  ],
  industries: ["Cement", "Infrastructure", "Steel fabrication", "Textiles"],
};

export function contact(
  overrides: Partial<ProspectCompanyContact> = {},
): ProspectCompanyContact {
  return {
    id: SENTHIL_ID,
    name: "Senthil Kumar",
    jobTitle: "Purchase Manager",
    mobile: "+919845012345",
    email: "senthil@balajiinfra.in",
    remarks: null,
    isPrimary: true,
    updatedAt: "2026-11-02T05:00:00.000Z",
    ...overrides,
  };
}

type StageEntry = Extract<ProspectCompanyTimelineItem, { kind: "stage" }>;

function entry(
  id: string,
  fromStage: Stage | null,
  toStage: Stage,
  at: string,
  byName: string,
  lost: Pick<StageEntry, "lostReason" | "lostReasonText"> = {
    lostReason: null,
    lostReasonText: null,
  },
): ProspectCompanyTimelineItem {
  return { kind: "stage", id, fromStage, toStage, at, byName, ...lost };
}

/** MV-0003 on Sri Balaji, completed; the Visit stories open the same id. */
export const BALAJI_VISIT_ID = "0199d000-0000-7000-8000-000000000503";

/** Sri Balaji Infra Projects at Quotation sent, with two Contacts. */
export function company(
  overrides: Partial<ProspectCompany> = {},
): ProspectCompany {
  return {
    id: BALAJI_ID,
    name: "Sri Balaji Infra Projects",
    industry: "Infrastructure",
    address: "14, Anna Salai, Guindy",
    city: "Chennai",
    stateCode: "33",
    pin: "600032",
    phone: "044 2235 1100",
    email: "info@balajiinfra.in",
    website: "balajiinfra.in",
    gstin: "33AABCS1429B1Z5",
    source: "reference",
    remarks: "Building a warehouse in Sriperumbudur next year.",
    assignedTo: RAVI,
    stage: "quotation_sent",
    lostReason: null,
    lostReasonText: null,
    createdByName: "Arun Selva Kumar",
    timeZone: "Asia/Kolkata",
    createdAt: "2026-11-01T04:30:00.000Z",
    updatedAt: "2026-11-12T10:35:00.000Z",
    contacts: [
      contact(),
      contact({
        id: LAKSHMI_ID,
        name: "Lakshmi Priya",
        jobTitle: "Project Engineer",
        mobile: "+919790012345",
        email: null,
        remarks: "Call after 11 am.",
        isPrimary: false,
      }),
    ],
    timeline: [
      entry(
        "0199d000-0000-7000-8000-000000000304",
        "requirement_received",
        "quotation_sent",
        "2026-11-12T10:35:00.000Z",
        "Ravi Shankar",
      ),
      {
        kind: "note",
        id: "0199d000-0000-7000-8000-000000000601",
        visitId: BALAJI_VISIT_ID,
        visitNumber: "MV-0003",
        text: "Sent the PEB drawings they asked for.",
        at: "2026-11-11T06:30:00.000Z",
        byName: "Priya Raman",
      },
      {
        kind: "file",
        id: "0199d000-0000-7000-8000-000000000901",
        visitId: BALAJI_VISIT_ID,
        visitNumber: "MV-0003",
        fileName: "card.jpg",
        caption: "Senthil's visiting card",
        at: "2026-11-10T09:05:00.000Z",
        byName: "Ravi Shankar",
      },
      {
        kind: "visit",
        id: BALAJI_VISIT_ID,
        number: "MV-0003",
        at: "2026-11-10T08:00:00.000Z",
        status: "completed",
        purpose: "requirement_discussion",
        outcome: "Asked for a quotation",
        visitorNames: ["Ravi Shankar", "Priya Raman"],
      },
      entry(
        "0199d000-0000-7000-8000-000000000303",
        "contacted",
        "requirement_received",
        "2026-11-06T06:00:00.000Z",
        "Ravi Shankar",
      ),
      entry(
        "0199d000-0000-7000-8000-000000000302",
        "new",
        "contacted",
        "2026-11-03T08:15:00.000Z",
        "Ravi Shankar",
      ),
      entry(
        "0199d000-0000-7000-8000-000000000301",
        null,
        "new",
        "2026-11-01T04:30:00.000Z",
        "Arun Selva Kumar",
      ),
    ],
    actions: { canUpdate: true, canDelete: true, canReassign: true },
    ...overrides,
  };
}

/** Kaveri Cement Works, Lost for "Other" with the words. */
export function lostCompany(
  overrides: Partial<ProspectCompany> = {},
): ProspectCompany {
  return company({
    id: KAVERI_ID,
    name: "Kaveri Cement Works",
    industry: "Cement",
    city: "Tiruchirappalli",
    stage: "lost",
    lostReason: "other",
    lostReasonText: "Budget moved to next year",
    contacts: [
      contact({
        id: MURUGAN_ID,
        name: "Murugan P",
        jobTitle: "Director",
        mobile: "+919443012345",
        email: null,
      }),
    ],
    timeline: [
      entry(
        "0199d000-0000-7000-8000-000000000312",
        "negotiation",
        "lost",
        "2026-11-10T09:00:00.000Z",
        "Ravi Shankar",
        { lostReason: "other", lostReasonText: "Budget moved to next year" },
      ),
      entry(
        "0199d000-0000-7000-8000-000000000311",
        null,
        "new",
        "2026-10-20T04:30:00.000Z",
        "Ravi Shankar",
      ),
    ],
    ...overrides,
  });
}

/** Four companies in A–Z order, as the list answers them. */
export const COMPANIES: ProspectCompany[] = [
  company({
    id: TEXTILES_ID,
    name: "Coimbatore Textiles Ltd",
    industry: "Textiles",
    city: "Coimbatore",
    stage: "new",
    assignedTo: PRIYA,
    contacts: [],
    timeline: [],
  }),
  lostCompany(),
  company({
    id: STEEL_ID,
    name: "Madurai Steel Structures",
    industry: "Steel fabrication",
    city: "Madurai",
    stage: "won",
    assignedTo: OWNER,
    contacts: [],
    timeline: [],
  }),
  company(),
];

/**
 * Each company's earliest open Follow-up, as the Follow-up stories have
 * them on 12 Nov: Kaveri's and Coimbatore's are overdue, Balaji's is today.
 */
const NEXT_FOLLOW_UP_ON: Record<string, string> = {
  [BALAJI_ID]: "2026-11-12",
  [KAVERI_ID]: "2026-11-09",
  [TEXTILES_ID]: "2026-11-10",
};

type FollowUpEntry = Extract<
  ProspectCompanyTimelineItem,
  { kind: "follow_up" }
>;

/** Balaji's Follow-ups on its history: a call Done, and one cancelled. */
export function followUpEntries(): FollowUpEntry[] {
  return [
    {
      kind: "follow_up",
      id: "0199d000-0000-7000-8000-000000000805",
      visitId: BALAJI_VISIT_ID,
      visitNumber: "MV-0003",
      type: "call",
      status: "done",
      dueDate: "2026-11-11",
      ownerName: "Ravi Shankar",
      note: "Check the drawings reached them",
      resultNote: "Sent the rates",
      at: "2026-11-11T09:00:00.000Z",
    },
    {
      kind: "follow_up",
      id: "0199d000-0000-7000-8000-000000000806",
      visitId: null,
      visitNumber: null,
      type: "email",
      status: "cancelled",
      dueDate: "2026-11-04",
      ownerName: "Priya Raman",
      note: null,
      resultNote: null,
      at: "2026-11-03T09:00:00.000Z",
    },
  ];
}

export function toListItem(detail: ProspectCompany): ProspectCompanyListItem {
  const primary = detail.contacts.find((item) => item.isPrimary);
  return {
    id: detail.id,
    name: detail.name,
    industry: detail.industry,
    city: detail.city,
    stateCode: detail.stateCode,
    stage: detail.stage,
    assignedTo: detail.assignedTo,
    primaryContact:
      primary == null ? null : { name: primary.name, mobile: primary.mobile },
    lastVisitAt:
      detail.timeline.find(
        (item) => item.kind === "visit" && item.status === "completed",
      )?.at ?? null,
    nextFollowUpOn: NEXT_FOLLOW_UP_ON[detail.id] ?? null,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

/**
 * Mani Kandan left: Kaveri is still his, with an open call; Priya's
 * Coimbatore quotation is his too.
 */
export const NEEDS_REASSIGNING: NeedsReassigning = {
  companies: [
    {
      id: KAVERI_ID,
      name: "Kaveri Cement Works",
      city: "Tiruchirappalli",
      stage: "negotiation",
      assignedTo: { id: MANI_MEMBER_ID, name: "Mani Kandan" },
      updatedAt: "2026-11-10T09:00:00.000Z",
    },
  ],
  followUps: [
    {
      id: "0199d000-0000-7000-8000-000000000871",
      type: "call",
      dueDate: "2026-11-14",
      owner: { id: MANI_MEMBER_ID, name: "Mani Kandan" },
      prospectCompany: { id: KAVERI_ID, name: "Kaveri Cement Works" },
      updatedAt: "2026-11-09T09:00:00.000Z",
    },
    {
      id: "0199d000-0000-7000-8000-000000000872",
      type: "send_quotation",
      dueDate: "2026-11-10",
      owner: { id: MANI_MEMBER_ID, name: "Mani Kandan" },
      prospectCompany: { id: TEXTILES_ID, name: "Coimbatore Textiles Ltd" },
      updatedAt: "2026-11-08T09:00:00.000Z",
    },
  ],
};

export type CompanyApiOptions = {
  companies?: ProspectCompany[];
  /** What needs reassigning; nothing unless set. */
  needsReassigning?: NeedsReassigning;
  /** Rows per list page; all at once unless set. */
  pageSize?: number;
  /** Names a create or edit refuses as in use. */
  takenNames?: string[];
  /** Answers before the defaults (an error a story wants). */
  extra?: (call: ApiCall) => Response | undefined;
};

const SAVED_AT = "2026-11-12T11:00:00.000Z";

function normalisedMobile(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

function text(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * A story's company answers, and `add` for a company another screen's mock
 * creates (a Visit with a new company), so its page opens afterwards.
 */
export type CompanyHandler = ((call: ApiCall) => Response | undefined) & {
  add: (company: ProspectCompany) => void;
};

/** Answers the Prospect Company screens' reads and writes for one story. */
export function companyHandler(
  options: CompanyApiOptions = {},
): CompanyHandler {
  let companies = [...(options.companies ?? COMPANIES)];
  const add = (next: ProspectCompany) => {
    companies = [...companies.filter((item) => item.id !== next.id), next];
  };
  const taken = (name: unknown, exceptId?: string) =>
    typeof name === "string" &&
    [
      ...(options.takenNames ?? []),
      ...companies
        .filter((item) => item.id !== exceptId)
        .map((item) => item.name),
    ].some((other) => other.toLowerCase() === name.trim().toLowerCase());
  const nameInUse = () =>
    json(
      {
        code: "PROSPECT_COMPANY_NAME_IN_USE",
        message: "A Prospect Company with this name already exists.",
        details: { field: "name" },
      },
      409,
    );
  const save = (next: ProspectCompany) => {
    companies = companies.map((item) => (item.id === next.id ? next : item));
    return json(next);
  };

  const handler = (call: ApiCall): Response | undefined => {
    const extra = options.extra?.(call);
    if (extra != null) return extra;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    const body = (call.body ?? {}) as Record<string, unknown>;

    if (
      call.method === "GET" &&
      path === `${MARKETING_COMPANIES_API}/form-options`
    )
      return json(COMPANY_FORM_OPTIONS);

    if (
      call.method === "GET" &&
      path === `${MARKETING_COMPANIES_API}/needs-reassigning`
    )
      return json(options.needsReassigning ?? { companies: [], followUps: [] });

    if (call.method === "GET" && path === MARKETING_COMPANIES_API) {
      const search = url.searchParams.get("search")?.toLowerCase();
      const stages = url.searchParams.get("stage")?.split(",");
      const assigned = url.searchParams.get("assignedMemberId");
      const industry = url.searchParams.get("industry")?.toLowerCase();
      const matching = companies.filter(
        (item) =>
          (search == null ||
            item.name.toLowerCase().includes(search) ||
            (item.city ?? "").toLowerCase().includes(search) ||
            item.contacts.some(
              (person) =>
                person.name.toLowerCase().includes(search) ||
                (person.mobile ?? "").includes(search),
            )) &&
          (stages == null || stages.includes(item.stage)) &&
          (assigned == null || item.assignedTo?.id === assigned) &&
          (industry == null || item.industry?.toLowerCase() === industry),
      );
      const start = Number(url.searchParams.get("after") ?? "0");
      const size = options.pageSize ?? matching.length;
      const page = matching.slice(start, start + size);
      const next = start + size;
      return json({
        items: page.map(toListItem),
        nextCursor: next < matching.length ? String(next) : null,
        total: matching.length,
        timeZone: "Asia/Kolkata",
      } satisfies ProspectCompanyPage);
    }

    if (call.method === "POST" && path === MARKETING_COMPANIES_API) {
      if (taken(body["name"])) return nameInUse();
      const first = body["primaryContact"] as Record<string, unknown> | null;
      const assignedId = text(body, "assignedMemberId") ?? OWNER_MEMBER_ID;
      const person =
        COMPANY_FORM_OPTIONS.people.find((item) => item.id === assignedId) ??
        OWNER;
      const created = company({
        id: NEW_COMPANY_ID,
        name: String(body["name"]),
        industry: text(body, "industry"),
        city: text(body, "city"),
        stage: "new",
        assignedTo: { id: person.id, name: person.name },
        contacts:
          first == null
            ? []
            : [
                contact({
                  name: String(first["name"]),
                  mobile: normalisedMobile(first["mobile"]),
                }),
              ],
        timeline: [],
      });
      companies = [...companies, created];
      return json(created, 201);
    }

    const match =
      /^\/api\/construction\/marketing\/companies\/([^/]+)(?:\/(update|delete|stage|reassign|contacts)(?:\/([^/]+)\/(update|delete))?)?$/.exec(
        path,
      );
    if (match == null) return undefined;
    const [, id, action, contactId, contactAction] = match;
    const found = companies.find((item) => item.id === id);
    if (found == null)
      return json(
        {
          code: "PROSPECT_COMPANY_NOT_FOUND",
          message: "This Prospect Company was not found.",
        },
        404,
      );

    if (call.method === "GET" && action == null) return json(found);
    if (call.method !== "POST") return undefined;

    if (action === "update") {
      if (taken(body["name"], found.id)) return nameInUse();
      return save({
        ...found,
        name: String(body["name"]),
        city: text(body, "city"),
        industry: text(body, "industry"),
        updatedAt: SAVED_AT,
      });
    }
    if (action === "reassign") {
      const person = COMPANY_FORM_OPTIONS.people.find(
        (item) => item.id === body["assignedMemberId"] && item.active,
      );
      if (person == null)
        return json(
          {
            code: "MARKETING_PERSON_NOT_FOUND",
            message: "Choose an active Marketing Person.",
            details: { field: "assignedMemberId" },
          },
          400,
        );
      return save({
        ...found,
        assignedTo: { id: person.id, name: person.name },
        updatedAt: SAVED_AT,
      });
    }
    if (action === "delete") {
      companies = companies.filter((item) => item.id !== id);
      return new Response(null, { status: 204 });
    }
    if (action === "stage") {
      const stage = body["stage"] as Stage;
      const lostReason = (body["lostReason"] ??
        null) as ProspectCompany["lostReason"];
      if (stage === "lost" && lostReason == null)
        return json(
          {
            code: "LOST_REASON_REQUIRED",
            message: "Choose why the company was lost.",
            details: { field: "lostReason" },
          },
          400,
        );
      const lostReasonText = text(body, "lostReasonText");
      return save({
        ...found,
        stage,
        lostReason,
        lostReasonText,
        updatedAt: SAVED_AT,
        timeline: [
          entry(
            "0199d000-0000-7000-8000-000000000399",
            found.stage,
            stage,
            SAVED_AT,
            "Arun Selva Kumar",
            { lostReason, lostReasonText },
          ),
          ...found.timeline,
        ],
      });
    }
    if (action === "contacts" && contactId == null) {
      const primary = found.contacts.length === 0 || body["isPrimary"] === true;
      const added = contact({
        id: "0199d000-0000-7000-8000-000000000299",
        name: String(body["name"]),
        jobTitle: text(body, "jobTitle"),
        mobile: normalisedMobile(body["mobile"]),
        email: text(body, "email"),
        remarks: text(body, "remarks"),
        isPrimary: primary,
        updatedAt: SAVED_AT,
      });
      return save({
        ...found,
        contacts: [
          ...found.contacts.map((item) =>
            primary ? { ...item, isPrimary: false } : item,
          ),
          added,
        ],
      });
    }
    if (action === "contacts" && contactAction === "update") {
      const primary = body["isPrimary"] === true;
      return save({
        ...found,
        contacts: found.contacts.map((item) =>
          item.id === contactId
            ? {
                ...item,
                name: String(body["name"]),
                jobTitle: text(body, "jobTitle"),
                mobile: normalisedMobile(body["mobile"]),
                email: text(body, "email"),
                remarks: text(body, "remarks"),
                isPrimary: item.isPrimary || primary,
                updatedAt: SAVED_AT,
              }
            : primary
              ? { ...item, isPrimary: false }
              : item,
        ),
      });
    }
    if (action === "contacts" && contactAction === "delete") {
      const removed = found.contacts.find((item) => item.id === contactId);
      const rest = found.contacts.filter((item) => item.id !== contactId);
      const [earliest] = rest;
      return save({
        ...found,
        contacts:
          removed?.isPrimary === true && earliest != null
            ? rest.map((item) =>
                item.id === earliest.id ? { ...item, isPrimary: true } : item,
              )
            : rest,
      });
    }
    return undefined;
  };
  return Object.assign(handler, { add });
}

export function mockCompanyApi(options: CompanyApiOptions = {}) {
  return mockApi(companyHandler(options));
}
