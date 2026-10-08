import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import {
  DRAFT_VISIBILITY_NOTE,
  PUBLISH_CONFIRMATION,
  PUBLISHED_EDIT_NOTE,
} from "@/components/class-tests/result-format";
import { QuerySuspense } from "@/components/query-suspense";
import type {
  BatchTestsView,
  ClassTestDetailView,
  TestResultInput,
} from "@/src/queries/class-tests";
import { signInAs } from "../../../.storybook/mocks/auth";

import { BatchTestsScreen } from "./batch-tests-screen";
import {
  BATCH_ID,
  OWNER_TESTS,
  RETEST_ID,
  TEACHER_STUDENTS,
  TEACHER_TESTS,
  UNIT_1_ID,
  UNIT_2_ID,
  arjun,
  asha,
  at,
  batch,
  batchTestsView,
  completeDraftDetail,
  draftDetail,
  publishedDetail,
  retest,
  unit1,
  unit2,
} from "./class-tests-staff.fixtures";
import { TestDetailScreen } from "./test-detail-screen";

/* ------------------------------------------------------------------ */
/* API mock: answers /api/training-institute/* from story routes   */
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

/* ------------------------------ meta ------------------------------ */

const meta = {
  title: "Pages/Tests (staff)",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: TEACHER_TESTS } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const batchRoute = (view: BatchTestsView): Record<string, Route> => ({
  [`GET /batches/${BATCH_ID}/tests`]: () => ({ json: view }),
});

const detailRoute = (view: ClassTestDetailView): Record<string, Route> => ({
  [`GET /tests/${view.test.id}`]: () => ({ json: view }),
});

/** The detail the server would return after saving `results`. */
function withResults(
  view: ClassTestDetailView,
  results: TestResultInput[],
): ClassTestDetailView {
  return {
    ...view,
    rows: view.rows.map((row) => {
      const input = results.find((item) => item.studentId === row.student.id);
      if (input?.status == null) return { ...row, result: null };
      return {
        ...row,
        result: {
          status: input.status,
          marks: input.marks,
          remark: input.remark,
          passed:
            view.test.passMarks == null || input.marks == null
              ? null
              : input.marks >= view.test.passMarks,
          updatedAt: at("2026-10-07", "12:00"),
        },
      };
    }),
  };
}

function TeacherTests() {
  return (
    <AppShell>
      <BatchTestsScreen batchId={BATCH_ID} basePath={TEACHER_TESTS} />
    </AppShell>
  );
}

function TeacherTest({ testId }: { testId: string }) {
  return (
    <AppShell>
      <TestDetailScreen
        testId={testId}
        testsPath={TEACHER_TESTS}
        studentBasePath={TEACHER_STUDENTS}
      />
    </AppShell>
  );
}

function testPage(testId: string) {
  return {
    nextjs: { navigation: { pathname: `${TEACHER_TESTS}/${testId}` } },
  };
}

/* --------------------------- Batch Tests -------------------------- */

export const BatchTests: Story = {
  beforeEach: () => mockApi(batchRoute(batchTestsView())),
  render: () => <TeacherTests />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Tests" }),
    ).toBeVisible();
    await expect(canvas.getByText("DCA · DCA Weekday 10–11")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to My Batches" }),
    ).toHaveAttribute("href", "/teacher");
    await expect(
      canvas.getByRole("button", { name: "Create test" }),
    ).toBeVisible();

    const articles = canvas.getAllByRole("article");
    await expect(
      articles.map((article) => article.getAttribute("aria-label")),
    ).toEqual([unit2.name, retest.name, unit1.name]);

    const draft = within(canvas.getByRole("article", { name: unit2.name }));
    await expect(draft.getByText("Draft")).toBeVisible();
    await expect(draft.getByText("Tue, 6 Oct")).toBeVisible();
    await expect(draft.getByText("Out of 50")).toBeVisible();
    await expect(draft.getByText("Pass mark 20")).toBeVisible();
    await expect(draft.getByText("4 of 6 entered")).toBeVisible();
    await expect(draft.getByText("3 of 6 tested")).toBeVisible();
    await expect(draft.getByText("Average").nextSibling).toHaveTextContent(
      "31.5",
    );
    await expect(draft.getByText("Highest").nextSibling).toHaveTextContent(
      "44",
    );
    await expect(draft.getByText("Lowest").nextSibling).toHaveTextContent(
      "12.5",
    );
    await expect(
      draft.getByText("Below pass mark").nextSibling,
    ).toHaveTextContent("Divya Raj (12.5)");
    await expect(draft.getByText("Absent").nextSibling).toHaveTextContent(
      "Fathima Begum",
    );
    await expect(
      draft.getByRole("link", { name: `Enter marks for ${unit2.name}` }),
    ).toHaveAttribute("href", `${TEACHER_TESTS}/${UNIT_2_ID}`);

    const published = within(canvas.getByRole("article", { name: unit1.name }));
    await expect(published.getByText("Published")).toBeVisible();
    await expect(published.queryByText(/entered/)).toBeNull();
    await expect(published.getByText("4 of 6 tested")).toBeVisible();
    await expect(published.getByText("Exempt").nextSibling).toHaveTextContent(
      "Priya Sharma",
    );
    await expect(
      published.getByRole("link", { name: `Open ${unit1.name}` }),
    ).toHaveAttribute("href", `${TEACHER_TESTS}/${UNIT_1_ID}`);

    const single = within(canvas.getByRole("article", { name: retest.name }));
    await expect(
      single.getByText("Single-student test · Ravi Kumar"),
    ).toBeVisible();
    await expect(
      single.getByText("Single-student Tests are left out of Batch numbers."),
    ).toBeVisible();
    await expect(single.queryByText("Average")).toBeNull();
    await expect(
      single.getByRole("link", { name: `Open ${retest.name}` }),
    ).toHaveAttribute("href", `${TEACHER_TESTS}/${RETEST_ID}`);
  },
};

