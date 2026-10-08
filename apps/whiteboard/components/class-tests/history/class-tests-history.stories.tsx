import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import { StudentProfileScreen } from "@/components/students/student-profile-view";
import type { BatchListResponse } from "@/src/queries/batches";
import type { CourseListResponse } from "@/src/queries/courses";
import type { StudentResponse } from "@/src/queries/students";
import { signInAs } from "../../../.storybook/mocks/auth";

import {
  absentTest,
  blankDraftTest,
  dcaBatch,
  draftTest,
  exemptTest,
  failedTest,
  HISTORY_BATCH_ID,
  HISTORY_STUDENT_ID,
  historyView,
  noPassMarkTest,
  singleStudentTest,
} from "./fixtures";
import {
  TEST_HISTORY_DRAFT_NOTE,
  TEST_HISTORY_EMPTY_MESSAGE,
  TEST_HISTORY_FORBIDDEN_MESSAGE,
} from "./student-test-history";
import { StudentTestHistoryScreen } from "./student-test-history-screen";

/* ------------------------------------------------------------------ */
/* API mock: answers /api/training-institute/* from story routes   */
/* ------------------------------------------------------------------ */

type Reply = { status?: number; json: unknown };
type Route = () => Reply;

let requests = 0;

function mockApi(routes: Record<string, Route>) {
  requests = 0;
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
    const handler = routes[`${(init?.method ?? "GET").toUpperCase()} ${path}`];
    if (handler == null) return original(input, init);
    requests += 1;
    const reply = handler();
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

const HISTORY_ROUTE = `GET /students/${HISTORY_STUDENT_ID}/tests`;
const TEACHER_TESTS = `/teacher/batches/${HISTORY_BATCH_ID}/tests`;

const historyRoute = (reply: Reply): Record<string, Route> => ({
  [HISTORY_ROUTE]: () => reply,
});

function TeacherPage() {
  return (
    <AppShell>
      <StudentTestHistoryScreen
        studentId={HISTORY_STUDENT_ID}
        testsBasePath="/teacher/batches"
        backHref={TEACHER_TESTS}
      />
    </AppShell>
  );
}

function rowFor(list: HTMLElement, testName: string) {
  const link = within(list).getByRole("link", { name: testName });
  const row = link.closest("li");
  if (row == null) throw new Error(`No row for ${testName}`);
  return within(row);
}

/* ------------------------------ meta ------------------------------ */

const meta = {
  title: "Pages/Test history (staff)",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/teacher/batches/${HISTORY_BATCH_ID}/students/${HISTORY_STUDENT_ID}`,
      },
    },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/* ----------------------------- stories ---------------------------- */

export const TeacherHistory: Story = {
  beforeEach: () => mockApi(historyRoute({ json: historyView() })),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Asha Rao · Tests in your Batches"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Test history" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Tests" }),
    ).toHaveAttribute("href", TEACHER_TESTS);

    const list = canvas.getByRole("list", { name: "Tests" });
    const rows = within(list).getAllByRole("listitem");
    await expect(rows).toHaveLength(7);
    // Newest first, as the server sends them.
    await expect(rows[0]).toHaveTextContent(draftTest.name);
    await expect(rows[6]).toHaveTextContent(noPassMarkTest.name);

    // A draft is marked, so staff know families can't see it yet.
    const draft = rowFor(list, draftTest.name);
    await expect(draft.getByText("Draft")).toBeVisible();
    await expect(draft.getByText("41.5 / 50")).toBeVisible();
    await expect(draft.getByText("7 Oct 2026")).toBeVisible();
    await expect(
      draft.getByRole("link", { name: draftTest.name }),
    ).toHaveAttribute(
      "href",
      `/teacher/batches/${HISTORY_BATCH_ID}/tests/${draftTest.id}`,
    );
    await expect(canvas.getByText(TEST_HISTORY_DRAFT_NOTE)).toBeVisible();
    await expect(canvas.getByText("7 Tests · 2 Drafts")).toBeVisible();

    const blank = rowFor(list, blankDraftTest.name);
    await expect(blank.getByText("Draft")).toBeVisible();
    await expect(blank.getByText("Not entered yet")).toBeVisible();
    await expect(blank.getByText(/Tally Evening/)).toBeVisible();
    await expect(
      blank.getByRole("link", { name: blankDraftTest.name }),
    ).toHaveAttribute(
      "href",
      `/teacher/batches/${blankDraftTest.batch.id}/tests/${blankDraftTest.id}`,
    );

    const single = rowFor(list, singleStudentTest.name);
    await expect(single.getByText("Single-student test")).toBeVisible();
    await expect(single.queryByText("Draft")).toBeNull();
    await expect(single.getByText("34 / 50")).toBeVisible();
    await expect(single.getByText(/^Pass/)).toBeVisible();

    const failed = rowFor(list, failedTest.name);
    await expect(failed.queryByText("Draft")).toBeNull();
    await expect(failed.queryByText("Single-student test")).toBeNull();
    await expect(failed.getByText("14 / 50")).toBeVisible();
    await expect(failed.getByText("Fail · pass mark 20")).toBeVisible();
    await expect(
      failed.getByText("Revise mail merge and page setup."),
    ).toBeVisible();
    await expect(failed.getByText(/DCA Weekday 10–11/)).toBeVisible();

    const absent = rowFor(list, absentTest.name);
    await expect(absent.getByText("Absent")).toBeVisible();
    await expect(absent.queryByText(/Pass|Fail/)).toBeNull();
    await expect(absent.getByText("Was unwell.")).toBeVisible();

    const exempt = rowFor(list, exemptTest.name);
    await expect(exempt.getByText("Exempt")).toBeVisible();
    await expect(exempt.queryByText(/Pass|Fail/)).toBeNull();

    // No pass mark: the score alone.
    const noPass = rowFor(list, noPassMarkTest.name);
    await expect(noPass.getByText("9 / 10")).toBeVisible();
    await expect(noPass.queryByText(/Pass|Fail/)).toBeNull();
  },
};

export const PublishedOnly: Story = {
  beforeEach: () =>
    mockApi(
      historyRoute({
        json: historyView({ tests: [failedTest, absentTest] }),
      }),
    ),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(failedTest.name)).toBeVisible();
    await expect(canvas.queryByText("Draft")).toBeNull();
    await expect(canvas.queryByText(TEST_HISTORY_DRAFT_NOTE)).toBeNull();
    await expect(canvas.getByText("2 Tests")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: () => mockApi(historyRoute({ json: historyView({ tests: [] }) })),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(TEST_HISTORY_EMPTY_MESSAGE),
    ).toBeVisible();
    await expect(
      canvas.getByText("Asha Rao · Tests in your Batches"),
    ).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "Tests" })).toBeNull();
  },
};

export const TeacherNotAssigned: Story = {
  beforeEach: () =>
    mockApi(
      historyRoute({
        status: 403,
        json: { code: "FORBIDDEN", message: "Forbidden" },
      }),
    ),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(TEST_HISTORY_FORBIDDEN_MESSAGE),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Test history" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Tests" }),
    ).toHaveAttribute("href", TEACHER_TESTS);
    // Not a glitch: nothing to retry.
    await expect(
      canvas.queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    await expect(canvas.queryByText("Couldn't load this page")).toBeNull();
  },
};

export const LoadFailed: Story = {
  beforeEach: () =>
    mockApi(
      historyRoute({
        status: 500,
        json: { code: "INTERNAL", message: "Something went wrong" },
      }),
    ),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Couldn’t load Test history."),
    ).toBeVisible();
    const before = requests;
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requests).toBeGreaterThan(before));
    await expect(
      await canvas.findByText("Couldn’t load Test history."),
    ).toBeVisible();
  },
};

/* ------------------------- Owner's profile ------------------------- */

const NOW = "2026-09-12T12:00:00.000Z";
const emptyParent = {
  salutation: null,
  gender: null,
  name: null,
  primaryPhone: null,
  alternatePhone: null,
  occupation: null,
  email: null,
};

const profileStudent: StudentResponse = {
  id: HISTORY_STUDENT_ID,
  name: "Asha Rao",
  phone: "9876543210",
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
  createdAt: NOW,
  updatedAt: NOW,
  createdByUserId: "user_owner",
  enrollments: [],
};

const emptyList = { items: [], nextCursor: null, prevCursor: null, total: 0 };

function profileRoutes(history: Reply): Record<string, Route> {
  return {
    [`GET /students/${HISTORY_STUDENT_ID}`]: () => ({ json: profileStudent }),
    "GET /courses": () => ({ json: emptyList satisfies CourseListResponse }),
    "GET /batches": () => ({ json: emptyList satisfies BatchListResponse }),
    [`GET /students/${HISTORY_STUDENT_ID}/attendance`]: () => ({
      json: emptyList,
    }),
    [HISTORY_ROUTE]: () => history,
  };
}

function OwnerProfilePage() {
  return (
    <AppShell>
      <StudentProfileScreen studentId={HISTORY_STUDENT_ID} />
    </AppShell>
  );
}

const ownerProfile = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/students/${HISTORY_STUDENT_ID}` },
    },
  },
};

