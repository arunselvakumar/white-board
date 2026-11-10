import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { addDays } from "@/lib/calendar-dates";
import {
  enquiryQueries,
  type DemoResponse,
  type EnquiryDetailResponse,
  type EnquiryOptionsResponse,
  type EnquirySource,
  type EnquirySummaryResponse,
} from "@/src/queries/enquiries";
import { getQueryClient } from "@/src/queries/query-client";

import { ConvertEnquiryScreen } from "./convert-enquiry-screen";
import { EnquirySourcesScreen } from "./enquiry-sources-screen";
import {
  currentEnquiryMonth,
  EnquirySummaryScreen,
} from "./enquiry-summary-screen";
import { UpcomingDemosCard } from "./upcoming-demos-card";

/* ------------------------------------------------------------------ */
/* API mock: answers /api/training-institute/* from story handlers */
/* ------------------------------------------------------------------ */

type ApiReply = { status?: number; json: unknown };
type ApiHandler = (body: unknown) => ApiReply;
type ApiCall = { route: string; body: unknown };

function mockTrainingInstituteApi(
  routes: Record<string, ApiHandler>,
  calls: ApiCall[] = [],
) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = `${method} ${url.pathname.replace(/^\/api\/training-institute/, "")}`;
    const handler = routes[route];
    if (handler == null) return original(input, init);
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ route, body });
    const reply = handler(body);
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

function seed(): ReturnType<typeof getQueryClient> {
  const client = getQueryClient();
  client.removeQueries({ queryKey: enquiryQueries.key.all });
  return client;
}

/* ---------------------------- fixtures ---------------------------- */

const ENQUIRY_ID = "3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10";
const STUDENT_ID = "880e8400-e29b-41d4-a716-446655440000";
const DCA = "770e8400-e29b-41d4-a716-446655440000";
const TALLY = "770e8400-e29b-41d4-a716-446655440001";
const DCA_MORNING = "660e8400-e29b-41d4-a716-446655440001";
const DCA_EVENING = "660e8400-e29b-41d4-a716-446655440002";
const TALLY_WEEKEND = "660e8400-e29b-41d4-a716-446655440003";

