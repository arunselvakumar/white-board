import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import type {
  FamilyClassWorkStudentView,
  FamilyClassWorkView,
  FamilyHomeworkView,
} from "@/src/queries/class-work";
import { clerkMocks } from "../../../.storybook/mocks/clerk";

import {
  ASHA_ID,
  CLASS_WORK_NOW,
  ashaClassWork,
  checkedHomework,
  dueTodayHomework,
  endedHomework,
  overdueHomework,
  raviClassWork,
  referenceHomework,
  submittedHomework,
} from "./family-class-work.fixtures";
import { FamilyHomework } from "./family-homework-screen";
import { HomeworkDetailScreen } from "./homework-detail-screen";

/* ------------------------------------------------------------------ */
/* API mock: answers /api/training-institute/* from story routes       */
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

/**
 * Serves the family read from `students` and keeps it in step with submit and
 * undo, so the refetch after a write shows the new state.
 */
function mockFamilyApi(
  students: FamilyClassWorkStudentView[],
  extra: Record<string, Route> = {},
) {
  let state: FamilyClassWorkView = structuredClone({ students });
  const replace = (updated: FamilyHomeworkView) => {
    state = {
      students: state.students.map((student) => ({
        ...student,
        homework: student.homework.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      })),
    };
  };
  const find = (id: string) =>
    state.students
      .flatMap((student) => student.homework)
      .find((item) => item.id === id);
  const routes: Record<string, Route> = {
    "GET /home/homework": () => ({ json: state }),
  };
  for (const item of students.flatMap((student) => student.homework)) {
    routes[`POST /homework/${item.id}/submit`] = ({ body }) => {
      const input = body as { note: string | null };
      const current = find(item.id) ?? item;
      const now = CLASS_WORK_NOW.toISOString();
      const updated: FamilyHomeworkView = {
        ...current,
        status: current.status === "overdue" ? "late" : "submitted",
        submission: {
          id: "c10e8400-e29b-41d4-a716-446655440099",
          note: input.note,
          submittedAt: current.submission?.submittedAt ?? now,
          submittedBy: "student",
          updatedAt: new Date(CLASS_WORK_NOW.getTime() + 60_000).toISOString(),
          late: current.status === "overdue",
          checkedAt: null,
          remark: null,
          attachments: current.submission?.attachments ?? [],
        },
      };
      replace(updated);
      return { json: updated };
    };
    routes[`POST /homework/${item.id}/undo-submission`] = () => {
      const current = find(item.id) ?? item;
      const updated: FamilyHomeworkView = {
        ...current,
        status: "due",
        submission: null,
      };
      replace(updated);
      return { json: updated };
    };
  }
  return mockApi({ ...routes, ...extra });
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

const meta = {
  title: "Pages/Student and Parent Homework",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/student/homework" } },
  },
  decorators: [withFreshQueryClient],
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.orgRole = "org:student";
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside Centre" } },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* --------------------------- Homework page -------------------------- */

export const StudentHomework: Story = {
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{ students: [ashaClassWork] }}
        role="org:student"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Homework" }),
    ).toBeVisible();
    for (const heading of [
      "Overdue (1)",
      "Due (3)",
      "Submitted (2)",
      "Checked (1)",
      "For reference (2)",
    ])
      await expect(
        canvas.getByRole("heading", { name: heading }),
      ).toBeVisible();

    const overdue = within(canvas.getByRole("region", { name: "Overdue (1)" }));
    await expect(overdue.getByText("Overdue")).toBeVisible();
    await expect(
      overdue.getByRole("link", { name: "Loops practice set" }),
    ).toHaveAttribute(
      "href",
      `/student/homework/${overdueHomework.id}?student=${ASHA_ID}`,
    );

    const due = within(canvas.getByRole("region", { name: "Due (3)" }));
    const dueLinks = due.getAllByRole("link");
    await expect(dueLinks.map((link) => link.textContent)).toEqual([
      "Functions worksheet",
      "Lists and tuples",
      "Mini project: calculator",
    ]);
    await expect(due.getByText("Due today")).toBeVisible();
    await expect(due.getByText("Due: Fri, 9 Oct")).toBeVisible();
    await expect(due.getAllByText(/Class: Mon, 5 Oct/)).toHaveLength(1);

    const submitted = within(
      canvas.getByRole("region", { name: "Submitted (2)" }),
    );
    await expect(submitted.getByText("Late")).toBeVisible();
    await expect(
      canvas.getByText("Good work. Check question 4 again."),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "You left Tally Morning. Items shared before you left are still here.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: /Homework/ }),
    ).toHaveAccessibleName(/^Homework\s*\(1 overdue\)$/);
  },
};

