import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import { addDays } from "@/lib/calendar-dates";
import type {
  DemoResponse,
  DemoSlotsResponse,
  EnquiryDetailResponse,
  EnquiryListResponse,
  EnquiryOptionsResponse,
  EnquiryResponse,
  PhoneMatchesResponse,
} from "@/src/queries/enquiries";
import { signInAs } from "../../.storybook/mocks/auth";

import { EnquiriesScreen } from "./enquiries-screen";
import { EnquiryCreateScreen } from "./enquiry-create-screen";
import { EnquiryDetailScreen } from "./enquiry-detail-screen";
import { EnquiryEditScreen } from "./enquiry-edit-screen";
import { todayInKolkata } from "./enquiry-format";

/* ------------------------------------------------------------------ */
/* API mock: answers /app/api/training-institute/* from story routes   */
/* ------------------------------------------------------------------ */

type Reply = { status?: number; json: unknown };
type Route = (request: { url: URL; body: unknown }) => Reply;
type Call = { route: string; url: URL; body: unknown };

const calls: Call[] = [];

function callsTo(route: string): Call[] {
  return calls.filter((call) => call.route === route);
}

function mockApi(routes: Record<string, Route>) {
  calls.length = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    const path = url.pathname.replace(/^.*\/api\/training-institute/, "");
    const route = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const handler = routes[route];
    if (handler == null) return original(input, init);
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ route, url, body });
    const reply = handler({ url, body });
    return Promise.resolve(
      new Response(JSON.stringify(reply.json), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** Each story gets its own cache, so stories never see each other's data. */
const withFreshQueryClient: Decorator = (Story) => {
  function Fresh() {
    const [client] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: 60_000 },
            mutations: { retry: false },
          },
        }),
    );
    return (
      <QueryClientProvider client={client}>
        <QuerySuspense>
          <Story />
        </QuerySuspense>
      </QueryClientProvider>
    );
  }
  return <Fresh />;
};

/* ---------------------------- fixtures ---------------------------- */

const today = todayInKolkata();
const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

const ENQUIRY_ID = "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10";
const STUDENT_ID = "880e8400-e29b-41d4-a716-446655440000";
const DCA = "770e8400-e29b-41d4-a716-446655440000";
const TALLY = "770e8400-e29b-41d4-a716-446655440001";
const DCA_WEEKDAY = "660e8400-e29b-41d4-a716-446655440001";
const TALLY_WEEKEND = "660e8400-e29b-41d4-a716-446655440003";
const MEENA = "990e8400-e29b-41d4-a716-446655440000";
const WALK_IN = "aa1e8400-e29b-41d4-a716-446655440001";
const REFERRAL = "aa1e8400-e29b-41d4-a716-446655440002";
const NEWSPAPER = "aa1e8400-e29b-41d4-a716-446655440003";

const options: EnquiryOptionsResponse = {
  courses: [
    { id: DCA, name: "DCA" },
    { id: TALLY, name: "Tally" },
  ],
  batches: [
    {
      id: DCA_WEEKDAY,
      name: "DCA Weekday 9–11",
      courseId: DCA,
      courseName: "DCA",
      classMode: "offline",
      timezone: "Asia/Kolkata",
      capacity: 20,
      enrolled: 14,
    },
    {
      id: TALLY_WEEKEND,
      name: "Tally Weekend",
      courseId: TALLY,
      courseName: "Tally",
      classMode: "hybrid",
      timezone: "Asia/Kolkata",
      capacity: 15,
      enrolled: 6,
    },
  ],
  teachers: [{ id: MEENA, name: "Meena Iyer" }],
  sources: [
    { id: WALK_IN, name: "Walk-in", retired: false },
    { id: REFERRAL, name: "Referral", retired: false },
    { id: NEWSPAPER, name: "Newspaper ad", retired: true },
  ],
  currentTeacherId: null,
};