const options: EnquiryOptionsResponse = {
  courses: [
    { id: DCA, name: "DCA" },
    { id: TALLY, name: "Tally" },
  ],
  batches: [
    {
      id: DCA_MORNING,
      name: "DCA Morning",
      courseId: DCA,
      courseName: "DCA",
      classMode: "offline",
      timezone: "Asia/Kolkata",
      capacity: 20,
      enrolled: 20,
    },
    {
      id: DCA_EVENING,
      name: "DCA Evening",
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
  teachers: [{ id: "990e8400-e29b-41d4-a716-446655440000", name: "Asha Rao" }],
  sources: [{ id: "s-referral", name: "Referral", retired: false }],
  currentTeacherId: null,
};

const attendedDemo: DemoResponse = {
  id: "aa0e8400-e29b-41d4-a716-446655440000",
  enquiryId: ENQUIRY_ID,
  prospectName: "Riya Patel",
  enquiryInterest: "DCA",
  kind: "batch",
  batchId: DCA_EVENING,
  batchName: "DCA Evening",
  courseName: "DCA",
  teacherId: null,
  teacherName: null,
  date: "2026-10-03",
  startTime: "17:00",
  endTime: "18:00",
  timezone: "Asia/Kolkata",
  feeKind: "free",
  feeAmountPaise: null,
  feePaidAt: null,
  attendance: "attended",
  attendanceMarkedAt: "2026-10-03T12:00:00.000Z",
  cancelledAt: null,
  createdByUserId: "user_owner",
  createdAt: "2026-10-01T09:00:00.000Z",
};

const enquiry: EnquiryDetailResponse = {
  id: ENQUIRY_ID,
  prospectName: "Riya Patel",
  phone: "+91 98450 12345",
  email: "riya@example.com",
  guardianName: "Meena Patel",
  guardianPhone: "+91 98450 67890",
  courseId: DCA,
  courseName: "DCA",
  subject: null,
  preferredClassMode: "online",
  preferredTiming: "Weekday evenings",
  source: { id: "s-referral", name: "Referral", retired: false },
  notes: null,
  stage: "demo_attended",
  nextFollowUpOn: null,
  followUpDue: false,
  notInterestedReason: null,
  convertedStudentId: null,
  convertedEnrollmentId: null,
  convertedAt: null,
  createdByUserId: "user_owner",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-03T12:00:00.000Z",
  history: [],
  demos: [attendedDemo],
};

const joinedEnquiry: EnquiryDetailResponse = {
  ...enquiry,
  stage: "joined",
  convertedStudentId: STUDENT_ID,
  convertedEnrollmentId: "bb0e8400-e29b-41d4-a716-446655440000",
  convertedAt: "2026-10-06T10:00:00.000Z",
};

const meta = {
  title: "Pages/Enquiries (Owner)",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: `/enquiries/${ENQUIRY_ID}/convert` } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------- Convert to Student ------------------------- */

const convertCalls: ApiCall[] = [];

export const ConvertPrefilledBatch: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(enquiryQueries.detail(ENQUIRY_ID).queryKey, enquiry);
    client.setQueryData(enquiryQueries.options().queryKey, options);
    convertCalls.length = 0;
    return mockTrainingInstituteApi(
      {
        [`POST /enquiries/${ENQUIRY_ID}/convert`]: () => ({
          status: 201,
          json: {
            enquiry: joinedEnquiry,
            studentId: STUDENT_ID,
            enrollmentId: joinedEnquiry.convertedEnrollmentId,
          },
        }),
        [`GET /enquiries/${ENQUIRY_ID}`]: () => ({ json: joinedEnquiry }),
        "GET /enquiries/options": () => ({ json: options }),
      },
      convertCalls,
    );
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Convert to Student" }),
    ).toBeVisible();
    const carried = within(
      canvas.getByRole("complementary", { name: "The new Student gets" }),
    );
    await expect(carried.getByText("+91 98450 12345")).toBeVisible();
    await expect(carried.getByText("Meena Patel")).toBeVisible();
    await expect(
      carried.getByText(/default fee becomes the Fee Plan/),
    ).toBeVisible();
    // The latest attended Batch demo was in DCA Evening.
    await expect(canvas.getByLabelText("Batch")).toHaveTextContent(
      "DCA Evening · DCA",
    );
    await expect(canvas.getByText(/14 of 20 seats taken/)).toBeVisible();
    // The prospect prefers Online; the Batch runs Offline.
    await expect(canvas.getByLabelText("Class Mode")).toHaveTextContent(
      "Online",
    );
    await expect(canvas.getByLabelText("Timings")).toHaveTextContent(
      "Inherit Batch Timings",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`/students/${STUDENT_ID}`),
    );
    await expect(convertCalls[0]?.body).toEqual({
      batchId: DCA_EVENING,
      timingSource: "batch",
      classModeOverride: "online",
    });
  },
};

export const ConvertStudentSpecificTimings: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(enquiryQueries.detail(ENQUIRY_ID).queryKey, {
      ...enquiry,
      demos: [],
      courseId: TALLY,
      courseName: "Tally",
      preferredClassMode: null,
    });
    client.setQueryData(enquiryQueries.options().queryKey, options);
    convertCalls.length = 0;
    return mockTrainingInstituteApi(
      {
        [`POST /enquiries/${ENQUIRY_ID}/convert`]: () => ({
          status: 201,
          json: {
            enquiry: joinedEnquiry,
            studentId: STUDENT_ID,
            enrollmentId: joinedEnquiry.convertedEnrollmentId,
          },
        }),
        [`GET /enquiries/${ENQUIRY_ID}`]: () => ({ json: joinedEnquiry }),
        "GET /enquiries/options": () => ({ json: options }),
      },
      convertCalls,
    );
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    // The only open Batch of the Enquiry's Course is picked.
    await expect(canvas.getByLabelText("Batch")).toHaveTextContent(
      "Tally Weekend · Tally",
    );
    await expect(canvas.getByLabelText("Class Mode")).toHaveTextContent(
      "Use Batch mode (Hybrid)",
    );
    await userEvent.click(canvas.getByLabelText("Timings"));
    await userEvent.click(
      await body.findByRole("option", { name: "Student-specific Timings" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await expect(
      await canvas.findByText("Pick at least one day"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Sat" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await waitFor(() =>
      expect(convertCalls[0]?.body).toEqual({
        batchId: TALLY_WEEKEND,
        timingSource: "student",
        studentTimings: [
          { daysOfWeek: [6], startTime: "17:00", endTime: "18:00" },
        ],
        classModeOverride: null,
      }),
    );
  },
};

export const ConvertBatchAtCapacity: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(enquiryQueries.detail(ENQUIRY_ID).queryKey, {
      ...enquiry,
      demos: [],
      preferredClassMode: "offline",
    });
    client.setQueryData(enquiryQueries.options().queryKey, options);
    return mockTrainingInstituteApi({
      [`POST /enquiries/${ENQUIRY_ID}/convert`]: () => ({
        status: 409,
        json: { code: "BATCH_AT_CAPACITY", message: "Batch is at capacity." },
      }),
    });
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Two DCA Batches, no attended demo: the Owner picks one.
    await expect(canvas.getByLabelText("Batch")).toHaveTextContent(
      "Select a Batch",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await expect(await canvas.findByText("Choose a Batch")).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Batch"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: /DCA Morning.*20\/20 · Full/,
      }),
    );
    await expect(canvas.getByText(/this Batch is full/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await expect(
      await canvas.findByText("Batch is at capacity."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Convert to Student" }),
    ).toBeEnabled();
  },
};

export const ConvertAlreadyJoined: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(
      enquiryQueries.detail(ENQUIRY_ID).queryKey,
      joinedEnquiry,
    );
    client.setQueryData(enquiryQueries.options().queryKey, options);
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Riya Patel has joined" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Riya Patel" }),
    ).toHaveAttribute("href", `/students/${STUDENT_ID}`);
    await expect(
      canvas.queryByRole("form", { name: "Convert to Student" }),
    ).toBeNull();
  },
};

