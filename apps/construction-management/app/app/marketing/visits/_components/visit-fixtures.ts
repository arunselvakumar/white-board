import { mockApi, type ApiCall } from "@/.storybook/mocks/api";
import {
  VISIT_FILE_LIMIT,
  visitFilesUrl,
  type VisitFile,
} from "@/src/queries/marketing-visit-files";
import {
  MARKETING_VISITS_API,
  type Visit,
  type VisitFormOptions,
  type VisitListItem,
  type VisitPage,
} from "@/src/queries/marketing-visits";

import {
  BALAJI_ID,
  BALAJI_VISIT_ID,
  COMPANIES,
  KAVERI_ID,
  LAKSHMI_ID,
  MURUGAN_ID,
  NEW_COMPANY_ID,
  OWNER_MEMBER_ID,
  PRIYA_MEMBER_ID,
  RAVI_MEMBER_ID,
  SENTHIL_ID,
  TEXTILES_ID,
  company as companyFixture,
  companyHandler,
  contact as contactFixture,
  type CompanyApiOptions,
} from "../../companies/_components/company-fixtures";

export { BALAJI_ID, KAVERI_ID, MARKETING_VISITS_API, SENTHIL_ID, TEXTILES_ID };
export { LAKSHMI_ID, OWNER_MEMBER_ID, PRIYA_MEMBER_ID, RAVI_MEMBER_ID };

/** The stories' clock: 12 Nov 2026, 12:00 pm in Asia/Kolkata. */
export const NOW = new Date("2026-11-12T06:30:00.000Z");

export const COMPLETED_ID = BALAJI_VISIT_ID;
export const PLANNED_ID = "0199d000-0000-7000-8000-000000000504";
export const MISSED_ID = "0199d000-0000-7000-8000-000000000502";
export const CANCELLED_ID = "0199d000-0000-7000-8000-000000000501";
export const TODAY_ID = "0199d000-0000-7000-8000-000000000505";
export const CHECKED_IN_ID = "0199d000-0000-7000-8000-000000000506";
export const NEW_VISIT_ID = "0199d000-0000-7000-8000-000000000599";