export const NoTestsYet: Story = {
  beforeEach: () => mockApi(batchRoute(batchTestsView({ tests: [] }))),
  render: () => <TeacherTests />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("No Tests yet")).toBeVisible();
    await expect(
      canvas.getByText(/Students and Parents see only their own results/),
    ).toBeVisible();
    // Only the empty state offers it, not the header too.
    await userEvent.click(canvas.getByRole("button", { name: "Create test" }));
    const dialog = await body.findByRole("dialog", { name: "Create test" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const ClosedBatch: Story = {
  parameters: { nextjs: { navigation: { pathname: OWNER_TESTS } } },
  beforeEach: () => {
    signInAs("owner", { name: "Riverside Centre" });
    return mockApi(
      batchRoute(
        batchTestsView({
          batch: { ...batch, closed: true },
          canCreate: false,
        }),
      ),
    );
  },
  render: () => (
    <AppShell>
      <BatchTestsScreen batchId={BATCH_ID} basePath={OWNER_TESTS} />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Closed")).toBeVisible();
    await expect(
      canvas.getByText(/This Batch is closed, so new Tests can’t be added/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Create test" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Back to Batches" }),
    ).toHaveAttribute("href", "/batches");
    await expect(
      canvas.getByRole("link", { name: `Enter marks for ${unit2.name}` }),
    ).toHaveAttribute("href", `${OWNER_TESTS}/${UNIT_2_ID}`);
  },
};

export const CreateWholeBatchTest: Story = {
  beforeEach: () =>
    mockApi({
      ...batchRoute(batchTestsView()),
      [`POST /batches/${BATCH_ID}/tests`]: () => ({
        status: 201,
        json: draftDetail({
          test: { ...unit2, id: "new-test", name: "Unit test 3" },
        }),
      }),
    }),
  render: () => <TeacherTests />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create test" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Create test" }),
    );
    await expect(dialog.getByLabelText("Date")).toHaveValue("2026-10-07");
    await expect(
      dialog.getByRole("radio", { name: /Whole Batch/ }),
    ).toBeChecked();
    await expect(dialog.queryByLabelText("Student")).toBeNull();

    await userEvent.click(dialog.getByRole("button", { name: "Create test" }));
    await expect(await dialog.findByText("Give the Test a name")).toBeVisible();
    await expect(dialog.getByText("Enter the maximum marks")).toBeVisible();

    await userEvent.type(dialog.getByLabelText("Test name"), "Unit test 3");
    await userEvent.type(dialog.getByLabelText("Maximum marks"), "40");
    await userEvent.type(dialog.getByLabelText("Pass mark (optional)"), "45");
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-09");
    await userEvent.click(dialog.getByRole("button", { name: "Create test" }));
    await expect(
      await dialog.findByText("The pass mark can’t be above the maximum marks"),
    ).toBeVisible();
    await expect(
      dialog.getByText("A Test can’t be dated in the future"),
    ).toBeVisible();

    const pass = dialog.getByLabelText("Pass mark (optional)");
    await userEvent.clear(pass);
    await userEvent.type(pass, "16");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-05");
    await userEvent.type(
      dialog.getByLabelText("Topic or syllabus (optional)"),
      "Charts and pivot tables",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create test" }));
    await waitFor(() =>
      expect(callsTo(`POST /batches/${BATCH_ID}/tests`)[0]?.body).toEqual({
        name: "Unit test 3",
        heldOn: "2026-10-05",
        maxMarks: 40,
        passMarks: 16,
        topic: "Charts and pivot tables",
        studentId: null,
      }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `${TEACHER_TESTS}/new-test`,
      ),
    );
  },
};