export const ConvertedElsewhere: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(enquiryQueries.detail(ENQUIRY_ID).queryKey, enquiry);
    client.setQueryData(enquiryQueries.options().queryKey, options);
    return mockTrainingInstituteApi({
      [`POST /enquiries/${ENQUIRY_ID}/convert`]: () => ({
        status: 409,
        json: {
          code: "ENQUIRY_ALREADY_CONVERTED",
          message: "This Enquiry is already converted.",
        },
      }),
      [`GET /enquiries/${ENQUIRY_ID}`]: () => ({ json: joinedEnquiry }),
    });
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Convert to Student" }),
    );
    await expect(
      await canvas.findByRole("link", { name: "Open Riya Patel" }),
    ).toHaveAttribute("href", `/students/${STUDENT_ID}`);
  },
};

export const ConvertNotInterested: Story = {
  beforeEach: () => {
    const client = seed();
    client.setQueryData(enquiryQueries.detail(ENQUIRY_ID).queryKey, {
      ...enquiry,
      stage: "not_interested",
      notInterestedReason: "Fees too high",
    });
    client.setQueryData(enquiryQueries.options().queryKey, options);
  },
  render: () => <ConvertEnquiryScreen enquiryId={ENQUIRY_ID} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Reopen it first, then convert it to a Student/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to the Enquiry" }),
    ).toHaveAttribute("href", `/enquiries/${ENQUIRY_ID}`);
  },
};

/* --------------------------- Enquiry Sources --------------------------- */

function sourcesApi(initial: EnquirySource[]) {
  let sources = initial.map((source) => ({ ...source }));
  const list = () => ({
    json: {
      items: [...sources].sort(
        (a, b) =>
          Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name),
      ),
    },
  });
  const nameOf = (body: unknown) =>
    typeof body === "object" && body != null && "name" in body
      ? String(body.name)
      : "";
  const inUse = (name: string, except?: string) =>
    sources.some(
      (source) =>
        !source.retired &&
        source.id !== except &&
        source.name.toLowerCase() === name.toLowerCase(),
    );
  const conflict = {
    status: 409,
    json: {
      code: "ENQUIRY_SOURCE_NAME_IN_USE",
      message: "An active Enquiry Source already has this name.",
    },
  };
  const routes: Record<string, ApiHandler> = {
    "GET /enquiry-sources": list,
    "POST /enquiry-sources": (body) => {
      const name = nameOf(body);
      if (inUse(name)) return conflict;
      const source = { id: `s-${sources.length + 1}`, name, retired: false };
      sources = [...sources, source];
      return { status: 201, json: source };
    },
  };
  for (const source of initial) {
    const update = (patch: Partial<EnquirySource>) => {
      sources = sources.map((item) =>
        item.id === source.id ? { ...item, ...patch } : item,
      );
      return { json: sources.find((item) => item.id === source.id) };
    };
    routes[`POST /enquiry-sources/${source.id}/rename`] = (body) => {
      const name = nameOf(body);
      return inUse(name, source.id) ? conflict : update({ name });
    };
    routes[`POST /enquiry-sources/${source.id}/retire`] = () =>
      update({ retired: true });
    routes[`POST /enquiry-sources/${source.id}/restore`] = () => {
      const current = sources.find((item) => item.id === source.id);
      return current != null && inUse(current.name, source.id)
        ? conflict
        : update({ retired: false });
    };
  }
  return { routes, items: () => list().json.items };
}

