import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import { mockSalesDocumentApi } from "@/components/sales/documents/sales-document-fixtures";
import type { SalesAccess } from "@/src/queries/sales-access";
import type { SalesDocumentFile } from "@/src/queries/sales-documents";
import type {
  FollowUp,
  Inquiry,
  InquiryActivity,
  InquiryDetail,
  InquiryFormOptions,
  InquiryPage,
  InquiryTask,
} from "@/src/queries/sales-inquiries";
import type { Flag } from "@/src/shared-kernel/access";

/** Story fixtures for Inquiries (CM-1003, CM-1004). */

export const INQUIRIES_API = "/api/construction/sales/inquiries";
export const INQUIRY_PROJECT_ID = "0199c4a0-0000-7000-8000-000000510000";
export const INQUIRY_TODAY = "2026-10-14";

export const OWNER_MEMBER_ID = "0199c4a0-0000-7000-8000-000000520001";
export const KARTHIK_MEMBER_ID = "0199c4a0-0000-7000-8000-000000520002";
export const WING_ID = "0199c4a0-0000-7000-8000-000000530001";
export const STAGE_IDS = {
  new: "0199c4a0-0000-7000-8000-000000540001",
  contacted: "0199c4a0-0000-7000-8000-000000540002",
  siteVisit: "0199c4a0-0000-7000-8000-000000540003",
  negotiation: "0199c4a0-0000-7000-8000-000000540004",
} as const;
export const SOURCE_IDS = {
  walkIn: "0199c4a0-0000-7000-8000-000000550001",
  referral: "0199c4a0-0000-7000-8000-000000550002",
} as const;

export const LAKSHMI_ID = "0199c4a0-0000-7000-8000-000000510001";
export const RAVI_ID = "0199c4a0-0000-7000-8000-000000510002";
export const MEENA_ID = "0199c4a0-0000-7000-8000-000000510003";
export const DEEPAK_ID = "0199c4a0-0000-7000-8000-000000510004";
const NEW_ID = "0199c4a0-0000-7000-8000-000000510009";

const OWNER = { userId: "user-owner", name: "Arun Selva Kumar" };

export const INQUIRY_FORM_OPTIONS: InquiryFormOptions = {
  members: [
    { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar", isOwner: true },
    { id: KARTHIK_MEMBER_ID, name: "Karthik R", isOwner: false },
  ],
  wings: [{ id: WING_ID, name: "A Wing" }],
  funnelStages: [
    { id: STAGE_IDS.new, name: "New" },
    { id: STAGE_IDS.contacted, name: "Contacted" },
    { id: STAGE_IDS.siteVisit, name: "Site Visit" },
    { id: STAGE_IDS.negotiation, name: "Negotiation" },
  ],
  leadSources: [
    { id: SOURCE_IDS.walkIn, name: "Walk-in" },
    { id: SOURCE_IDS.referral, name: "Referral" },
  ],
  lostReasons: [{ id: "0199c4a0-0000-7000-8000-000000560001", name: "Budget" }],
  viewerMemberId: OWNER_MEMBER_ID,
};

const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "print",
  "notification",
  "view_all",
  "report",
];

/** The viewer's flags on Inquiry (every flag unless given). */
export function inquiryAccess(flags: Flag[] = ALL_FLAGS): SalesAccess {
  return {
    projectId: INQUIRY_PROJECT_ID,
    structure: "wings",
    menus: { "sales.inquiries": flags, "sales.bookings": [] },
  };
}

const ACTIONS = {
  edit: true,
  delete: true,
  followUp: true,
  manageTasks: true,
  close: true,
  convert: true,
  reopen: false,
};

