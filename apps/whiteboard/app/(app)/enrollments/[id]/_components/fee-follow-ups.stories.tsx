import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import { EnrollmentDetailScreen } from "@/components/enrollments/enrollment-detail-screen";
import { addDays } from "@/lib/calendar-dates";
import type { BatchListResponse, BatchResponse } from "@/src/queries/batches";
import type { CourseResponse } from "@/src/queries/courses";
import type {
  EnrollmentResponse,
  FeePaymentListResponse,
} from "@/src/queries/enrollments";
import type {
  FeeFollowUpHistoryResponse,
  FeeFollowUpInput,
  FeeFollowUpResponse,
} from "@/src/queries/fee-dues";
import type { StudentResponse } from "@/src/queries/students";
import { signInAs } from "../../../.storybook/mocks/auth";

import { followUpDateLabel, todayInZone } from "./fee-follow-up-format";
import { FeeFollowUpsCard } from "./fee-follow-ups-card";

/* ------------------------------------------------------------------ */
/* API mock: answers /api/training-institute/* from story routes        */
/* ------------------------------------------------------------------ */

type Reply = { status?: number; json: unknown };
type Route = (request: { url: URL; body: unknown }) => Reply;
type Call = { route: string; body: unknown };

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
    calls.push({ route, body });
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

const TIMEZONE = "Asia/Kolkata";
const today = todayInZone(TIMEZONE);
const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

const ENROLLMENT_ID = "bb0e8400-e29b-41d4-a716-446655440000";
const STUDENT_ID = "880e8400-e29b-41d4-a716-446655440000";
const COURSE_ID = "770e8400-e29b-41d4-a716-446655440000";
const BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";
const OPEN_ID = "cc0e8400-e29b-41d4-a716-446655440001";
const OWNER = { userId: "user_owner", name: "Lakshmi Narayanan" };
const PARTNER = { userId: "user_partner", name: "Suresh Kumar" };

const HISTORY_PATH = `/enrollments/${ENROLLMENT_ID}/fee-follow-ups`;