const OWNER = { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar" };
const RAVI = { id: RAVI_MEMBER_ID, name: "Ravi Shankar" };
const PRIYA = { id: PRIYA_MEMBER_ID, name: "Priya Raman" };

const BALAJI = {
  id: BALAJI_ID,
  name: "Sri Balaji Infra Projects",
  address: "14, Anna Salai, Guindy",
  city: "Chennai",
  canOpen: true,
};

const SENTHIL = {
  id: SENTHIL_ID,
  name: "Senthil Kumar",
  jobTitle: "Purchase Manager",
  mobile: "+919845012345",
};

const VISIT_PEOPLE: VisitFormOptions["people"] = [
  { ...OWNER, mobile: "+919840000001", isOwner: true, active: true },
  { ...PRIYA, mobile: "+919840000003", isOwner: false, active: true },
  { ...RAVI, mobile: "+919840000002", isOwner: false, active: true },
];

/** Karthik Raja, a Marketing Person no longer active. */
export const KARTHIK_MEMBER_ID = "5c0e7d1a-3b2f-4e6a-9d8c-7b6a5f4e3d2c";

export const VISIT_FORM_OPTIONS: VisitFormOptions = {
  people: VISIT_PEOPLE,
  allPeople: [
    ...VISIT_PEOPLE,
    {
      id: KARTHIK_MEMBER_ID,
      name: "Karthik Raja",
      mobile: "+919840000004",
      isOwner: false,
      active: false,
    },
  ],
  selfMemberId: OWNER_MEMBER_ID,
  mustIncludeSelf: false,
  companies: COMPANIES.map((company) => ({
    id: company.id,
    name: company.name,
    address: company.address,
    city: company.city,
  })).sort((a, b) => a.name.localeCompare(b.name)),
  canCreateCompany: true,
  canAddContacts: true,
  timeZone: "Asia/Kolkata",
};

const ALL_ACTIONS: Visit["actions"] = {
  canUpdate: true,
  canComplete: false,
  canCancel: false,
  canReschedule: false,
  canAddNote: true,
  canAddFiles: true,
  canCheckIn: false,
  canCheckOut: false,
  canDelete: true,
  locked: false,
};

const PLANNED_ACTIONS: Visit["actions"] = {
  ...ALL_ACTIONS,
  canComplete: true,
  canCancel: true,
  canReschedule: true,
};

/** MV-0003: completed on 10 Nov at 1:30 pm, with a note and its history. */
export function visit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: COMPLETED_ID,
    number: "MV-0003",
    prospectCompany: BALAJI,
    visitAt: "2026-11-10T08:00:00.000Z",
    status: "completed",
    purpose: "requirement_discussion",
    location: "Site office, Sriperumbudur",
    discussion:
      "They need a 40,000 sq ft PEB warehouse.\nFoundation drawings are ready.",
    outcome: "Asked for a quotation",
    interest: "hot",
    requirementWorkType: "peb",
    requirementValue: 25_000_000,
    requirementStartMonth: "2027-03",
    cancelReason: null,
    completedAt: "2026-11-10T09:00:00.000Z",
    visitors: [RAVI, PRIYA],
    contacts: [SENTHIL],
    notes: [
      {
        id: "0199d000-0000-7000-8000-000000000601",
        text: "Sent the PEB drawings they asked for.",
        at: "2026-11-11T06:30:00.000Z",
        byName: "Priya Raman",
      },
    ],
    history: [
      {
        id: "0199d000-0000-7000-8000-000000000704",
        action: "note_added",
        at: "2026-11-11T06:30:00.000Z",
        byName: "Priya Raman",
        from: null,
        to: null,
        reason: null,
        fileName: null,
      },
      {
        id: "0199d000-0000-7000-8000-000000000703",
        action: "completed",
        at: "2026-11-10T09:00:00.000Z",
        byName: "Ravi Shankar",
        from: null,
        to: null,
        reason: null,
        fileName: null,
      },
      {
        id: "0199d000-0000-7000-8000-000000000702",
        action: "rescheduled",
        at: "2026-11-07T05:00:00.000Z",
        byName: "Ravi Shankar",
        from: "2026-11-08T04:30:00.000Z",
        to: "2026-11-10T08:00:00.000Z",
        reason: null,
        fileName: null,
      },
      {
        id: "0199d000-0000-7000-8000-000000000701",
        action: "created",
        at: "2026-11-05T04:30:00.000Z",
        byName: "Ravi Shankar",
        from: null,
        to: null,
        reason: null,
        fileName: null,
      },
    ],
    checkIn: null,
    checkOut: null,
    files: [],
    createdByName: "Ravi Shankar",
    createdAt: "2026-11-05T04:30:00.000Z",
    updatedAt: "2026-11-11T06:30:00.000Z",
    timeZone: "Asia/Kolkata",
    actions: ALL_ACTIONS,
    ...overrides,
  };
}

let fileIds = 0;

/** A Visit's saved photo or PDF, uploaded by Ravi and his to change. */
export function visitFile(
  fileName: string,
  extra: Partial<VisitFile> = {},
): VisitFile {
  fileIds += 1;
  const pdf = fileName.endsWith(".pdf");
  return {
    id: `0199d000-0000-7000-8000-0000000e${String(fileIds).padStart(4, "0")}`,
    fileName,
    contentType: pdf ? "application/pdf" : "image/jpeg",
    bytes: pdf ? 2_400_000 : 420_000,
    viewable: true,
    hasThumbnail: !pdf,
    caption: null,
    createdByName: "Ravi Shankar",
    createdAt: "2026-11-10T09:05:00.000Z",
    canChange: true,
    ...extra,
  };
}

/** A visiting card and a site photo with captions, and a requirement sheet. */
export function visitFiles(): VisitFile[] {
  return [
    visitFile("card.jpg", { caption: "Senthil's visiting card" }),
    visitFile("site.jpg", { caption: "Plot for the PEB warehouse" }),
    visitFile("requirement.pdf", {
      createdByName: "Priya Raman",
      canChange: false,
    }),
  ];
}