export const CreateOneStudentTest: Story = {
  beforeEach: () =>
    mockApi({
      ...batchRoute(batchTestsView()),
      [`POST /batches/${BATCH_ID}/tests`]: () => ({
        status: 422,
        json: {
          code: "CLASS_TEST_STUDENT_NOT_IN_BATCH",
          message: "Asha Menon wasn't in this Batch on that date.",
        },
      }),
    }),
  render: () => <TeacherTests />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create test" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Create test" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Test name"),
      "Unit test 1 re-test",
    );
    await userEvent.type(dialog.getByLabelText("Maximum marks"), "50");
    await userEvent.click(dialog.getByRole("radio", { name: /One Student/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Create test" }));
    await expect(
      await dialog.findByText("Choose the Student this Test is for"),
    ).toBeVisible();

    // On 25 Sep, Ravi was still in the Batch and Sanjay hadn't joined.
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-09-25");
    await userEvent.click(dialog.getByLabelText("Student"));
    await expect(
      await body.findByRole("option", { name: "Ravi Kumar" }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("option", { name: "Sanjay Pillai" }),
    ).toBeNull();
    await userEvent.click(body.getByRole("option", { name: asha.name }));
    await userEvent.click(dialog.getByRole("button", { name: "Create test" }));
    await waitFor(() =>
      expect(callsTo(`POST /batches/${BATCH_ID}/tests`)[0]?.body).toEqual({
        name: "Unit test 1 re-test",
        heldOn: "2026-09-25",
        maxMarks: 50,
        passMarks: null,
        topic: null,
        studentId: asha.id,
      }),
    );
    await expect(
      await dialog.findByText("Asha Menon wasn't in this Batch on that date."),
    ).toBeVisible();
  },
};

/* ------------------------------ marks ----------------------------- */

export const DraftMarkEntry: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () => {
    const view = draftDetail();
    return mockApi({
      ...detailRoute(view),
      [`POST /tests/${UNIT_2_ID}/results`]: ({ body }) => ({
        json: withResults(
          view,
          (body as { results: TestResultInput[] }).results,
        ),
      }),
    });
  },
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: unit2.name }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Tests" }),
    ).toHaveAttribute("href", TEACHER_TESTS);
    await expect(canvas.getByText(DRAFT_VISIBILITY_NOTE)).toBeVisible();
    await expect(canvas.queryByText(PUBLISHED_EDIT_NOTE)).toBeNull();
    await expect(canvas.getByText(/Created by Meena Iyer/)).toBeVisible();
    await expect(canvas.getByText("All changes saved")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Save draft" }),
    ).toBeDisabled();

    const arjunRow = within(canvas.getByRole("listitem", { name: arjun.name }));
    await expect(
      arjunRow.getByRole("link", { name: arjun.name }),
    ).toHaveAttribute("href", `${TEACHER_STUDENTS}/${arjun.id}`);
    const arjunMarks = arjunRow.getByLabelText(`Marks for ${arjun.name}`);
    await userEvent.type(arjunMarks, "37.5");
    // Typing marks picks Scored.
    await expect(
      arjunRow.getByRole("button", { name: "Scored" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(arjunRow.getByText("Pass")).toBeVisible();

    // Enter moves to the next Student's marks.
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByLabelText(`Marks for ${asha.name}`)).toHaveFocus();

    const ashaRow = within(canvas.getByRole("listitem", { name: asha.name }));
    await userEvent.click(ashaRow.getByRole("button", { name: "Absent" }));
    await expect(
      ashaRow.getByLabelText(`Marks for ${asha.name}`),
    ).toBeDisabled();

    const sanjayRow = within(
      canvas.getByRole("listitem", { name: "Sanjay Pillai" }),
    );
    await userEvent.click(sanjayRow.getByRole("button", { name: "Exempt" }));
    await userEvent.type(
      sanjayRow.getByLabelText("Remark for Sanjay Pillai"),
      "Joined after this topic.",
    );
    await expect(canvas.getByText("6 of 6 entered")).toBeVisible();
    await expect(canvas.getByText("Unsaved changes")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(callsTo(`POST /tests/${UNIT_2_ID}/results`)[0]?.body).toEqual({
        results: [
          { studentId: arjun.id, status: "scored", marks: 37.5, remark: null },
          {
            studentId: asha.id,
            status: "absent",
            marks: null,
            remark: "Neat work.",
          },
          {
            studentId: draftDetail().rows[2]?.student.id,
            status: "scored",
            marks: 12.5,
            remark: null,
          },
          {
            studentId: draftDetail().rows[3]?.student.id,
            status: "absent",
            marks: null,
            remark: null,
          },
          {
            studentId: draftDetail().rows[4]?.student.id,
            status: "scored",
            marks: 38,
            remark: null,
          },
          {
            studentId: draftDetail().rows[5]?.student.id,
            status: "exempt",
            marks: null,
            remark: "Joined after this topic.",
          },
        ],
      }),
    );
    await expect(await canvas.findByText("All changes saved")).toBeVisible();
  },
};