function signInAsOwner() {
  signInAs("owner", { name: "Riverside Centre" });
}

export const OwnerProfile: Story = {
  ...ownerProfile,
  beforeEach() {
    signInAsOwner();
    return mockApi(profileRoutes({ json: historyView() }));
  },
  render: () => <OwnerProfilePage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Asha Rao", level: 1 }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Attendance history" }),
    ).toBeVisible();
    const section = within(
      canvas.getByRole("region", { name: "Test history" }),
    );
    const list = await section.findByRole("list", { name: "Tests" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    // The Owner opens a Test from the Batches area.
    await expect(
      within(list).getByRole("link", { name: failedTest.name }),
    ).toHaveAttribute("href", `/batches/${dcaBatch.id}/tests/${failedTest.id}`);
    await expect(section.getAllByText("Draft")).toHaveLength(2);
  },
};

export const OwnerProfileNoTests: Story = {
  ...ownerProfile,
  beforeEach() {
    signInAsOwner();
    return mockApi(profileRoutes({ json: historyView({ tests: [] }) }));
  },
  render: () => <OwnerProfilePage />,
  play: async ({ canvas }) => {
    const section = within(
      await canvas.findByRole("region", { name: "Test history" }),
    );
    await expect(
      await section.findByText(TEST_HISTORY_EMPTY_MESSAGE),
    ).toBeVisible();
  },
};

/** A failed history read leaves the rest of the profile working. */
export const OwnerProfileHistoryFailed: Story = {
  ...ownerProfile,
  beforeEach() {
    signInAsOwner();
    return mockApi(
      profileRoutes({
        status: 500,
        json: { code: "INTERNAL", message: "Something went wrong" },
      }),
    );
  },
  render: () => <OwnerProfilePage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Asha Rao", level: 1 }),
    ).toBeVisible();
    const section = within(
      canvas.getByRole("region", { name: "Test history" }),
    );
    await expect(
      await section.findByText("Couldn’t load Test history."),
    ).toBeVisible();
    await expect(canvas.queryByText("Couldn't load this page")).toBeNull();
    await expect(
      canvas.getByRole("heading", { name: "Attendance history" }),
    ).toBeVisible();
  },
};