const PLAN_HISTORY = (at: string, byName: string): Visit["history"] => [
  {
    id: "0199d000-0000-7000-8000-000000000711",
    action: "created",
    at,
    byName,
    from: null,
    to: null,
    reason: null,
    fileName: null,
  },
];

/** MV-0004: planned for 14 Nov at 11:30 am, nothing discussed yet. */
export function plannedVisit(overrides: Partial<Visit> = {}): Visit {
  return visit({
    id: PLANNED_ID,
    number: "MV-0004",
    visitAt: "2026-11-14T06:00:00.000Z",
    status: "planned",
    purpose: "quotation",
    location: "14, Anna Salai, Guindy",
    discussion: null,
    outcome: null,
    interest: null,
    requirementWorkType: null,
    requirementValue: null,
    requirementStartMonth: null,
    completedAt: null,
    visitors: [OWNER],
    contacts: [],
    notes: [],
    history: PLAN_HISTORY("2026-11-12T04:00:00.000Z", "Arun Selva Kumar"),
    createdByName: "Arun Selva Kumar",
    createdAt: "2026-11-12T04:00:00.000Z",
    updatedAt: "2026-11-12T04:00:00.000Z",
    actions: PLANNED_ACTIONS,
    ...overrides,
  });
}

/** MV-0002 on Kaveri Cement Works: planned for 8 Nov, never completed. */
export function missedVisit(overrides: Partial<Visit> = {}): Visit {
  return plannedVisit({
    id: MISSED_ID,
    number: "MV-0002",
    prospectCompany: {
      id: KAVERI_ID,
      name: "Kaveri Cement Works",
      address: "14, Anna Salai, Guindy",
      city: "Tiruchirappalli",
      canOpen: true,
    },
    visitAt: "2026-11-08T04:30:00.000Z",
    status: "missed",
    purpose: "introduction",
    visitors: [RAVI],
    contacts: [
      {
        id: MURUGAN_ID,
        name: "Murugan P",
        jobTitle: "Director",
        mobile: "+919443012345",
      },
    ],
    history: PLAN_HISTORY("2026-11-04T04:00:00.000Z", "Ravi Shankar"),
    createdByName: "Ravi Shankar",
    ...overrides,
  });
}

/** MV-0001 on Coimbatore Textiles, a colleague's company: cancelled. */
export function cancelledVisit(overrides: Partial<Visit> = {}): Visit {
  return plannedVisit({
    id: CANCELLED_ID,
    number: "MV-0001",
    prospectCompany: {
      id: TEXTILES_ID,
      name: "Coimbatore Textiles Ltd",
      address: null,
      city: "Coimbatore",
      canOpen: false,
    },
    visitAt: "2026-11-06T09:30:00.000Z",
    status: "cancelled",
    purpose: "cold_call",
    cancelReason: "Their MD is travelling this month",
    visitors: [PRIYA],
    history: [
      {
        id: "0199d000-0000-7000-8000-000000000722",
        action: "cancelled",
        at: "2026-11-05T10:00:00.000Z",
        byName: "Priya Raman",
        from: null,
        to: null,
        reason: "Their MD is travelling this month",
        fileName: null,
      },
      ...PLAN_HISTORY("2026-11-03T04:00:00.000Z", "Priya Raman"),
    ],
    createdByName: "Priya Raman",
    actions: { ...ALL_ACTIONS, canUpdate: false },
    ...overrides,
  });
}

/** MV-0006: planned for today, 12 Nov at 3:00 pm; the viewer may check in. */
export function todayVisit(overrides: Partial<Visit> = {}): Visit {
  return plannedVisit({
    id: TODAY_ID,
    number: "MV-0006",
    visitAt: "2026-11-12T09:30:00.000Z",
    actions: { ...PLANNED_ACTIONS, canCheckIn: true },
    ...overrides,
  });
}