function followUp(
  overrides: Partial<FeeFollowUpResponse> & { id: string },
): FeeFollowUpResponse {
  return {
    enrollmentId: ENROLLMENT_ID,
    channel: "phone",
    note: null,
    nextFollowUpOn: null,
    open: false,
    loggedAt: at(addDays(today, -1)),
    loggedBy: OWNER,
    editedAt: null,
    editedBy: null,
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}

const openFollowUp = followUp({
  id: OPEN_ID,
  channel: "whatsapp_sms",
  note: "Sent the fee details on WhatsApp. Father will pay Saturday.",
  nextFollowUpOn: addDays(today, 2),
  open: true,
  loggedAt: at(addDays(today, -1), "18:20"),
  editedAt: at(today, "09:05"),
  editedBy: PARTNER,
});

const supersededFollowUp = followUp({
  id: "cc0e8400-e29b-41d4-a716-446655440002",
  channel: "phone",
  note: "Called mother. Salary comes on the 5th.",
  nextFollowUpOn: addDays(today, -3),
  loggedAt: at(addDays(today, -8), "11:40"),
  closedAt: at(addDays(today, -1), "18:20"),
  closeReason: "superseded",
});

const doneFollowUp = followUp({
  id: "cc0e8400-e29b-41d4-a716-446655440003",
  channel: "in_person",
  note: "Spoke at pick-up. Paid ₹2,000 of the first instalment.",
  loggedAt: at(addDays(today, -40), "16:00"),
  closedAt: at(addDays(today, -38), "10:00"),
  closeReason: "done",
});

const duesClearedFollowUp = followUp({
  id: "cc0e8400-e29b-41d4-a716-446655440004",
  channel: "other",
  note: "Left a note in the diary.",
  nextFollowUpOn: addDays(today, -60),
  loggedAt: at(addDays(today, -70), "12:15"),
  closedAt: at(addDays(today, -62), "15:30"),
  closeReason: "dues_cleared",
});

function history(
  items: FeeFollowUpResponse[],
  remainingPaise = 450000,
): FeeFollowUpHistoryResponse {
  return { enrollmentId: ENROLLMENT_ID, remainingPaise, items };
}

/** A stateful history: GET reads it; log, edit, and done change it. */
function followUpRoutes(initial: FeeFollowUpHistoryResponse) {
  let state = initial;
  const close = (
    item: FeeFollowUpResponse,
    reason: "superseded" | "done",
  ): FeeFollowUpResponse => ({
    ...item,
    open: false,
    closedAt: new Date().toISOString(),
    closeReason: reason,
  });
  return {
    [`GET ${HISTORY_PATH}`]: () => ({ json: state }),
    [`POST ${HISTORY_PATH}`]: ({ body }: { body: unknown }) => {
      const input = body as FeeFollowUpInput;
      const created = followUp({
        id: "cc0e8400-e29b-41d4-a716-446655440099",
        channel: input.channel,
        note: input.note ?? null,
        nextFollowUpOn: input.nextFollowUpOn ?? null,
        open: true,
        loggedAt: new Date().toISOString(),
      });
      state = {
        ...state,
        items: [
          created,
          ...state.items.map((item) =>
            item.open ? close(item, "superseded") : item,
          ),
        ],
      };
      return { status: 201, json: created };
    },
    [`POST /fee-follow-ups/${OPEN_ID}/edit`]: ({ body }: { body: unknown }) => {
      const input = body as FeeFollowUpInput;
      const items = state.items.map((item) =>
        item.id === OPEN_ID
          ? {
              ...item,
              channel: input.channel,
              note: input.note ?? null,
              nextFollowUpOn: input.nextFollowUpOn ?? null,
              editedAt: new Date().toISOString(),
              editedBy: OWNER,
            }
          : item,
      );
      state = { ...state, items };
      return { json: items.find((item) => item.id === OPEN_ID) };
    },
    [`POST /fee-follow-ups/${OPEN_ID}/done`]: () => {
      const items = state.items.map((item) =>
        item.id === OPEN_ID ? close(item, "done") : item,
      );
      state = { ...state, items };
      return { json: items.find((item) => item.id === OPEN_ID) };
    },
    "GET /dashboard": () => ({ json: {} }),
  } satisfies Record<string, Route>;
}

function CardFrame() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-6">
      <FeeFollowUpsCard enrollmentId={ENROLLMENT_ID} timezone={TIMEZONE} />
    </div>
  );
}

const meta = {
  title: "Pages/Enrollments/Fee Follow-ups",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: `/enrollments/${ENROLLMENT_ID}` } },
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
  },
  render: () => <CardFrame />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ----------------------------- stories ----------------------------- */

export const LogFollowUp: Story = {
  beforeEach: () => mockApi(followUpRoutes(history([supersededFollowUp]))),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Log a follow-up" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("radio", { name: "Phone" }));
    await userEvent.type(
      canvas.getByLabelText("Note (optional)"),
      "Called parent, will pay Saturday",
    );
    await expect(canvas.getByText("32/500")).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Next follow-up date (optional)"),
      addDays(today, 2),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    await waitFor(() =>
      expect(callsTo(`POST ${HISTORY_PATH}`)[0]?.body).toEqual({
        channel: "phone",
        note: "Called parent, will pay Saturday",
        nextFollowUpOn: addDays(today, 2),
      }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      `Fee Follow-up logged. Next follow-up on ${followUpDateLabel(addDays(today, 2))}.`,
    );
    // The new one is open; the older one reads as replaced.
    await expect(
      await canvas.findByText("Called parent, will pay Saturday"),
    ).toBeVisible();
    await expect(canvas.getByText("Open")).toBeVisible();
    await expect(
      canvas.getAllByText("Replaced by a newer follow-up").length,
    ).toBe(1);
    // The form is reset for the next one.
    await expect(canvas.getByLabelText("Note (optional)")).toHaveValue("");
    await expect(
      canvas.getByRole("radio", { name: "Phone" }),
    ).not.toBeChecked();
  },
};