const DEFAULT_SOURCES: EnquirySource[] = [
  { id: "s-phone", name: "Phone call", retired: false },
  { id: "s-referral", name: "Referral", retired: false },
  { id: "s-social", name: "Social media", retired: false },
  { id: "s-walk-in", name: "Walk-in", retired: false },
  { id: "s-website", name: "Website", retired: false },
  { id: "s-pamphlet", name: "Pamphlet", retired: true },
];

export const SourcesManage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/enquiries/sources" } },
  },
  beforeEach: () => {
    const api = sourcesApi(DEFAULT_SOURCES);
    seed().setQueryData(enquiryQueries.sources().queryKey, {
      items: api.items(),
    });
    return mockTrainingInstituteApi(api.routes);
  },
  render: () => <EnquirySourcesScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("heading", { name: "Enquiry Sources" }),
    ).toBeVisible();
    await expect(canvas.getByText("5 active · 1 retired")).toBeVisible();

    // Add
    await userEvent.click(canvas.getByRole("button", { name: "Add Source" }));
    await expect(
      await canvas.findByText("Source name is required"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("New Source"), "Newspaper ad");
    await userEvent.click(canvas.getByRole("button", { name: "Add Source" }));
    await expect(await canvas.findByText("Newspaper ad")).toBeVisible();
    await expect(canvas.getByLabelText("New Source")).toHaveValue("");

    // Add a name already in use
    await userEvent.type(canvas.getByLabelText("New Source"), "phone call");
    await userEvent.click(canvas.getByRole("button", { name: "Add Source" }));
    await expect(
      await canvas.findByText(
        "An active Enquiry Source already has this name.",
      ),
    ).toBeVisible();

    // Rename
    await userEvent.click(
      canvas.getByRole("button", { name: "Rename Website" }),
    );
    const nameInput = canvas.getByLabelText("Source name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Website form");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Website form")).toBeVisible();

    // Retire, then restore
    await userEvent.click(
      canvas.getByRole("button", { name: "Retire Walk-in" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(dialog.getByText(/Past Enquiries keep the name/)).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Retire" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Restore Walk-in" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Retire Walk-in" }),
    ).toBeVisible();
  },
};

/* --------------------------- Enquiry summary --------------------------- */

const summary = (month: string): EnquirySummaryResponse => ({
  month,
  enquiriesReceived: 42,
  demosAttended: 17,
  admissions: 11,
  paidDemoFeesPaise: 450000,
  notInterestedReasons: [
    { reason: "Fees too high", count: 6 },
    { reason: "Timing doesn’t suit", count: 4 },
    { reason: "Joined another centre", count: 3 },
    { reason: "Moved away", count: 1 },
  ],
  sources: [
    { sourceId: "s-referral", name: "Referral", enquiries: 12, admissions: 6 },
    { sourceId: "s-walk-in", name: "Walk-in", enquiries: 10, admissions: 3 },
    { sourceId: "s-phone", name: "Phone call", enquiries: 14, admissions: 2 },
    { sourceId: "s-social", name: "Social media", enquiries: 4, admissions: 0 },
    { sourceId: null, name: "No Source", enquiries: 2, admissions: 0 },
  ],
});

const emptySummary = (month: string): EnquirySummaryResponse => ({
  month,
  enquiriesReceived: 0,
  demosAttended: 0,
  admissions: 0,
  paidDemoFeesPaise: 0,
  notInterestedReasons: [],
  sources: [],
});

function previousMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (value ?? 1) - 2, 1));
  return date.toISOString().slice(0, 7);
}