/** Ravi's check-in at Kaveri's site at 11:50 am, within 12 m. */
export const RAVI_CHECK_IN: NonNullable<Visit["checkIn"]> = {
  at: "2026-11-12T06:20:00.000Z",
  byName: "Ravi Shankar",
  location: "recorded",
  position: { latitude: 10.7905, longitude: 78.7047, accuracy: 12 },
};

/** MV-0007 on Kaveri Cement Works today at 12:30 pm: Ravi checked in early. */
export function checkedInVisit(overrides: Partial<Visit> = {}): Visit {
  return missedVisit({
    id: CHECKED_IN_ID,
    number: "MV-0007",
    visitAt: "2026-11-12T07:00:00.000Z",
    status: "planned",
    // The stories' viewer is the Owner, so they went too: only a visitor
    // checks out.
    visitors: [RAVI, OWNER],
    checkIn: RAVI_CHECK_IN,
    history: [
      {
        id: "0199d000-0000-7000-8000-000000000731",
        action: "checked_in",
        at: RAVI_CHECK_IN.at,
        byName: "Ravi Shankar",
        from: null,
        to: null,
        reason: null,
        fileName: null,
      },
      ...PLAN_HISTORY("2026-11-10T04:00:00.000Z", "Ravi Shankar"),
    ],
    // Checked in: Complete it, not Reschedule (ADR CM-0040 §10).
    actions: { ...PLANNED_ACTIONS, canReschedule: false, canCheckOut: true },
    ...overrides,
  });
}

/** The calendar's Visits: the list's four and two today, one checked in. */
export const CALENDAR_VISITS: Visit[] = [
  plannedVisit(),
  todayVisit(),
  checkedInVisit(),
  visit(),
  missedVisit(),
  cancelledVisit(),
];

/** Newest first, as the list answers them. */
export const VISITS: Visit[] = [
  plannedVisit(),
  visit(),
  missedVisit(),
  cancelledVisit(),
];

export function toListItem(detail: Visit): VisitListItem {
  return {
    id: detail.id,
    number: detail.number,
    prospectCompany: {
      id: detail.prospectCompany.id,
      name: detail.prospectCompany.name,
      canOpen: detail.prospectCompany.canOpen,
    },
    visitAt: detail.visitAt,
    status: detail.status,
    purpose: detail.purpose,
    interest: detail.interest,
    outcome: detail.outcome,
    visitors: detail.visitors,
    contactNames: detail.contacts.map((contact) => contact.name),
    checkedIn: detail.checkIn != null,
  };
}

export type VisitApiOptions = {
  visits?: Visit[];
  formOptions?: Partial<VisitFormOptions>;
  /** Answers before the defaults (an error a story wants). */
  extra?: (call: ApiCall) => Response | undefined;
  /** The Prospect Company reads the form makes for Contacts. */
  companies?: CompanyApiOptions;
};