export const ChannelRequired: Story = {
  beforeEach: () => mockApi(followUpRoutes(history([]))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Note (optional)"),
      "Called, no answer",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    await expect(
      await canvas.findByText("Choose how you followed up"),
    ).toBeVisible();
    await expect(callsTo(`POST ${HISTORY_PATH}`)).toHaveLength(0);
  },
};

export const PastDateRefused: Story = {
  beforeEach: () => mockApi(followUpRoutes(history([]))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("radio", { name: "In person" }),
    );
    await userEvent.type(
      canvas.getByLabelText("Next follow-up date (optional)"),
      addDays(today, -1),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    await expect(
      await canvas.findByText("Choose today or a later date"),
    ).toBeVisible();
    await expect(callsTo(`POST ${HISTORY_PATH}`)).toHaveLength(0);
  },
};

export const ServerRefusesDate: Story = {
  beforeEach: () =>
    mockApi({
      ...followUpRoutes(history([])),
      [`POST ${HISTORY_PATH}`]: () => ({
        status: 400,
        json: {
          code: "FEE_FOLLOW_UP_DATE_IN_PAST",
          message: "The next follow-up date can't be in the past.",
        },
      }),
    }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("radio", { name: "Other" }));
    await userEvent.type(
      canvas.getByLabelText("Next follow-up date (optional)"),
      today,
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    await expect(
      await canvas.findByText("Choose today or a later date"),
    ).toBeVisible();
    await expect(canvas.queryByRole("status")).toBeNull();
  },
};

export const History: Story = {
  beforeEach: () =>
    mockApi(
      followUpRoutes(
        history([
          openFollowUp,
          supersededFollowUp,
          doneFollowUp,
          duesClearedFollowUp,
        ]),
      ),
    ),
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Fee Follow-up history" }),
    );
    const entries = list.getAllByRole("listitem");
    await expect(entries).toHaveLength(4);
    await expect(entries[0]).toHaveTextContent("WhatsApp/SMS");
    await expect(entries[0]).toHaveTextContent("Open");
    await expect(entries[0]).toHaveTextContent(
      `Next follow-up: ${followUpDateLabel(addDays(today, 2))}`,
    );
    await expect(entries[0]).toHaveTextContent(`Logged by ${OWNER.name}`);
    await expect(entries[0]).toHaveTextContent(`Edited by ${PARTNER.name}`);
    await expect(entries[1]).toHaveTextContent("Replaced by a newer follow-up");
    await expect(entries[2]).toHaveTextContent("Marked done");
    await expect(entries[2]).toHaveTextContent("No next follow-up date");
    await expect(entries[3]).toHaveTextContent("Dues paid");
    // Only the open one has actions.
    await expect(list.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    await expect(
      list.getAllByRole("button", { name: "Mark done" }),
    ).toHaveLength(1);
    for (const closed of entries.slice(1)) {
      await expect(within(closed).queryByRole("button")).toBeNull();
    }
  },
};