export const SaveBlankDraftRows: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () => {
    const view = draftDetail();
    return mockApi({
      ...detailRoute(view),
      [`POST /tests/${UNIT_2_ID}/results`]: ({ body }) => ({
        json: withResults(
          view,
          (body as { results: TestResultInput[] }).results,
        ),
      }),
    });
  },
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas }) => {
    const ashaRow = within(
      await canvas.findByRole("listitem", { name: asha.name }),
    );
    const marks = ashaRow.getByLabelText(`Marks for ${asha.name}`);
    await userEvent.clear(marks);
    await userEvent.type(marks, "55");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(
      await ashaRow.findByText("Marks for Asha Menon must be from 0 to 50."),
    ).toBeVisible();
    await expect(callsTo(`POST /tests/${UNIT_2_ID}/results`)).toHaveLength(0);

    await userEvent.clear(marks);
    await userEvent.type(marks, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        (
          callsTo(`POST /tests/${UNIT_2_ID}/results`)[0]?.body as {
            results: TestResultInput[];
          }
        ).results[0],
      ).toEqual({
        studentId: arjun.id,
        status: null,
        marks: null,
        remark: null,
      }),
    );
  },
};

export const MarksServerError: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () =>
    mockApi({
      ...detailRoute(draftDetail()),
      [`POST /tests/${UNIT_2_ID}/results`]: () => ({
        status: 422,
        json: {
          code: "CLASS_TEST_MARKS_OUT_OF_RANGE",
          message: "Marks for Asha Menon must be from 0 to 40.",
        },
      }),
    }),
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas }) => {
    // Someone lowered the maximum to 40 in another tab; the server says so.
    const marks = await canvas.findByLabelText(`Marks for ${asha.name}`);
    await userEvent.clear(marks);
    await userEvent.type(marks, "45");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(
      "Marks for Asha Menon must be from 0 to 40.",
    );
    await waitFor(() => expect(marks).toHaveAttribute("aria-invalid", "true"));
    await expect(canvas.getByText("Unsaved changes")).toBeVisible();
  },
};

export const PublishNeedsEveryResult: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () => mockApi(detailRoute(draftDetail())),
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Publish" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(
        dialog.getByText(
          /Enter a result for Arjun Nair, Sanjay Pillai before publishing/,
        ),
      ).toBeVisible(),
    );
    await expect(dialog.queryByRole("button", { name: "Publish" })).toBeNull();
    await userEvent.click(
      dialog.getByRole("button", { name: "Back to marks" }),
    );
    await waitFor(() => expect(body.queryByRole("alertdialog")).toBeNull());
  },
};

export const PublishTest: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () => {
    const view = completeDraftDetail();
    return mockApi({
      ...detailRoute(view),
      [`POST /tests/${UNIT_2_ID}/results`]: ({ body }) => ({
        json: withResults(
          view,
          (body as { results: TestResultInput[] }).results,
        ),
      }),
      [`POST /tests/${UNIT_2_ID}/publish`]: () => ({
        json: {
          ...view,
          canDelete: false,
          test: { ...view.test, publishedAt: at("2026-10-07", "12:30") },
        },
      }),
    });
  },
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("button", { name: "Delete test" }),
    ).toBeVisible();
    const remark = canvas.getByLabelText(`Remark for ${arjun.name}`);
    await userEvent.type(remark, "Good improvement.");

    await userEvent.click(canvas.getByRole("button", { name: "Publish" }));
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(dialog.getByText(PUBLISH_CONFIRMATION)).toBeVisible(),
    );
    await expect(
      dialog.getByText("Your unsaved changes will be saved first."),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Save and publish" }),
    );
    await waitFor(() =>
      expect(callsTo(`POST /tests/${UNIT_2_ID}/publish`)).toHaveLength(1),
    );
    await expect(
      (
        callsTo(`POST /tests/${UNIT_2_ID}/results`)[0]?.body as {
          results: TestResultInput[];
        }
      ).results[0],
    ).toEqual({
      studentId: arjun.id,
      status: "scored",
      marks: 29,
      remark: "Good improvement.",
    });
    await expect(await canvas.findByText(PUBLISHED_EDIT_NOTE)).toBeVisible();
    await expect(canvas.queryByText(DRAFT_VISIBILITY_NOTE)).toBeNull();
    await expect(
      canvas.getByText("Published", { selector: "span" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Publish" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Delete test" }),
    ).toBeNull();
  },
};