const SAVED_AT = "2026-11-12T06:31:00.000Z";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function text(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** An instant's calendar day in the Company time zone, as the server reads `from`/`to`. */
const kolkataDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A new Contact's id, the same on the Visit and on its company. */
const newContactId = (index: number) =>
  `0199d000-0000-7000-8000-00000000028${String(index)}`;

/** The Visit fields a write sends, as the answered Visit shows them. */
function written(body: Record<string, unknown>, base: Visit): Visit {
  const people = VISIT_FORM_OPTIONS.people;
  const visitorIds = (body["visitorIds"] as string[] | undefined) ?? [
    OWNER_MEMBER_ID,
  ];
  const known = [
    ...COMPANIES.flatMap((company) => company.contacts),
    ...base.contacts.map((contact) => ({ ...contact })),
  ];
  const contactIds = (body["contactIds"] as string[] | undefined) ?? [];
  const added = (
    (body["newContacts"] as
      { name: string; mobile: string | null }[] | undefined) ?? []
  ).map((row, index) => ({
    id: newContactId(index),
    name: row.name,
    jobTitle: null,
    mobile: row.mobile,
  }));
  return {
    ...base,
    visitAt: text(body, "visitAt") ?? base.visitAt,
    purpose: (body["purpose"] ?? null) as Visit["purpose"],
    location: text(body, "location") ?? base.prospectCompany.address,
    discussion: text(body, "discussion"),
    outcome: text(body, "outcome"),
    interest: (body["interest"] ?? null) as Visit["interest"],
    requirementWorkType: (body["requirementWorkType"] ??
      null) as Visit["requirementWorkType"],
    requirementValue: (body["requirementValue"] ?? null) as number | null,
    requirementStartMonth: text(body, "requirementStartMonth"),
    visitors: visitorIds
      .map(
        (id) =>
          people.find((person) => person.id === id) ?? { id, name: "Someone" },
      )
      .map(({ id, name }) => ({ id, name })),
    contacts: [
      ...contactIds.flatMap((id) => {
        const found = known.find((contact) => contact.id === id);
        return found == null
          ? []
          : [
              {
                id: found.id,
                name: found.name,
                jobTitle: found.jobTitle,
                mobile: found.mobile,
              },
            ];
      }),
      ...added,
    ],
    updatedAt: SAVED_AT,
  };
}

let entries = 80;

const historyEntry = (
  action: Visit["history"][number]["action"],
  extra: Partial<Visit["history"][number]> = {},
): Visit["history"][number] => ({
  id: `0199d000-0000-7000-8000-0000000007${String((entries = entries + 1))}`,
  action,
  at: SAVED_AT,
  byName: "Arun Selva Kumar",
  from: null,
  to: null,
  reason: null,
  fileName: null,
  ...extra,
});

/** Answers the Visit screens' reads and writes, and the company reads. */
export function visitHandler(
  options: VisitApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let visits = [...(options.visits ?? VISITS)];
  const formOptions = { ...VISIT_FORM_OPTIONS, ...options.formOptions };
  const companies = companyHandler(options.companies);
  const save = (next: Visit) => {
    visits = visits.map((item) => (item.id === next.id ? next : item));
    return json(next);
  };
  const started = new Map<string, number>();

  /** The Visit files routes: start, thumbnail, complete, caption, remove. */
  const fileCall = (
    id: string,
    rest: string | undefined,
    call: ApiCall,
    body: Record<string, unknown>,
  ): Response | undefined => {
    const found = visits.find((item) => item.id === id);
    if (found == null || call.method !== "POST") return undefined;
    const limit = () =>
      json(
        {
          code: "VISIT_FILE_LIMIT",
          message: `A Visit keeps up to ${String(VISIT_FILE_LIMIT)} photos and files. Remove one to add another.`,
        },
        409,
      );
    const base = visitFilesUrl(id);
    if (rest === "uploads") {
      if (found.files.length >= VISIT_FILE_LIMIT) return limit();
      const key = `companies/w1/marketing_visit/${id}/${String(started.size + 1)}.bin`;
      started.set(key, Number(body["bytes"]));
      const encoded = encodeURIComponent(key);
      return json(
        {
          key,
          fileName: String(body["fileName"]),
          upload: { via: "app", url: `${base}/uploads/app?key=${encoded}` },
          thumbnailUrl: `${base}/uploads/thumbnail?key=${encoded}`,
        },
        201,
      );
    }
    if (rest === "uploads/thumbnail")
      return new Response(null, { status: 204 });
    if (rest == null) {
      if (found.files.length >= VISIT_FILE_LIMIT) return limit();
      const fileName = String(body["fileName"]);
      const added = visitFile(fileName, {
        bytes: started.get(String(body["key"])) ?? 0,
        createdByName: "Arun Selva Kumar",
        createdAt: SAVED_AT,
      });
      save({
        ...found,
        files: [...found.files, added],
        history: [historyEntry("file_added", { fileName }), ...found.history],
      });
      return json(added, 201);
    }
    const [fileId, action] = rest.split("/");
    const file = found.files.find((item) => item.id === fileId);
    if (file == null)
      return json(
        { code: "VISIT_FILE_NOT_FOUND", message: "This file was not found." },
        404,
      );
    if (action === "update") {
      const caption = body["caption"];
      const next = {
        ...file,
        caption: typeof caption === "string" && caption !== "" ? caption : null,
      };
      save({
        ...found,
        files: found.files.map((item) => (item.id === file.id ? next : item)),
      });
      return json(next);
    }
    if (action === "delete") {
      save({
        ...found,
        files: found.files.filter((item) => item.id !== file.id),
        history: [
          historyEntry("file_removed", { fileName: file.fileName }),
          ...found.history,
        ],
      });
      return new Response(null, { status: 204 });
    }
    return undefined;
  };

  return (call) => {
    const extra = options.extra?.(call);
    if (extra != null) return extra;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    const body = (call.body ?? {}) as Record<string, unknown>;

    if (!path.startsWith(MARKETING_VISITS_API)) return companies(call);

    if (
      call.method === "GET" &&
      path === `${MARKETING_VISITS_API}/form-options`
    )
      return json(formOptions);

    if (call.method === "GET" && path === MARKETING_VISITS_API) {
      const list = (key: string) => url.searchParams.get(key)?.split(",");
      const statuses = list("status");
      const purposes = list("purpose");
      const interests = list("interest");
      const member = url.searchParams.get("memberId");
      const company = url.searchParams.get("prospectCompanyId");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const day = (at: string) => kolkataDay.format(new Date(at));
      const matching = visits.filter(
        (item) =>
          (statuses == null || statuses.includes(item.status)) &&
          (purposes == null ||
            (item.purpose != null && purposes.includes(item.purpose))) &&
          (interests == null ||
            (item.interest != null && interests.includes(item.interest))) &&
          (member == null ||
            item.visitors.some((person) => person.id === member)) &&
          (company == null || item.prospectCompany.id === company) &&
          (from == null || day(item.visitAt) >= from) &&
          (to == null || day(item.visitAt) <= to),
      );
      return json({
        items: matching.map(toListItem),
        nextCursor: null,
        total: matching.length,
        timeZone: "Asia/Kolkata",
      } satisfies VisitPage);
    }

    if (call.method === "POST" && path === MARKETING_VISITS_API) {
      const fresh = body["newProspectCompany"] as
        Record<string, unknown> | undefined;
      const known = COMPANIES.find(
        (item) => item.id === body["prospectCompanyId"],
      );
      const company =
        fresh == null
          ? {
              id: known?.id ?? BALAJI_ID,
              name: known?.name ?? "Unknown",
              address: known?.address ?? null,
              city: known?.city ?? null,
              canOpen: true,
            }
          : {
              id: NEW_COMPANY_ID,
              name: String(fresh["name"]),
              address: null,
              city: text(fresh, "city"),
              canOpen: true,
            };
      const completed = body["status"] === "completed";
      // The new company joins the company mock, so its page opens.
      if (fresh != null) {
        const rows =
          (body["newContacts"] as
            | {
                name: string;
                jobTitle?: string | null;
                mobile: string | null;
              }[]
            | undefined) ?? [];
        companies.add(
          companyFixture({
            id: NEW_COMPANY_ID,
            name: company.name,
            industry: null,
            address: null,
            city: company.city,
            stateCode: null,
            pin: null,
            phone: text(fresh, "phone"),
            email: null,
            website: null,
            gstin: null,
            source: null,
            remarks: null,
            assignedTo: OWNER,
            stage: completed ? "contacted" : "new",
            createdAt: SAVED_AT,
            updatedAt: SAVED_AT,
            contacts: rows.map((row, index) =>
              contactFixture({
                id: newContactId(index),
                name: row.name,
                jobTitle: row.jobTitle ?? null,
                mobile: row.mobile,
                email: null,
                remarks: null,
                isPrimary: index === 0,
                updatedAt: SAVED_AT,
              }),
            ),
            timeline: [],
          }),
        );
      }
      const created = written(
        body,
        plannedVisit({
          id: NEW_VISIT_ID,
          number: "MV-0005",
          prospectCompany: company,
          status: completed ? "completed" : "planned",
          contacts: [],
          history: PLAN_HISTORY(SAVED_AT, "Arun Selva Kumar"),
          createdByName: "Arun Selva Kumar",
          actions: completed ? ALL_ACTIONS : PLANNED_ACTIONS,
        }),
      );
      visits = [created, ...visits];
      return json(created, 201);
    }

    const files =
      /^\/api\/construction\/marketing\/visits\/([^/]+)\/files(?:\/(.+))?$/.exec(
        path,
      );
    if (files != null) return fileCall(files[1] ?? "", files[2], call, body);

    const match =
      /^\/api\/construction\/marketing\/visits\/([^/]+)(?:\/(update|complete|reschedule|cancel|notes|delete|check-in|check-out))?$/.exec(
        path,
      );
    if (match == null) return undefined;
    const [, id, action] = match;
    const found = visits.find((item) => item.id === id);
    if (found == null)
      return json(
        { code: "VISIT_NOT_FOUND", message: "This Visit was not found." },
        404,
      );
    if (call.method === "GET" && action == null) return json(found);
    if (call.method !== "POST") return undefined;

    switch (action) {
      case "update":
        return save({
          ...written(body, found),
          history: [historyEntry("updated"), ...found.history],
        });
      case "complete":
        return save({
          ...written(body, found),
          status: "completed",
          completedAt: SAVED_AT,
          actions: ALL_ACTIONS,
          history: [historyEntry("completed"), ...found.history],
        });
      case "reschedule":
        if (found.checkIn != null)
          return json(
            {
              code: "VISIT_CHECKED_IN",
              message: "This Visit is checked in. Complete it instead.",
            },
            409,
          );
        return save({
          ...found,
          visitAt: String(body["visitAt"]),
          status: "planned",
          updatedAt: SAVED_AT,
          history: [
            historyEntry("rescheduled", {
              from: found.visitAt,
              to: String(body["visitAt"]),
            }),
            ...found.history,
          ],
        });
      case "cancel":
        return save({
          ...found,
          status: "cancelled",
          cancelReason: String(body["reason"]),
          updatedAt: SAVED_AT,
          actions: { ...ALL_ACTIONS, canUpdate: false },
          history: [
            historyEntry("cancelled", { reason: String(body["reason"]) }),
            ...found.history,
          ],
        });
      case "notes": {
        const added = {
          id: "0199d000-0000-7000-8000-000000000699",
          text: String(body["text"]),
          at: SAVED_AT,
          byName: "Arun Selva Kumar",
        };
        const next = {
          ...found,
          notes: [added, ...found.notes],
          history: [historyEntry("note_added"), ...found.history],
        };
        visits = visits.map((item) => (item.id === next.id ? next : item));
        return json(next, 201);
      }
      case "check-in":
      case "check-out": {
        const checkIn = action === "check-in";
        if (!(checkIn ? found.actions.canCheckIn : found.actions.canCheckOut))
          return json(
            checkIn
              ? {
                  code: "VISIT_CHECKED_IN",
                  message: "This Visit is already checked in.",
                }
              : {
                  code: "VISIT_NOT_CHECKED_IN",
                  message: "Check in to this Visit first.",
                },
            409,
          );
        const position = (body["position"] ?? null) as NonNullable<
          Visit["checkIn"]
        >["position"];
        const check: NonNullable<Visit["checkIn"]> = {
          at: SAVED_AT,
          byName: "Arun Selva Kumar",
          location:
            position == null
              ? body["location"] === "refused"
                ? "refused"
                : "unavailable"
              : "recorded",
          position,
        };
        return save({
          ...found,
          ...(checkIn ? { checkIn: check } : { checkOut: check }),
          actions: {
            ...found.actions,
            canCheckIn: false,
            canCheckOut: checkIn,
            canReschedule: checkIn ? false : found.actions.canReschedule,
          },
          history: [
            historyEntry(checkIn ? "checked_in" : "checked_out"),
            ...found.history,
          ],
        });
      }
      case "delete":
        visits = visits.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}

export function mockVisitApi(options: VisitApiOptions = {}) {
  return mockApi(visitHandler(options));
}