export function inquiry(extra: Partial<InquiryDetail> = {}): InquiryDetail {
  return {
    id: LAKSHMI_ID,
    projectId: INQUIRY_PROJECT_ID,
    inquiryDate: "2026-10-12",
    name: "Lakshmi Narayanan",
    mobile: "+919845012345",
    email: "lakshmi@example.com",
    address: "12, Gandhi Road, Coimbatore",
    occupation: "Teacher",
    interestType: "hot",
    interestedWing: { id: WING_ID, name: "A Wing" },
    interestedUnitType: "2BHK",
    leadSource: { id: SOURCE_IDS.walkIn, name: "Walk-in" },
    funnelStage: { id: STAGE_IDS.siteVisit, name: "Site Visit" },
    status: "open",
    nextFollowUp: { date: "2026-10-13", time: null },
    due: "overdue",
    assignee: { id: KARTHIK_MEMBER_ID, name: "Karthik R" },
    leadOwner: { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar" },
    remarks: "Wants east facing, near the lift.",
    convertedUnitId: null,
    convertedBookingId: null,
    convertedUnit: null,
    lostReason: null,
    lostRemarks: null,
    closedAt: null,
    createdBy: OWNER,
    createdAt: "2026-10-12T05:30:00.000Z",
    updatedAt: "2026-10-12T05:30:00.000Z",
    actions: ACTIONS,
    history: [
      {
        id: "0199c4a0-0000-7000-8000-000000570001",
        type: "created",
        details: { stageId: STAGE_IDS.new },
        names: { stageId: "New" },
        by: OWNER,
        at: "2026-10-12T05:30:00.000Z",
      },
      {
        id: "0199c4a0-0000-7000-8000-000000570002",
        type: "assigned",
        details: {
          fromMemberId: OWNER_MEMBER_ID,
          toMemberId: KARTHIK_MEMBER_ID,
        },
        names: { fromMemberId: "Arun Selva Kumar", toMemberId: "Karthik R" },
        by: OWNER,
        at: "2026-10-12T06:00:00.000Z",
      },
      {
        id: "0199c4a0-0000-7000-8000-000000570003",
        type: "stage_moved",
        details: { fromStageId: STAGE_IDS.new, toStageId: STAGE_IDS.siteVisit },
        names: { fromStageId: "New", toStageId: "Site Visit" },
        by: OWNER,
        at: "2026-10-13T06:00:00.000Z",
      },
    ],
    ...extra,
  };
}

export const INQUIRIES: InquiryDetail[] = [
  inquiry(),
  inquiry({
    id: RAVI_ID,
    name: "Ravi Kumar",
    mobile: "+919790012345",
    email: null,
    interestType: "warm",
    interestedWing: null,
    interestedUnitType: "3BHK",
    funnelStage: { id: STAGE_IDS.contacted, name: "Contacted" },
    nextFollowUp: { date: INQUIRY_TODAY, time: "16:30" },
    due: "today",
    assignee: { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar" },
  }),
  inquiry({
    id: MEENA_ID,
    name: "Meena Sundaram",
    mobile: null,
    email: "meena@example.com",
    interestType: "cold",
    funnelStage: { id: STAGE_IDS.new, name: "New" },
    nextFollowUp: null,
    due: "none",
  }),
  inquiry({
    id: DEEPAK_ID,
    name: "Deepak Raj",
    interestType: null,
    status: "lost",
    nextFollowUp: null,
    due: null,
    lostReason: { id: "0199c4a0-0000-7000-8000-000000560001", name: "Budget" },
    actions: {
      ...ACTIONS,
      followUp: false,
      close: false,
      convert: false,
      reopen: true,
    },
  }),
];

export function followUp(extra: Partial<FollowUp> = {}): FollowUp {
  return {
    id: "0199c4a0-0000-7000-8000-000000580001",
    inquiryId: LAKSHMI_ID,
    activity: "call",
    doneAt: "2026-10-13T06:00:00.000Z",
    doneOn: { date: "2026-10-13", time: "11:30" },
    remarks: "Wants to see the 2BHK sample flat on Saturday.",
    fromStage: { id: STAGE_IDS.contacted, name: "Contacted" },
    toStage: { id: STAGE_IDS.siteVisit, name: "Site Visit" },
    nextFollowUp: { date: "2026-10-13", time: null },
    by: { userId: "user-karthik", name: "Karthik R" },
    createdAt: "2026-10-13T06:00:00.000Z",
    canDelete: true,
    ...extra,
  };
}

export function inquiryTask(extra: Partial<InquiryTask> = {}): InquiryTask {
  return {
    id: "0199c4a0-0000-7000-8000-000000590001",
    inquiryId: LAKSHMI_ID,
    title: "Send the brochure on WhatsApp",
    dueDate: "2026-10-13",
    assignee: { id: KARTHIK_MEMBER_ID, name: "Karthik R" },
    status: "open",
    doneAt: null,
    doneBy: null,
    createdBy: OWNER,
    createdAt: "2026-10-12T06:00:00.000Z",
    updatedAt: "2026-10-12T06:00:00.000Z",
    ...extra,
  };
}

export const INQUIRY_TASKS: InquiryTask[] = [
  inquiryTask(),
  inquiryTask({
    id: "0199c4a0-0000-7000-8000-000000590002",
    title: "Share the price list",
    dueDate: null,
    assignee: null,
  }),
  inquiryTask({
    id: "0199c4a0-0000-7000-8000-000000590003",
    title: "Call back after the site visit",
    status: "done",
    doneAt: "2026-10-13T08:00:00.000Z",
    doneBy: OWNER,
  }),
];

/**
 * Follow-ups and tasks for every inquiry of a story (CM-1004): adding a
 * follow-up puts it on top of the timeline; tasks are added, ticked,
 * edited and deleted in memory.
 */
function activityHandler(options: {
  followUps?: FollowUp[];
  tasks?: InquiryTask[];
  canManageTasks?: boolean;
  history: () => InquiryDetail["history"];
}): (call: ApiCall) => Response | undefined {
  let followUps = [...(options.followUps ?? [followUp()])];
  let tasks = [...(options.tasks ?? INQUIRY_TASKS)];
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    const match =
      /^\/api\/construction\/sales\/inquiries\/([^/]+)\/(activity|follow-ups|tasks)(?:\/([^/]+)(?:\/([a-z]+))?)?$/.exec(
        path,
      );
    if (match == null) return undefined;
    const [, id = "", area, sub, action] = match;
    if (area === "activity" && call.method === "GET") {
      const items: InquiryActivity["items"] = [
        ...followUps.map((item) => ({
          kind: "follow_up" as const,
          at: item.doneAt,
          followUp: item,
        })),
        ...options.history().map((event) => ({
          kind: "event" as const,
          at: event.at,
          event,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      return Response.json({ items } satisfies InquiryActivity);
    }
    if (area === "follow-ups" && call.method === "POST") {
      if (sub != null) {
        followUps = followUps.filter((item) => item.id !== sub);
        return new Response(null, { status: 204 });
      }
      const body = call.body as {
        activity: FollowUp["activity"];
        doneOnDate: string;
        doneOnTime: string;
        remarks: string | null;
        nextFollowUpDate: string | null;
        nextFollowUpTime: string | null;
      };
      const added = followUp({
        id: `0199c4a0-0000-7000-8000-0000005800${String(followUps.length + 10)}`,
        activity: body.activity,
        doneAt: new Date().toISOString(),
        doneOn: { date: body.doneOnDate, time: body.doneOnTime },
        remarks: body.remarks,
        fromStage: null,
        toStage: null,
        nextFollowUp:
          body.nextFollowUpDate == null
            ? null
            : { date: body.nextFollowUpDate, time: body.nextFollowUpTime },
        by: OWNER,
      });
      followUps = [added, ...followUps];
      return Response.json(inquiry({ id }), { status: 201 });
    }
    if (area === "tasks") {
      if (call.method === "GET" && sub == null)
        return Response.json({
          items: tasks,
          canManage: options.canManageTasks ?? true,
        });
      if (call.method !== "POST") return undefined;
      const body = (call.body ?? {}) as Partial<InquiryTask> & {
        assigneeMemberId?: string | null;
      };
      if (sub == null) {
        const added = inquiryTask({
          id: `0199c4a0-0000-7000-8000-0000005900${String(tasks.length + 10)}`,
          title: body.title ?? "",
          dueDate: body.dueDate ?? null,
          assignee:
            body.assigneeMemberId == null
              ? null
              : { id: body.assigneeMemberId, name: "Karthik R" },
        });
        tasks = [added, ...tasks];
        return Response.json(added, { status: 201 });
      }
      const found = tasks.find((task) => task.id === sub);
      if (found == null) return undefined;
      const save = (next: InquiryTask) => {
        tasks = tasks.map((task) => (task.id === next.id ? next : task));
        return Response.json(next);
      };
      switch (action) {
        case "done":
          return save({
            ...found,
            status: "done",
            doneAt: new Date().toISOString(),
            doneBy: OWNER,
          });
        case "reopen":
          return save({ ...found, status: "open", doneAt: null, doneBy: null });
        case "update":
          return save({
            ...found,
            title: body.title ?? found.title,
            dueDate: body.dueDate ?? null,
          });
        case "delete":
          tasks = tasks.filter((task) => task.id !== sub);
          return new Response(null, { status: 204 });
        default:
          return undefined;
      }
    }
    return undefined;
  };
}

export type InquiryApiOptions = {
  inquiries?: InquiryDetail[];
  flags?: Flag[];
  files?: SalesDocumentFile[];
  /** Mobiles a new or edited inquiry may not reuse (409 INQUIRY_DUPLICATE). */
  takenMobiles?: string[];
  /** Refuse delete with this error. */
  deleteError?: { status: number; code: string; message: string };
  /** Extra handlers tried first. */
  extra?: (call: ApiCall) => Response | undefined;
  followUps?: FollowUp[];
  tasks?: InquiryTask[];
  canManageTasks?: boolean;
  /** Refuse convert / lose / reopen with this error (CM-1007). */
  closeError?: { status: number; code: string; message: string };
  /** The import's answer: a count, or row errors. */
  importErrors?: { row: number; field: string; message: string }[];
};

export const BOOKABLE_UNIT_IDS = {
  a101: "0199c4a0-0000-7000-8000-0000005c0001",
  a102: "0199c4a0-0000-7000-8000-0000005c0002",
  b201: "0199c4a0-0000-7000-8000-0000005c0003",
} as const;

export const CONVERTED_BOOKING_ID = "0199c4a0-0000-7000-8000-0000005d0001";

/** The bookings' unit picker for the Converted dialog. */
export const BOOKABLE_UNITS = {
  wings: [
    {
      id: WING_ID,
      name: "A Wing",
      units: [
        { id: BOOKABLE_UNIT_IDS.a101, name: "101", floorName: "Floor 1" },
        { id: BOOKABLE_UNIT_IDS.a102, name: "102", floorName: "Floor 1" },
      ],
    },
    {
      id: "0199c4a0-0000-7000-8000-000000530002",
      name: "B Wing",
      units: [
        { id: BOOKABLE_UNIT_IDS.b201, name: "201", floorName: "Floor 2" },
      ],
    },
  ],
};

const toItem = (detail: InquiryDetail): Inquiry => {
  const { history: _history, ...item } = detail;
  return item;
};

/** "98450 12345" → "+919845012345", as the server stores it. */
function normalised(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

/** Answers the inquiry screens' reads and writes for one story. */
export function inquiryHandler(
  options: InquiryApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let inquiries = [...(options.inquiries ?? INQUIRIES)];
  const documents = mockSalesDocumentApi({ files: options.files ?? [] });
  const activity = activityHandler({
    ...(options.followUps == null ? {} : { followUps: options.followUps }),
    ...(options.tasks == null ? {} : { tasks: options.tasks }),
    ...(options.canManageTasks == null
      ? {}
      : { canManageTasks: options.canManageTasks }),
    history: () => inquiries[0]?.history ?? [],
  });
  const duplicate = (body: Record<string, unknown>) => {
    if (body["allowDuplicate"] === true) return null;
    const mobile = normalised(body["mobile"]);
    if (mobile == null || !(options.takenMobiles ?? []).includes(mobile))
      return null;
    return Response.json(
      {
        code: "INQUIRY_DUPLICATE",
        message:
          "Another inquiry of this Project has the same mobile or email.",
        details: {
          matches: [
            { id: LAKSHMI_ID, name: "Lakshmi Narayanan", status: "open" },
            { id: DEEPAK_ID, name: null, status: "lost" },
          ],
        },
      },
      { status: 409 },
    );
  };
  return (call) => {
    const extra = options.extra?.(call);
    if (extra != null) return extra;
    const files = documents(call) ?? activity(call);
    if (files != null) return files;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (path === "/api/construction/sales/access")
      return Response.json(inquiryAccess(options.flags));
    if (call.method === "GET" && path === `${INQUIRIES_API}/form-options`)
      return Response.json(INQUIRY_FORM_OPTIONS);
    if (
      call.method === "GET" &&
      path === "/api/construction/sales/bookings/form-options"
    )
      return Response.json(BOOKABLE_UNITS);
    if (call.method === "POST" && path === `${INQUIRIES_API}/import`) {
      const errors = options.importErrors;
      if (errors != null)
        return Response.json(
          {
            code: "IMPORT_HAS_ERRORS",
            message: `The sheet has ${String(errors.length)} problems. Fix them and upload it again; nothing was saved.`,
            details: { errors },
          },
          { status: 400 },
        );
      return Response.json({ imported: 12 });
    }
    if (call.method === "GET" && path === INQUIRIES_API) {
      const statuses = url.searchParams.get("status")?.split(",");
      const due = url.searchParams.get("due");
      const interest = url.searchParams.get("interestType")?.split(",");
      const search = url.searchParams.get("search")?.toLowerCase();
      const items = inquiries
        .filter(
          (item) =>
            (statuses == null || statuses.includes(item.status)) &&
            (due == null || item.due === due) &&
            (interest == null ||
              (item.interestType != null &&
                interest.includes(item.interestType))) &&
            (search == null || item.name.toLowerCase().includes(search)),
        )
        .map(toItem);
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies InquiryPage);
    }
    if (call.method === "POST" && path === INQUIRIES_API) {
      const body = (call.body ?? {}) as Record<string, unknown>;
      const refused = duplicate(body);
      if (refused != null) return refused;
      const created = inquiry({
        id: NEW_ID,
        name: typeof body["name"] === "string" ? body["name"] : "",
        mobile: normalised(body["mobile"]),
        history: [],
      });
      inquiries = [created, ...inquiries];
      return Response.json(created, { status: 201 });
    }
    const item =
      /^\/api\/construction\/sales\/inquiries\/([^/]+)(?:\/([a-z]+))?$/.exec(
        path,
      );
    if (item == null) return undefined;
    const [, id, action] = item;
    const found = inquiries.find((entry) => entry.id === id);
    if (found == null) return undefined;
    if (call.method === "GET" && action == null) return Response.json(found);
    if (call.method === "POST" && action === "update") {
      const body = (call.body ?? {}) as Record<string, unknown>;
      const refused =
        normalised(body["mobile"]) === found.mobile ? null : duplicate(body);
      if (refused != null) return refused;
      const next = {
        ...found,
        name: typeof body["name"] === "string" ? body["name"] : found.name,
      };
      inquiries = inquiries.map((entry) => (entry.id === id ? next : entry));
      return Response.json(next);
    }
    if (
      call.method === "POST" &&
      (action === "convert" || action === "lose" || action === "reopen")
    ) {
      const error = options.closeError;
      if (error != null)
        return Response.json(
          { code: error.code, message: error.message },
          { status: error.status },
        );
      const body = (call.body ?? {}) as { unitId?: string };
      const closed: InquiryDetail =
        action === "reopen"
          ? {
              ...found,
              status: "open",
              convertedBookingId: null,
              convertedUnitId: null,
              convertedUnit: null,
              lostReason: null,
              actions: { ...ACTIONS },
            }
          : {
              ...found,
              status: action === "convert" ? "converted" : "lost",
              due: null,
              convertedUnitId:
                action === "convert" ? (body.unitId ?? null) : null,
              convertedBookingId:
                action === "convert" ? CONVERTED_BOOKING_ID : null,
              convertedUnit:
                action === "convert"
                  ? { id: body.unitId ?? "", name: "A Wing 101" }
                  : null,
              actions: {
                ...ACTIONS,
                followUp: false,
                close: false,
                convert: false,
                reopen: true,
              },
            };
      inquiries = inquiries.map((entry) => (entry.id === id ? closed : entry));
      return Response.json(closed);
    }
    if (call.method === "POST" && action === "delete") {
      const error = options.deleteError;
      if (error != null)
        return Response.json(
          { code: error.code, message: error.message },
          { status: error.status },
        );
      inquiries = inquiries.filter((entry) => entry.id !== id);
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
}

export function mockInquiryApi(options: InquiryApiOptions = {}) {
  return mockApi(inquiryHandler(options));
}