function enquiry(overrides: Partial<EnquiryResponse> = {}): EnquiryResponse {
  return {
    id: ENQUIRY_ID,
    prospectName: "Priya Sharma",
    phone: "+91 98765 43210",
    email: null,
    guardianName: "Ramesh Sharma",
    guardianPhone: "+91 98765 00000",
    courseId: DCA,
    courseName: "DCA",
    subject: null,
    preferredClassMode: "offline",
    preferredTiming: "Weekday mornings",
    source: { id: WALK_IN, name: "Walk-in", retired: false },
    notes: "Finished Class 12. Wants a job-ready computer course.",
    stage: "new",
    nextFollowUpOn: null,
    followUpDue: false,
    notInterestedReason: null,
    convertedStudentId: null,
    convertedEnrollmentId: null,
    convertedAt: null,
    createdByUserId: "user_owner",
    createdAt: at(addDays(today, -6)),
    updatedAt: at(addDays(today, -6)),
    ...overrides,
  };
}

function detail(
  overrides: Partial<EnquiryDetailResponse> = {},
): EnquiryDetailResponse {
  return {
    ...enquiry(overrides),
    history: [
      {
        id: "act-created",
        kind: "created",
        note: null,
        nextFollowUpOn: null,
        createdByUserId: "user_owner",
        createdAt: at(addDays(today, -6)),
      },
    ],
    demos: [],
    ...overrides,
  };
}

function demo(overrides: Partial<DemoResponse> = {}): DemoResponse {
  return {
    id: "bb0e8400-e29b-41d4-a716-446655440001",
    enquiryId: ENQUIRY_ID,
    prospectName: "Priya Sharma",
    enquiryInterest: "DCA",
    kind: "batch",
    batchId: DCA_WEEKDAY,
    batchName: "DCA Weekday 9–11",
    courseName: "DCA",
    teacherId: null,
    teacherName: null,
    date: addDays(today, 2),
    startTime: "09:00",
    endTime: "11:00",
    timezone: "Asia/Kolkata",
    feeKind: "free",
    feeAmountPaise: null,
    feePaidAt: null,
    attendance: "unmarked",
    attendanceMarkedAt: null,
    cancelledAt: null,
    createdByUserId: "user_owner",
    createdAt: at(addDays(today, -3), "11:30"),
    ...overrides,
  };
}

const listItems: EnquiryResponse[] = [
  enquiry(),
  enquiry({
    id: "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a11",
    prospectName: "Ravi Kumar",
    phone: "+91 90031 22334",
    courseId: null,
    courseName: null,
    subject: "Class 10 Maths",
    preferredClassMode: null,
    source: { id: REFERRAL, name: "Referral", retired: false },
    stage: "follow_up",
    nextFollowUpOn: addDays(today, -2),
    followUpDue: true,
  }),
  enquiry({
    id: "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a12",
    prospectName: "Fathima Begum",
    phone: "+91 99400 11223",
    courseId: TALLY,
    courseName: "Tally",
    preferredClassMode: "hybrid",
    source: { id: NEWSPAPER, name: "Newspaper ad", retired: true },
    stage: "demo_scheduled",
    nextFollowUpOn: addDays(today, 5),
  }),
  enquiry({
    id: "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a13",
    prospectName: "Arjun Nair",
    phone: "+91 98840 55667",
    stage: "joined",
    convertedStudentId: STUDENT_ID,
  }),
  enquiry({
    id: "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a14",
    prospectName: "Suresh Babu",
    phone: "+91 94440 77889",
    courseId: TALLY,
    courseName: "Tally",
    stage: "not_interested",
    notInterestedReason: "Fees too high",
  }),
];

function listRoute(items: EnquiryResponse[]): Route {
  return ({ url }) => {
    const view = url.searchParams.get("view") ?? "open";
    const q = url.searchParams.get("q")?.toLowerCase();
    const closed = (item: EnquiryResponse) =>
      item.stage === "joined" || item.stage === "not_interested";
    const matches = items.filter((item) => {
      if (view === "due" && !item.followUpDue) return false;
      if (view === "open" && closed(item)) return false;
      if (view === "closed" && !closed(item)) return false;
      if (q == null) return true;
      return (
        item.prospectName.toLowerCase().includes(q) || item.phone.includes(q)
      );
    });
    const json: EnquiryListResponse = {
      items: matches,
      nextCursor: null,
      prevCursor: null,
      total: matches.length,
    };
    return { json };
  };
}

function detailRoutes(
  current: EnquiryDetailResponse,
  extra: Record<string, Route> = {},
): Record<string, Route> {
  return {
    [`GET /enquiries/${current.id}`]: () => ({ json: current }),
    "GET /enquiries/options": () => ({ json: options }),
    ...extra,
  };
}