export const StudentStudyMaterial: Story = {
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{ students: [ashaClassWork] }}
        role="org:student"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Study Material" }));
    const list = within(
      await canvas.findByRole("list", { name: "Study Material" }),
    );
    const titles = list
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    await expect(titles).toEqual([
      "Loops notes",
      "Keyboard shortcuts",
      "Tally shortcuts",
    ]);
    await expect(
      list.getByText("Python · Python Evening · For Mon, 5 Oct’s Class"),
    ).toBeVisible();
    const link = list.getByRole("link", { name: /docs\.python\.org/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(
      list.getByRole("link", { name: "Download loops-worksheet.pdf" }),
    ).toBeVisible();
    const more = list.getByRole("button", { name: "Show more" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    await expect(
      list.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
};

export const ParentWithTwoStudents: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent/homework" } } },
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
  },
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{ students: [ashaClassWork, raviClassWork] }}
        role="org:parent"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    const asha = within(canvas.getByRole("region", { name: "Asha Kumar" }));
    await expect(
      asha.getByText(
        "Asha Kumar left Tally Morning. Items shared before they left are still here.",
      ),
    ).toBeVisible();
    await expect(
      asha.getByRole("link", { name: "Loops practice set" }),
    ).toHaveAttribute(
      "href",
      `/parent/homework/${overdueHomework.id}?student=${ASHA_ID}`,
    );
    const ravi = within(canvas.getByRole("region", { name: "Ravi Kumar" }));
    await expect(ravi.getByText("No Homework yet.")).toBeVisible();
    await userEvent.click(ravi.getByRole("tab", { name: "Study Material" }));
    await expect(await ravi.findByText("No Study Material yet.")).toBeVisible();
  },
};

export const StudentNotLinked: Story = {
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{ students: [] }}
        role="org:student"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Your Student record isn’t linked yet/),
    ).toBeVisible();
  },
};

export const ParentNotLinked: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent/homework" } } },
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
  },
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{ students: [] }}
        role="org:parent"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/No Students are linked to you yet/),
    ).toBeVisible();
  },
};

export const StudentWithoutBatches: Story = {
  render: () => (
    <AppShell>
      <FamilyHomework
        classWork={{
          students: [
            {
              id: ASHA_ID,
              name: "Asha Kumar",
              batches: [],
              homework: [],
              materials: [],
            },
          ],
        }}
        role="org:student"
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/You aren’t in a Batch yet/)).toBeVisible();
    await expect(canvas.queryByRole("tab")).toBeNull();
  },
};

/* --------------------------- Homework detail ------------------------ */

function detail(homeworkId: string, studentId: string | null = ASHA_ID) {
  return (
    <AppShell>
      <HomeworkDetailScreen
        role="org:student"
        homeworkId={homeworkId}
        studentId={studentId}
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  );
}

const detailParameters = {
  nextjs: { navigation: { pathname: "/student/homework/detail" } },
};

export const DetailDueSubmit: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(dueTodayHomework.id),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Functions worksheet" }),
    ).toBeVisible();
    await expect(canvas.getByText(/^From Monday’s Class/)).toBeVisible();
    await expect(canvas.getByText("Due today")).toBeVisible();
    await expect(
      canvas.getByText(/Then write one that finds the larger/),
    ).toBeVisible();
    await expect(
      canvas.getByText("Posted by Meena Iyer on Mon, 5 Oct"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download loops-worksheet.pdf" }),
    ).toBeVisible();

    await userEvent.type(
      canvas.getByLabelText(/Note/),
      "Both functions are in my notebook.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Mark as done" }));

    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Marked as done.",
    );
    await expect(
      callsTo(`POST /homework/${dueTodayHomework.id}/submit`),
    ).toEqual([
      {
        route: `POST /homework/${dueTodayHomework.id}/submit`,
        body: {
          studentId: ASHA_ID,
          note: "Both functions are in my notebook.",
          attachmentIds: [],
        },
      },
    ]);
    await expect(
      await canvas.findByRole("button", { name: "Save changes" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(canvas.getByText("Marked done by you")).toBeVisible();
    await expect(canvas.getByLabelText(/Note/)).toHaveValue(
      "Both functions are in my notebook.",
    );
  },
};

export const DetailNoteTooLong: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(dueTodayHomework.id),
  play: async ({ canvas }) => {
    const note = await canvas.findByLabelText(/Note/);
    await userEvent.click(note);
    await userEvent.paste("a".repeat(1001));
    await userEvent.click(canvas.getByRole("button", { name: "Mark as done" }));
    await expect(
      await canvas.findByText("Keep the note to 1000 characters or fewer"),
    ).toBeVisible();
    await expect(
      callsTo(`POST /homework/${dueTodayHomework.id}/submit`),
    ).toHaveLength(0);
  },
};