export const EditOpenFollowUp: Story = {
  beforeEach: () =>
    mockApi(followUpRoutes(history([openFollowUp, supersededFollowUp]))),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Edit" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Fee Follow-up" }),
    );
    await expect(
      dialog.getByRole("radio", { name: "WhatsApp/SMS" }),
    ).toBeChecked();
    const note = dialog.getByLabelText("Note (optional)");
    await expect(note).toHaveValue(openFollowUp.note);
    await expect(
      dialog.getByLabelText("Next follow-up date (optional)"),
    ).toHaveValue(addDays(today, 2));
    await userEvent.click(dialog.getByRole("radio", { name: "Phone" }));
    await userEvent.clear(note);
    await userEvent.type(note, "Father asked for one more week");
    await userEvent.clear(
      dialog.getByLabelText("Next follow-up date (optional)"),
    );
    await userEvent.type(
      dialog.getByLabelText("Next follow-up date (optional)"),
      addDays(today, 7),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(callsTo(`POST /fee-follow-ups/${OPEN_ID}/edit`)[0]?.body).toEqual({
        channel: "phone",
        note: "Father asked for one more week",
        nextFollowUpOn: addDays(today, 7),
      }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Edit Fee Follow-up" }),
      ).toBeNull(),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Fee Follow-up updated.",
    );
    await expect(
      await canvas.findByText("Father asked for one more week"),
    ).toBeVisible();
    await expect(
      await canvas.findByText(`Edited by ${OWNER.name}`, { exact: false }),
    ).toBeVisible();
  },
};

export const MarkDone: Story = {
  beforeEach: () =>
    mockApi(followUpRoutes(history([openFollowUp, supersededFollowUp]))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark done" }),
    );
    await waitFor(() =>
      expect(callsTo(`POST /fee-follow-ups/${OPEN_ID}/done`)).toHaveLength(1),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Fee Follow-up marked done.",
    );
    await expect(await canvas.findByText("Marked done")).toBeVisible();
    await expect(canvas.queryByText("Open")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Edit" })).toBeNull();
  },
};

export const AlreadyClosed: Story = {
  beforeEach: () => {
    let closed = false;
    const routes = followUpRoutes(history([openFollowUp]));
    return mockApi({
      ...routes,
      [`GET ${HISTORY_PATH}`]: () => ({
        json: closed
          ? history([
              {
                ...openFollowUp,
                open: false,
                closedAt: new Date().toISOString(),
                closeReason: "done",
              },
            ])
          : history([openFollowUp]),
      }),
      [`POST /fee-follow-ups/${OPEN_ID}/done`]: () => {
        closed = true;
        return {
          status: 409,
          json: {
            code: "FEE_FOLLOW_UP_CLOSED",
            message: "This follow-up is closed and can't be changed.",
          },
        };
      },
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark done" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This Fee Follow-up was already closed.",
    );
    // The history is read again and shows it closed.
    await expect(await canvas.findByText("Marked done")).toBeVisible();
    await expect(callsTo(`GET ${HISTORY_PATH}`).length).toBeGreaterThan(1);
  },
};

export const EmptyHistory: Story = {
  beforeEach: () => mockApi(followUpRoutes(history([]))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No follow-ups yet.")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Log follow-up" }),
    ).toBeVisible();
  },
};

export const NoDuesLeft: Story = {
  beforeEach: () =>
    mockApi(followUpRoutes(history([doneFollowUp, duesClearedFollowUp], 0))),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No dues left. Fee Follow-ups close once the dues are paid.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Log follow-up" }),
    ).toBeNull();
    await expect(canvas.queryByRole("radio")).toBeNull();
    await expect(canvas.getByText("Dues paid")).toBeVisible();
  },
};

/* --------------------- On the Enrollment page --------------------- */

const enrollment: EnrollmentResponse = {
  id: ENROLLMENT_ID,
  studentId: STUDENT_ID,
  courseId: COURSE_ID,
  batchId: BATCH_ID,
  classModeOverride: null,
  timingSource: "batch",
  studentTimings: null,
  endedAt: null,
  feePlanType: "installments",
  feePlanAmountPaise: 900000,
  feePlanConcessionPaise: 0,
  feePlanInstallmentCount: 3,
  feePlanDueDates: [
    { dueOn: addDays(today, -40), amountPaise: 300000 },
    { dueOn: addDays(today, -10), amountPaise: 300000 },
    { dueOn: addDays(today, 20), amountPaise: 300000 },
  ],
  remainingDuesPaise: 450000,
  createdAt: at(addDays(today, -45)),
  updatedAt: at(addDays(today, -45)),
  createdByUserId: OWNER.userId,
};