const meta = {
  title: "Pages/Enquiries",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/enquiries" } },
  },
  beforeEach() {
    signInAs("owner");
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------ list ------------------------------ */

export const ListOpen: Story = {
  beforeEach: () => mockApi({ "GET /enquiries": listRoute(listItems) }),
  render: () => <EnquiriesScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Enquiries" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sources" })).toHaveAttribute(
      "href",
      "/enquiries/sources",
    );
    await expect(canvas.getByRole("link", { name: "Summary" })).toHaveAttribute(
      "href",
      "/enquiries/summary",
    );
    await expect(
      canvas.getByRole("link", { name: "Add enquiry" }),
    ).toHaveAttribute("href", "/enquiries/new");
    await expect(canvas.getByRole("tab", { name: "Open" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      await canvas.findByRole("tab", { name: /Follow-ups due\s*1 due/ }),
    ).toBeVisible();
    const open = within(canvas.getByRole("region", { name: "Open" }));
    await expect(
      await open.findByRole("link", { name: "Priya Sharma" }),
    ).toHaveAttribute("href", `/enquiries/${ENQUIRY_ID}`);
    await expect(open.getByText("Class 10 Maths")).toBeVisible();
    await expect(open.getByText(/Due \d+ \w+/)).toBeVisible();
    await expect(open.queryByText("Arjun Nair")).toBeNull();

    await userEvent.type(
      canvas.getByLabelText("Search by name or phone"),
      "ravi",
    );
    await waitFor(() =>
      expect(open.queryByRole("link", { name: "Priya Sharma" })).toBeNull(),
    );
    await expect(open.getByRole("link", { name: "Ravi Kumar" })).toBeVisible();
    await expect(
      calls.some((call) => call.url.searchParams.get("q") === "ravi"),
    ).toBe(true);
  },
};

export const ListTabs: Story = {
  beforeEach: () => mockApi({ "GET /enquiries": listRoute(listItems) }),
  render: () => <EnquiriesScreen />,
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("tab", { name: /Follow-ups due/ }),
    );
    const due = within(canvas.getByRole("region", { name: "Follow-ups due" }));
    await expect(
      await due.findByRole("link", { name: "Ravi Kumar" }),
    ).toBeVisible();
    await expect(due.queryByText("Priya Sharma")).toBeNull();

    await userEvent.click(canvas.getByRole("tab", { name: "Closed" }));
    const closed = within(canvas.getByRole("region", { name: "Closed" }));
    await expect(
      await closed.findByRole("link", { name: "Arjun Nair" }),
    ).toBeVisible();
    await expect(closed.getByText("Joined")).toBeVisible();
    await expect(closed.getByText("Not interested")).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    const all = within(canvas.getByRole("region", { name: "All" }));
    await expect(
      await all.findByRole("link", { name: "Suresh Babu" }),
    ).toBeVisible();
    await expect(all.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  },
};

export const ListEmptyStates: Story = {
  beforeEach: () => mockApi({ "GET /enquiries": listRoute([]) }),
  render: () => <EnquiriesScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No open Enquiries.")).toBeVisible();
    const openRegion = within(canvas.getByRole("region", { name: "Open" }));
    await expect(
      openRegion.getByRole("link", { name: "Add enquiry" }),
    ).toHaveAttribute("href", "/enquiries/new");

    await userEvent.click(canvas.getByRole("tab", { name: /Follow-ups due/ }));
    await expect(
      await canvas.findByText("No follow-ups due today."),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "See open Enquiries" }),
    );
    await expect(canvas.getByRole("tab", { name: "Open" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(canvas.getByRole("tab", { name: "Closed" }));
    await expect(
      await canvas.findByText("No closed Enquiries yet."),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    await expect(await canvas.findByText("No Enquiries yet.")).toBeVisible();

    await userEvent.type(
      canvas.getByLabelText("Search by name or phone"),
      "zzz",
    );
    await expect(
      await canvas.findByText("No Enquiries match “zzz”."),
    ).toBeVisible();
  },
};

export const ListForTeacher: Story = {
  beforeEach: () => {
    signInAs("teacher");
    return mockApi({ "GET /enquiries": listRoute(listItems) });
  },
  render: () => <EnquiriesScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Priya Sharma" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add enquiry" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Sources" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Summary" })).toBeNull();
  },
};