export const DetailSubmittedUndo: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(submittedHomework.id),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Variables recap" }),
    ).toBeVisible();
    await expect(canvas.getByText("Marked done by a Parent")).toBeVisible();
    await expect(canvas.getByLabelText(/Note/)).toHaveValue(
      "Done in the blue notebook.",
    );
    await expect(
      canvas.getByRole("button", { name: "Remove my-answers.jpg" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(
        callsTo(`POST /homework/${submittedHomework.id}/undo-submission`),
      ).toEqual([
        {
          route: `POST /homework/${submittedHomework.id}/undo-submission`,
          body: { studentId: ASHA_ID },
        },
      ]),
    );
    await expect(
      await canvas.findByRole("button", { name: "Mark as done" }),
    ).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent(/Undone/);
  },
};

export const DetailChecked: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(checkedHomework.id),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Good work. Check question 4 again."),
    ).toBeVisible();
    await expect(canvas.getByText(/can’t be changed now/)).toBeVisible();
    await expect(canvas.getByText("All five done.")).toBeVisible();
    await expect(
      canvas.getByText(/^Posted by the centre on Wed, 23 Sep/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Mark as done" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Undo" })).toBeNull();
    await expect(canvas.queryByLabelText(/Note/)).toBeNull();
  },
};

export const DetailOverdue: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(overdueHomework.id),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Loops practice set" }),
    ).toBeVisible();
    await expect(canvas.getByText("Due: Mon, 5 Oct")).toBeVisible();
    await expect(canvas.getAllByText("Overdue").length).toBeGreaterThan(0);
    await expect(canvas.getByText(/^From Friday’s Class/)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Mark as done" }),
    ).toBeVisible();
  },
};

export const DetailReference: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(referenceHomework.id),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/This was due before you joined/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/^From the Class on Thu, 10 Sep/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Mark as done" }),
    ).toBeVisible();
  },
};

export const DetailAccessEnded: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail(endedHomework.id),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Tally Morning has ended for you, so this can’t be submitted any more.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Mark as done" }),
    ).toBeNull();
  },
};

export const DetailParentView: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/parent/homework/detail" } },
  },
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
    return mockFamilyApi([ashaClassWork, raviClassWork]);
  },
  render: () => (
    <AppShell>
      <HomeworkDetailScreen
        role="org:parent"
        homeworkId={submittedHomework.id}
        studentId={ASHA_ID}
        now={CLASS_WORK_NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("For Asha Kumar")).toBeVisible();
    await expect(canvas.getByText("Asha Kumar’s work")).toBeVisible();
    await expect(canvas.getByText("Marked done by a Parent")).toBeVisible();
  },
};

export const DetailSubmitRejected: Story = {
  parameters: detailParameters,
  beforeEach: () =>
    mockFamilyApi([ashaClassWork], {
      [`POST /homework/${dueTodayHomework.id}/submit`]: () => ({
        status: 409,
        json: {
          code: "HOMEWORK_ACCESS_ENDED",
          message: "Python Evening has ended for this Student.",
        },
      }),
    }),
  render: () => detail(dueTodayHomework.id),
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark as done" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Python Evening has ended for this Student.",
    );
  },
};

export const DetailNotFound: Story = {
  parameters: detailParameters,
  beforeEach: () => mockFamilyApi([ashaClassWork]),
  render: () => detail("b10e8400-e29b-41d4-a716-446655440999"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("This Homework isn’t available."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Homework" }),
    ).toHaveAttribute("href", "/student/homework");
  },
};