export const SummaryWithData: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/enquiries/summary" } },
  },
  beforeEach: () => {
    const month = currentEnquiryMonth();
    seed().setQueryData(enquiryQueries.summary(month).queryKey, summary(month));
  },
  render: () => <EnquirySummaryScreen />,
  play: async ({ canvas }) => {
    const totals = within(canvas.getByRole("region", { name: "Month totals" }));
    await expect(totals.getByText("42")).toBeVisible();
    await expect(totals.getByText("₹4,500")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Next month" }),
    ).toBeDisabled();
    const referral = canvas.getByRole("row", { name: /Referral/ });
    await expect(within(referral).getByText("Top Source")).toBeVisible();
    await expect(within(referral).getByText("50%")).toBeVisible();
    await expect(canvas.getByText("Fees too high")).toBeVisible();
  },
};

export const SummaryEmptyMonth: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/enquiries/summary" } },
  },
  beforeEach: () => {
    const month = currentEnquiryMonth();
    const client = seed();
    client.setQueryData(enquiryQueries.summary(month).queryKey, summary(month));
    client.setQueryData(
      enquiryQueries.summary(previousMonth(month)).queryKey,
      emptySummary(previousMonth(month)),
    );
  },
  render: () => <EnquirySummaryScreen />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous month" }),
    );
    await expect(
      await canvas.findByText("No Enquiries this month."),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "No Enquiries were closed as Not interested this month.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Next month" }),
    ).toBeEnabled();
  },
};

/* ---------------------------- Upcoming demos ---------------------------- */

const TODAY = "2026-10-06";

function upcomingDemos(today: string): DemoResponse[] {
  const base = { ...attendedDemo, attendance: "unmarked" as const };
  return [
    {
      ...base,
      id: "d1",
      prospectName: "Riya Patel",
      date: today,
      startTime: "17:00",
      endTime: "18:00",
    },
    {
      ...base,
      id: "d2",
      enquiryId: "e2",
      prospectName: "Arjun Nair",
      enquiryInterest: "Class 10 Maths",
      kind: "one_to_one",
      batchId: null,
      batchName: null,
      courseName: null,
      teacherId: "t1",
      teacherName: "Asha Rao",
      date: addDays(today, 1),
      startTime: "10:30",
      endTime: "11:15",
      feeKind: "paid",
      feeAmountPaise: 20000,
    },
    {
      ...base,
      id: "d3",
      enquiryId: "e3",
      prospectName: "Kavya Iyer",
      enquiryInterest: "Tally",
      batchId: TALLY_WEEKEND,
      batchName: "Tally Weekend",
      courseName: "Tally",
      date: addDays(today, 2),
      startTime: "09:00",
      endTime: "11:00",
    },
  ];
}

export const UpcomingDemosGrouped: Story = {
  parameters: { nextjs: { navigation: { pathname: "/teacher" } } },
  beforeEach: () => {
    seed().setQueryData(
      enquiryQueries.demos(TODAY, addDays(TODAY, 6)).queryKey,
      { items: upcomingDemos(TODAY) },
    );
  },
  render: () => (
    <div className="max-w-md p-6">
      <UpcomingDemosCard today={TODAY} />
    </div>
  ),
  play: async ({ canvas }) => {
    const today = within(canvas.getByRole("list", { name: "Today" }));
    await expect(today.getByText("17:00")).toBeVisible();
    await expect(
      today.getByRole("link", { name: /Riya Patel demo/ }),
    ).toHaveAttribute("href", `/enquiries/${ENQUIRY_ID}`);
    await expect(today.getByText("DCA Evening · DCA")).toBeVisible();
    const tomorrow = within(canvas.getByRole("list", { name: "Tomorrow" }));
    await expect(
      tomorrow.getByText("One-to-one · Class 10 Maths"),
    ).toBeVisible();
    const thursday = within(canvas.getByRole("list", { name: "Thu 8 Oct" }));
    await expect(thursday.getByText("Kavya Iyer")).toBeVisible();
  },
};

export const UpcomingDemosEmpty: Story = {
  parameters: { nextjs: { navigation: { pathname: "/teacher" } } },
  beforeEach: () => {
    seed().setQueryData(
      enquiryQueries.demos(TODAY, addDays(TODAY, 6)).queryKey,
      { items: [] },
    );
  },
  render: () => (
    <div className="max-w-md p-6">
      <UpcomingDemosCard today={TODAY} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No demos in the next 7 days."),
    ).toBeVisible();
  },
};