const payments: FeePaymentListResponse = {
  items: [
    {
      id: "dd0e8400-e29b-41d4-a716-446655440001",
      enrollmentId: ENROLLMENT_ID,
      amountPaise: 450000,
      method: "upi",
      paidAt: at(addDays(today, -38)),
      receiptNumber: "R-0042",
      recordedByUserId: OWNER.userId,
      createdAt: at(addDays(today, -38)),
    },
  ],
  nextCursor: null,
  prevCursor: null,
  total: 1,
};

const emptyParent = {
  salutation: null,
  gender: null,
  name: null,
  primaryPhone: null,
  alternatePhone: null,
  occupation: null,
  email: null,
};

const student: StudentResponse = {
  id: STUDENT_ID,
  name: "Anita Sharma",
  phone: "+91 98450 12345",
  email: null,
  photoUrl: null,
  address: null,
  idProofNote: null,
  guardianName: null,
  guardianPhone: null,
  details: {
    salutation: null,
    gender: null,
    dateOfBirth: null,
    educationStatus: null,
    currentInstitution: null,
    currentGrade: null,
    schoolBoard: null,
    highestQualification: null,
    father: emptyParent,
    mother: emptyParent,
    guardians: [],
    emergencyPhone: null,
  },
  droppedAt: null,
  createdAt: at(addDays(today, -45)),
  updatedAt: at(addDays(today, -45)),
  createdByUserId: OWNER.userId,
};

const batch: BatchResponse = {
  id: BATCH_ID,
  courseId: COURSE_ID,
  name: "DCA Weekday 9–11",
  classMode: "offline",
  capacity: 20,
  room: null,
  joinUrl: null,
  meetingOption: "external",
  timings: [{ daysOfWeek: [1, 3, 5], startTime: "09:00", endTime: "11:00" }],
  timezone: TIMEZONE,
  closedAt: null,
  enrolledCount: 14,
  createdAt: at(addDays(today, -60)),
  updatedAt: at(addDays(today, -60)),
  createdByUserId: OWNER.userId,
};

const course: CourseResponse = {
  id: COURSE_ID,
  name: "DCA",
  duration: { kind: "fixed", value: 6, unit: "months" },
  code: null,
  category: null,
  totalLearningHours: null,
  eligibility: null,
  learningOutcomes: [],
  syllabusOutline: [],
  description: null,
  defaultFeeAmountPaise: 900000,
  archivedAt: null,
  createdAt: at(addDays(today, -90)),
  updatedAt: at(addDays(today, -90)),
  createdByUserId: OWNER.userId,
};

const batches: BatchListResponse = {
  items: [batch],
  nextCursor: null,
  prevCursor: null,
  total: 1,
};

export const OnEnrollmentPage: Story = {
  beforeEach: () =>
    mockApi({
      ...followUpRoutes(history([openFollowUp, supersededFollowUp])),
      [`GET /enrollments/${ENROLLMENT_ID}`]: () => ({ json: enrollment }),
      [`GET /enrollments/${ENROLLMENT_ID}/payments`]: () => ({
        json: payments,
      }),
      [`GET /students/${STUDENT_ID}`]: () => ({ json: student }),
      [`GET /batches/${BATCH_ID}`]: () => ({ json: batch }),
      [`GET /courses/${COURSE_ID}`]: () => ({ json: course }),
      "GET /batches": () => ({ json: batches }),
    }),
  render: () => <EnrollmentDetailScreen enrollmentId={ENROLLMENT_ID} />,
  play: async ({ canvas }) => {
    const section = within(
      await canvas.findByRole("region", { name: "Fee Follow-ups" }),
    );
    await expect(
      await section.findByRole("heading", { name: "Log a follow-up" }),
    ).toBeVisible();
    await expect(section.getByText("Open")).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Fee Payments" }),
    ).toBeVisible();
  },
};