/* ------------------------------ form ------------------------------ */

const phoneMatches: PhoneMatchesResponse = {
  students: [{ id: STUDENT_ID, name: "Priya Sharma" }],
  enquiries: [
    {
      id: "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a11",
      prospectName: "Priya S",
      stage: "follow_up",
    },
  ],
};

export const AddEnquiry: Story = {
  parameters: { nextjs: { navigation: { pathname: "/enquiries/new" } } },
  beforeEach: () =>
    mockApi({
      "GET /enquiries/options": () => ({ json: options }),
      "POST /enquiries/phone-matches": () => ({ json: phoneMatches }),
      "POST /enquiries": ({ body }) => ({
        status: 201,
        json: enquiry({ ...(body as Partial<EnquiryResponse>) }),
      }),
    }),
  render: () => <EnquiryCreateScreen />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save enquiry" }),
    );
    await expect(
      await canvas.findByText("Prospect name is required"),
    ).toBeVisible();
    await expect(canvas.getByText("Phone is required")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Prospect name"), "Priya");
    await userEvent.type(canvas.getByLabelText("Phone"), "98765 43210");
    await userEvent.tab();
    const warning = await canvas.findByRole("status", {
      name: "This phone is already on record",
    });
    await expect(
      within(warning).getByRole("link", { name: "Priya Sharma" }),
    ).toHaveAttribute("href", `/students/${STUDENT_ID}`);
    await expect(within(warning).getByText(/Already a Student/)).toBeVisible();
    await expect(
      within(warning).getByRole("link", { name: "Priya S" }),
    ).toHaveAttribute(
      "href",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a11",
    );
    await expect(callsTo("POST /enquiries/phone-matches")[0]?.body).toEqual({
      phone: "98765 43210",
    });

    await userEvent.click(canvas.getByLabelText("Course"));
    await userEvent.click(
      await body.findByRole("option", { name: "Other subject" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save enquiry" }));
    await expect(
      await canvas.findByText("Enter the subject they asked about"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Subject"), "Spoken English");

    await userEvent.click(canvas.getByLabelText("Source"));
    await expect(
      body.queryByRole("option", { name: /Newspaper ad/ }),
    ).toBeNull();
    await userEvent.click(await body.findByRole("option", { name: "Walk-in" }));

    // Saving is still allowed with a phone match.
    await userEvent.click(canvas.getByRole("button", { name: "Save enquiry" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`/enquiries/${ENQUIRY_ID}`),
    );
    await expect(callsTo("POST /enquiries")[0]?.body).toEqual({
      prospectName: "Priya",
      phone: "98765 43210",
      email: null,
      guardianName: null,
      guardianPhone: null,
      courseId: null,
      subject: "Spoken English",
      preferredClassMode: null,
      preferredTiming: null,
      sourceId: WALK_IN,
      notes: null,
      nextFollowUpOn: null,
    });
  },
};

export const EditKeepsRetiredSource: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/enquiries/${ENQUIRY_ID}/edit` } },
  },
  beforeEach: () =>
    mockApi(
      detailRoutes(
        detail({
          source: { id: NEWSPAPER, name: "Newspaper ad", retired: true },
        }),
        {
          [`POST /enquiries/${ENQUIRY_ID}/details`]: () => ({
            json: enquiry(),
          }),
        },
      ),
    ),
  render: () => <EnquiryEditScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit enquiry" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Source")).toHaveTextContent(
      "Newspaper ad (retired)",
    );
    await expect(canvas.queryByLabelText(/Next follow-up/)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`/enquiries/${ENQUIRY_ID}`),
    );
    await expect(
      callsTo(`POST /enquiries/${ENQUIRY_ID}/details`)[0]?.body,
    ).toMatchObject({ sourceId: NEWSPAPER, courseId: DCA });
  },
};

/* ----------------------------- detail ----------------------------- */

const detailParameters = {
  nextjs: { navigation: { pathname: `/enquiries/${ENQUIRY_ID}` } },
};

export const DetailNew: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(detail(), {
        [`POST /enquiries/${ENQUIRY_ID}/follow-ups`]: () => ({
          json: detail({ stage: "follow_up" }),
        }),
      }),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Priya Sharma" }),
    ).toBeVisible();
    await expect(canvas.getAllByText("New")[0]).toBeVisible();
    await expect(canvas.getByText(/Ramesh Sharma/)).toBeVisible();
    await expect(canvas.getByText("No demos booked yet.")).toBeVisible();
    await expect(canvas.getByText("Enquiry added")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Convert to Student" }),
    ).toHaveAttribute("href", `/enquiries/${ENQUIRY_ID}/convert`);

    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Log follow-up" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save follow-up" }),
    );
    await expect(
      await dialog.findByText("Write what happened on the call"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Note"),
      "Father wants weekend timings.",
    );
    await userEvent.type(
      dialog.getByLabelText("Next follow-up (optional)"),
      addDays(today, 3),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save follow-up" }),
    );
    await waitFor(() =>
      expect(
        callsTo(`POST /enquiries/${ENQUIRY_ID}/follow-ups`)[0]?.body,
      ).toEqual({
        note: "Father wants weekend timings.",
        nextFollowUpOn: addDays(today, 3),
      }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Log follow-up" })).toBeNull(),
    );
  },
};

const scheduled = detail({
  stage: "demo_scheduled",
  nextFollowUpOn: addDays(today, 4),
  history: [
    {
      id: "act-follow-up",
      kind: "follow_up",
      note: "Asked about weekday mornings. Will bring her father.",
      nextFollowUpOn: addDays(today, 4),
      createdByUserId: "user_owner",
      createdAt: at(addDays(today, -4), "16:20"),
    },
    {
      id: "act-created",
      kind: "created",
      note: null,
      nextFollowUpOn: null,
      createdByUserId: "user_owner",
      createdAt: at(addDays(today, -6)),
    },
  ],
  demos: [
    demo({
      id: "bb0e8400-e29b-41d4-a716-446655440002",
      kind: "one_to_one",
      batchId: null,
      batchName: null,
      courseName: null,
      teacherId: MEENA,
      teacherName: "Meena Iyer",
      date: addDays(today, -1),
      startTime: "17:00",
      endTime: "18:00",
      feeKind: "paid",
      feeAmountPaise: 30_000,
      createdAt: at(addDays(today, -2), "12:00"),
    }),
    demo(),
  ],
});

export const DetailDemoScheduled: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(scheduled, {
        "POST /demos/bb0e8400-e29b-41d4-a716-446655440002/fee-paid": () => ({
          json: demo(),
        }),
        "POST /demos/bb0e8400-e29b-41d4-a716-446655440002/attendance": () => ({
          json: demo(),
        }),
        "POST /demos/bb0e8400-e29b-41d4-a716-446655440001/cancel": () => ({
          status: 409,
          json: {
            code: "DEMO_ATTENDANCE_MARKED",
            message: "This demo's attendance is already marked.",
          },
        }),
      }),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const demos = within(await canvas.findByRole("region", { name: "Demos" }));
    const oneToOne = within(
      demos.getByRole("listitem", { name: /^One-to-one demo/ }),
    );
    await expect(
      oneToOne.getByText("One-to-one with Meena Iyer"),
    ).toBeVisible();
    await expect(oneToOne.getByText("₹300 · Unpaid")).toBeVisible();
    await expect(oneToOne.getByText("Not marked")).toBeVisible();
    await userEvent.click(oneToOne.getByRole("button", { name: "Mark paid" }));
    await waitFor(() =>
      expect(
        callsTo("POST /demos/bb0e8400-e29b-41d4-a716-446655440002/fee-paid"),
      ).toHaveLength(1),
    );
    await userEvent.click(oneToOne.getByRole("button", { name: "Attended" }));
    await waitFor(() =>
      expect(
        callsTo(
          "POST /demos/bb0e8400-e29b-41d4-a716-446655440002/attendance",
        )[0]?.body,
      ).toEqual({ attended: true }),
    );

    const batch = within(demos.getByRole("listitem", { name: /^Batch demo/ }));
    await expect(batch.getByText("DCA Weekday 9–11")).toBeVisible();
    await expect(batch.getByText("Free")).toBeVisible();
    await expect(batch.getByText("Upcoming")).toBeVisible();
    // Attendance waits for the demo's start time.
    await expect(batch.queryByRole("button", { name: "Attended" })).toBeNull();
    await userEvent.click(
      batch.getByRole("button", { name: "Cancel booking" }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Cancel booking" }),
    );
    await expect(
      await demos.findByText("This demo's attendance is already marked."),
    ).toBeVisible();

    const history = within(canvas.getByRole("region", { name: "History" }));
    await expect(
      history.getByText(
        "Follow-up: Asked about weekday mornings. Will bring her father.",
      ),
    ).toBeVisible();
    await expect(
      history.getByText(/^Next follow-up set for \d+ \w+$/),
    ).toBeVisible();
    await expect(
      history.getByText(/^Demo booked: DCA Weekday 9–11, \w+ \d+ \w+ 9:00 AM$/),
    ).toBeVisible();
    await expect(
      history.getByText(/^Demo booked: One-to-one with Meena Iyer/),
    ).toBeVisible();
  },
};

const attended = detail({
  stage: "demo_attended",
  demos: [
    demo({
      date: addDays(today, -1),
      attendance: "attended",
      attendanceMarkedAt: at(addDays(today, -1), "11:05"),
    }),
  ],
});

export const DetailDemoAttendedOwner: Story = {
  parameters: detailParameters,
  beforeEach: () => mockApi(detailRoutes(attended)),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    const convert = await canvas.findByRole("link", {
      name: "Convert to Student",
    });
    await expect(convert).toHaveAttribute(
      "href",
      `/enquiries/${ENQUIRY_ID}/convert`,
    );
    // Primary once the demo is attended.
    await expect(convert.className).toMatch(/\bbg-primary\s/);
    await expect(
      canvas.getByText(/Convert to Student when they’re ready to join/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/^Attended the demo: DCA Weekday 9–11/),
    ).toBeVisible();
  },
};

export const DetailDemoAttendedTeacher: Story = {
  parameters: detailParameters,
  beforeEach: () => {
    signInAs("teacher");
    return mockApi(detailRoutes(attended));
  },
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Log follow-up" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Convert to Student" }),
    ).toBeNull();
  },
};

const notInterested = detail({
  stage: "not_interested",
  notInterestedReason: "Fees too high",
  history: [
    {
      id: "act-closed",
      kind: "not_interested",
      note: "Fees too high",
      nextFollowUpOn: null,
      createdByUserId: "user_owner",
      createdAt: at(addDays(today, -1), "15:00"),
    },
  ],
});

export const DetailNotInterested: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(notInterested, {
        [`POST /enquiries/${ENQUIRY_ID}/reopen`]: () => ({
          json: enquiry({ stage: "follow_up" }),
        }),
      }),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Marked not interested: Fees too high"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Log follow-up" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Book demo" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Reopen" }));
    await waitFor(() =>
      expect(callsTo(`POST /enquiries/${ENQUIRY_ID}/reopen`)[0]?.body).toEqual({
        nextFollowUpOn: null,
      }),
    );
  },
};

export const DetailJoined: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(
        detail({
          stage: "joined",
          convertedStudentId: STUDENT_ID,
          convertedAt: at(addDays(today, -1), "12:00"),
          history: [
            {
              id: "act-joined",
              kind: "joined",
              note: null,
              nextFollowUpOn: null,
              createdByUserId: "user_owner",
              createdAt: at(addDays(today, -1), "12:00"),
            },
          ],
        }),
      ),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "View Student" }),
    ).toHaveAttribute("href", `/students/${STUDENT_ID}`);
    await expect(canvas.getByText("Joined as a Student")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Log follow-up" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Edit details" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Convert to Student" }),
    ).toBeNull();
  },
};

/* ----------------------------- dialogs ---------------------------- */

const slots: DemoSlotsResponse = {
  items: [
    {
      date: today,
      startTime: "07:00",
      endTime: "08:30",
      status: "cancelled",
      rescheduled: false,
      reason: "Power cut",
      bookable: false,
    },
    {
      date: today,
      startTime: "18:00",
      endTime: "19:30",
      status: "scheduled",
      rescheduled: true,
      reason: "Moved from morning",
      bookable: true,
    },
  ],
};

export const BookBatchDemo: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(detail(), {
        "GET /demos/slots": () => ({ json: slots }),
        [`POST /enquiries/${ENQUIRY_ID}/demos`]: () => ({
          status: 201,
          json: demo(),
        }),
      }),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(await canvas.findByRole("region", { name: "Demos" })).getByRole(
        "button",
        { name: "Book demo" },
      ),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Book demo" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Book demo" }));
    await expect(
      await dialog.findByText("Pick a Batch for the demo"),
    ).toBeVisible();

    await userEvent.click(dialog.getByLabelText("Batch"));
    await userEvent.click(
      await body.findByRole("option", { name: "DCA Weekday 9–11 · DCA" }),
    );
    const cancelledSlot = await dialog.findByRole("radio", {
      name: /7:00 AM–8:30 AM/,
    });
    await expect(cancelledSlot).toHaveAttribute("data-disabled");
    await expect(dialog.getByText("Cancelled · Power cut")).toBeVisible();
    await expect(
      callsTo("GET /demos/slots")[0]?.url.searchParams.get("batchId"),
    ).toBe(DCA_WEEKDAY);

    await userEvent.click(
      dialog.getByRole("radio", { name: /6:00 PM–7:30 PM/ }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Paid" }));
    await userEvent.click(dialog.getByRole("button", { name: "Book demo" }));
    await expect(await dialog.findByText("Enter the demo fee")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Amount (₹)"), "200");
    await userEvent.click(dialog.getByRole("button", { name: "Book demo" }));
    await waitFor(() =>
      expect(callsTo(`POST /enquiries/${ENQUIRY_ID}/demos`)[0]?.body).toEqual({
        kind: "batch",
        batchId: DCA_WEEKDAY,
        date: today,
        startTime: "18:00",
        feeKind: "paid",
        feeAmountPaise: 20_000,
      }),
    );
  },
};

export const BookOneToOneDemoClash: Story = {
  parameters: detailParameters,
  beforeEach: () => {
    signInAs("teacher");
    return mockApi(
      detailRoutes(detail(), {
        "GET /enquiries/options": () => ({
          json: { ...options, currentTeacherId: MEENA },
        }),
        [`POST /enquiries/${ENQUIRY_ID}/demos`]: () => ({
          status: 409,
          json: {
            code: "DEMO_TEACHER_CLASH",
            message: "Meena Iyer already has a one-to-one demo at that time.",
          },
        }),
      }),
    );
  },
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(await canvas.findByRole("region", { name: "Demos" })).getByRole(
        "button",
        { name: "Book demo" },
      ),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Book demo" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: /One-to-one/ }));
    await expect(dialog.getByLabelText("Teacher")).toHaveTextContent(
      "Meena Iyer",
    );
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, addDays(today, 1));
    await userEvent.type(dialog.getByLabelText("Start time"), "17:00");
    await userEvent.type(dialog.getByLabelText("End time"), "16:00");
    await userEvent.click(dialog.getByRole("button", { name: "Book demo" }));
    await expect(
      await dialog.findByText("End time must be after the start time"),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("End time"));
    await userEvent.type(dialog.getByLabelText("End time"), "18:00");
    await userEvent.click(dialog.getByRole("button", { name: "Book demo" }));
    await expect(
      await dialog.findByText(
        "Meena Iyer already has a one-to-one demo at that time.",
      ),
    ).toBeVisible();
    await expect(
      callsTo(`POST /enquiries/${ENQUIRY_ID}/demos`)[0]?.body,
    ).toEqual({
      kind: "one_to_one",
      teacherId: MEENA,
      date: addDays(today, 1),
      startTime: "17:00",
      endTime: "18:00",
      feeKind: "free",
      feeAmountPaise: null,
    });
  },
};

export const NotInterestedNeedsReason: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockApi(
      detailRoutes(scheduled, {
        [`POST /enquiries/${ENQUIRY_ID}/not-interested`]: () => ({
          json: enquiry({ stage: "not_interested" }),
        }),
      }),
    ),
  render: () => <EnquiryDetailScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Not interested" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Not interested" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByText(/Demos that are booked and not yet marked/),
      ).toBeVisible(),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark not interested" }),
    );
    await expect(
      await dialog.findByText("Choose or write a reason"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Fees too high" }),
    );
    await expect(
      dialog.getByRole("button", { name: "Fees too high" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark not interested" }),
    );
    await waitFor(() =>
      expect(
        callsTo(`POST /enquiries/${ENQUIRY_ID}/not-interested`)[0]?.body,
      ).toEqual({ reason: "Fees too high" }),
    );
  },
};