export const PublishedWithChangeHistory: Story = {
  parameters: testPage(UNIT_1_ID),
  beforeEach: () => mockApi(detailRoute(publishedDetail())),
  render: () => <TeacherTest testId={UNIT_1_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText(PUBLISHED_EDIT_NOTE)).toBeVisible();
    await expect(canvas.queryByText(DRAFT_VISIBILITY_NOTE)).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Publish" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Delete test" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();

    const ashaRow = within(canvas.getByRole("listitem", { name: asha.name }));
    const changed = ashaRow.getByRole("button", { name: "Changed" });
    await expect(changed).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(changed);
    const history = within(
      ashaRow.getByRole("list", { name: "Changes to Asha Menon’s result" }),
    );
    await expect(history.getByText("34 / 50 → 38 / 50")).toBeVisible();
    await expect(
      history.getByText("Remark: none → “Retotalled.”"),
    ).toBeVisible();
    await expect(
      history.getByText(/^Meena Iyer · 25 Sep.*4:40\s?pm$/),
    ).toBeVisible();
    const arjunRow = within(canvas.getByRole("listitem", { name: arjun.name }));
    await expect(
      arjunRow.queryByRole("button", { name: "Changed" }),
    ).toBeNull();

    // A published row can't go back to blank.
    const scored = arjunRow.getByRole("button", { name: "Scored" });
    await userEvent.click(scored);
    await expect(scored).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(canvas.getByRole("button", { name: "Edit details" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit test details" }),
    );
    await expect(dialog.getByLabelText("Date")).toBeDisabled();
    await waitFor(() =>
      expect(
        dialog.getByText("The date can’t change after the Test is published."),
      ).toBeVisible(),
    );
    await expect(
      dialog.queryByRole("radio", { name: /One Student/ }),
    ).toBeNull();
  },
};

export const EditDetailsServerError: Story = {
  parameters: testPage(UNIT_1_ID),
  beforeEach: () =>
    mockApi({
      ...detailRoute(publishedDetail()),
      [`POST /tests/${UNIT_1_ID}/update`]: () => ({
        status: 422,
        json: {
          code: "CLASS_TEST_MAX_BELOW_MARKS",
          message: "Maximum marks can't be below a mark already entered (47).",
        },
      }),
    }),
  render: () => <TeacherTest testId={UNIT_1_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit details" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit test details" }),
    );
    await expect(dialog.getByLabelText("Test name")).toHaveValue(unit1.name);
    const max = dialog.getByLabelText("Maximum marks");
    await userEvent.clear(max);
    await userEvent.type(max, "40");
    await userEvent.click(dialog.getByRole("button", { name: "Save details" }));
    await expect(
      await dialog.findByText(
        "Maximum marks can't be below a mark already entered (47).",
      ),
    ).toBeVisible();
    await expect(callsTo(`POST /tests/${UNIT_1_ID}/update`)[0]?.body).toEqual({
      name: unit1.name,
      heldOn: unit1.heldOn,
      maxMarks: 40,
      passMarks: 20,
      topic: null,
    });
  },
};

export const DeleteDraftTest: Story = {
  parameters: testPage(UNIT_2_ID),
  beforeEach: () =>
    mockApi({
      ...detailRoute(draftDetail()),
      [`POST /tests/${UNIT_2_ID}/delete`]: () => ({
        json: { id: UNIT_2_ID },
      }),
    }),
  render: () => <TeacherTest testId={UNIT_2_ID} />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete test" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(
        dialog.getByText(/The Test and its saved marks are removed/),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete test" }));
    await waitFor(() =>
      expect(callsTo(`POST /tests/${UNIT_2_ID}/delete`)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(TEACHER_TESTS),
    );
  },
};
