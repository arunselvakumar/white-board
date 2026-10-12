import { useAuth } from "@repo/auth/react";
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { FamilyHomeScreen } from "@/components/home/family-home-screen";
import type { FamilyHomeRole } from "@/components/home/family-home";
import { QuerySuspense } from "@/components/query-suspense";
import {
  absenceNoticeQueries,
  type FamilyAbsenceNoticeView,
  type FamilyAbsenceNoticesView,
  type GiveAbsenceNoticeInput,
  type PickableClassView,
} from "@/src/queries/absence-notices";
import type { FamilyHomeStudent } from "@/src/queries/family-home";
import { signInAs } from "../../../.storybook/mocks/auth";

import {
  ASHA_ID,
  NOTICE_NOW,
  RAVI_ID,
  ashaClasses,
  cancelledNotice,
  holidayNotice,
  movedNotice,
  raviClasses,
  startedNotice,
  travelNotice,
} from "./absence-notices-family.fixtures";
import { AbsenceNoticesHomeCard } from "./absence-notices-home-card";

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

type StudentFixture = {
  id: string;
  name: string;
  notices: FamilyAbsenceNoticeView[];
  classes: PickableClassView[];
};

const asha = (
  notices: FamilyAbsenceNoticeView[] = [],
  classes: PickableClassView[] = ashaClasses,
): StudentFixture => ({ id: ASHA_ID, name: "Asha Kumar", notices, classes });

const ravi = (): StudentFixture => ({
  id: RAVI_ID,
  name: "Ravi Kumar",
  notices: [],
  classes: raviClasses,
});

const NOTICES = "/absence-notices";

/**
 * Serves the family notices and the Class picker from `students`, and keeps
 * them in step with give and withdraw, so the refetch shows the new state.
 */
function mockNoticeApi(
  students: StudentFixture[],
  extra: Record<string, Route> = {},
) {
  const state = structuredClone(students);
  let created = 0;
  const notices = (): FamilyAbsenceNoticesView => ({
    students: state.map(({ id, name, notices: items }) => ({
      id,
      name,
      notices: [...items].sort(
        (a, b) =>
          a.class.date.localeCompare(b.class.date) ||
          a.class.startTime.localeCompare(b.class.startTime),
      ),
    })),
  });
  const routes: Record<string, Route> = {
    [`GET ${NOTICES}`]: () => ({ json: notices() }),
    [`GET ${NOTICES}/classes`]: () => ({
      json: {
        students: state.map(({ id, name, classes }) => ({
          id,
          name,
          classes,
        })),
      },
    }),
    [`POST ${NOTICES}`]: ({ body }) => {
      const input = body as GiveAbsenceNoticeInput;
      const student = state.find((item) => item.id === input.studentId);
      if (student == null)
        return {
          status: 404,
          json: { code: "STUDENT_NOT_FOUND", message: "Student not found." },
        };
      const given = input.classes.map((key) => {
        const picked = student.classes.find(
          (item) =>
            item.enrollmentId === key.enrollmentId &&
            item.date === key.date &&
            item.startTime === key.startTime,
        );
        if (picked == null) throw new Error("Unknown Class in the request.");
        created += 1;
        const notice: FamilyAbsenceNoticeView = {
          id: `b10e8400-e29b-41d4-a716-44665544${String(created).padStart(4, "0")}`,
          studentId: student.id,
          studentName: student.name,
          class: {
            enrollmentId: picked.enrollmentId,
            batchId: picked.batchId,
            batchName: picked.batchName,
            courseName: picked.courseName,
            classMode: picked.classMode,
            timezone: picked.timezone,
            date: picked.date,
            startTime: picked.startTime,
            endTime: picked.endTime,
            rescheduled: picked.rescheduled,
          },
          reason: input.reason,
          note: input.note ?? null,
          givenAt: NOTICE_NOW.toISOString(),
          givenBy:
            storyRole === "parent"
              ? { role: "parent", name: "Ramesh Kumar" }
              : { role: "student", name: student.name },
          standing: "applies",
          movedTo: null,
          canWithdraw: true,
        };
        picked.noticeId = notice.id;
        return notice;
      });
      student.notices.push(...given);
      return { status: 201, json: { notices: given } };
    },
    ...extra,
  };
  for (const student of state)
    for (const notice of student.notices)
      routes[`POST ${NOTICES}/${notice.id}/withdraw`] = () => {
        student.notices = student.notices.filter(
          (item) => item.id !== notice.id,
        );
        for (const item of student.classes)
          if (item.noticeId === notice.id) item.noticeId = null;
        return { json: notice };
      };
  return mockApi(routes);
}

let storyRole: FamilyHomeRole = "student";

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

/** The card as Home mounts it: reads the family notices like the screen. */
function CardFromApi({
  student,
  role,
}: {
  student: { id: string; name: string };
  role: FamilyHomeRole;
}) {
  const { workspaceId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    absenceNoticeQueries.family(
      `${String(workspaceId)}:${String(userId)}:${role}`,
    ),
  );
  return (
    <div className="w-full max-w-md p-4">
      <AbsenceNoticesHomeCard
        student={student}
        notices={data}
        role={role}
        now={NOTICE_NOW}
      />
    </div>
  );
}

const studentCard = () => (
  <CardFromApi student={{ id: ASHA_ID, name: "Asha Kumar" }} role="student" />
);

const meta = {
  title: "Pages/Student and Parent Home/Absence Notices",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/student" } },
  },
  decorators: [withFreshQueryClient],
  beforeEach() {
    storyRole = "student";
    signInAs("student", { name: "Riverside Centre" });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The `index`th element, for querying inside it. */
function nth(items: HTMLElement[], index: number) {
  const item = items[index];
  if (item == null) throw new Error(`No item ${String(index)}.`);
  return within(item);
}

const body = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body);

async function openGiveDialog(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: "Give absence notice" }),
  );
  const dialog = await body(canvasElement).findByRole("dialog", {
    name: "Give absence notice",
  });
  await within(dialog).findByRole("group", { name: "Today" });
  return within(dialog);
}

/* ----------------------------- the card ----------------------------- */

export const WithNotices: Story = {
  beforeEach: () =>
    mockNoticeApi([
      asha([
        startedNotice,
        travelNotice,
        cancelledNotice,
        holidayNotice,
        movedNotice,
      ]),
    ]),
  render: studentCard,
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Absence Notices" }),
    );
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(5);

    // Today's Class has started: still listed, no Withdraw.
    const started = nth(rows, 0);
    await expect(started.getByText("Today · 10:00–11:00")).toBeVisible();
    await expect(started.getByText("Other")).toBeVisible();
    await expect(started.queryByRole("button")).toBeNull();

    // Applies: reason, note, and the Parent who gave it.
    const travel = nth(rows, 1);
    await expect(travel.getByText("Fri, 16 Oct · 18:00–19:00")).toBeVisible();
    await expect(travel.getByText("Python · Python Evening")).toBeVisible();
    await expect(travel.getByText("Travel")).toBeVisible();
    await expect(
      travel.getByText("Cousin’s wedding in Madurai."),
    ).toBeVisible();
    await expect(
      travel.getByText("Given by Parent · Ramesh Kumar"),
    ).toBeVisible();
    await expect(travel.queryByText("No longer needed")).toBeNull();
    await expect(
      travel.getByRole("button", {
        name: "Withdraw notice for Python, Fri, 16 Oct · 18:00–19:00",
      }),
    ).toBeEnabled();

    // No longer needed, with the reason.
    const cancelled = nth(rows, 2);
    await expect(cancelled.getByText("No longer needed")).toBeVisible();
    await expect(cancelled.getByText("Class cancelled")).toBeVisible();
    await expect(cancelled.getByText("Given by you")).toBeVisible();
    const holiday = nth(rows, 3);
    await expect(holiday.getByText("Holiday")).toBeVisible();
    await expect(holiday.getByText("Family function")).toBeVisible();
    const moved = nth(rows, 4);
    await expect(
      moved.getByText(
        "Class moved to Thu, 22 Oct 17:00 — give notice again if you’ll miss it",
      ),
    ).toBeVisible();
    await expect(
      moved.getByText("Given by Parent · Lakshmi Kumar"),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: () => mockNoticeApi([asha()]),
  render: studentCard,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No absence notices. Tell the Teacher ahead if you’ll miss a Class.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Give absence notice" }),
    ).toBeEnabled();
    await expect(canvas.queryByRole("list")).toBeNull();
  },
};

export const Withdraw: Story = {
  beforeEach: () => mockNoticeApi([asha([travelNotice, cancelledNotice])]),
  render: studentCard,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Withdraw notice for Python, Fri, 16 Oct · 18:00–19:00",
      }),
    );
    const confirm = within(
      await body(canvasElement).findByRole("alertdialog", {
        name: "Withdraw this absence notice?",
      }),
    );
    await expect(
      confirm.getByText(
        "Python · Python Evening, Fri, 16 Oct · 18:00–19:00. The Teacher is notified that it’s withdrawn.",
      ),
    ).toBeVisible();
    // Keeping it sends nothing.
    await userEvent.click(confirm.getByRole("button", { name: "Keep it" }));
    await expect(
      callsTo(`POST ${NOTICES}/${travelNotice.id}/withdraw`),
    ).toHaveLength(0);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Withdraw notice for Python, Fri, 16 Oct · 18:00–19:00",
      }),
    );
    await userEvent.click(
      within(await body(canvasElement).findByRole("alertdialog")).getByRole(
        "button",
        { name: "Withdraw" },
      ),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Absence notice withdrawn.",
    );
    await waitFor(() =>
      expect(canvas.queryByText("Cousin’s wedding in Madurai.")).toBeNull(),
    );
    await expect(
      callsTo(`POST ${NOTICES}/${travelNotice.id}/withdraw`),
    ).toHaveLength(1);
    await expect(canvas.getByText("Class cancelled")).toBeVisible();
  },
};

/** A notice that no longer applies says nobody is told when withdrawn. */
export const WithdrawNoLongerNeeded: Story = {
  beforeEach: () => mockNoticeApi([asha([cancelledNotice])]),
  render: studentCard,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Withdraw notice for/ }),
    );
    await expect(
      await body(canvasElement).findByText(
        /It no longer applies, so nobody is notified\./,
      ),
    ).toBeVisible();
  },
};

/* ------------------------- giving notice ---------------------------- */

export const GiveNoticeForSeveralClasses: Story = {
  beforeEach: () => mockNoticeApi([asha()]),
  render: studentCard,
  play: async ({ canvas, canvasElement }) => {
    const dialog = await openGiveDialog(canvasElement);
    const submit = dialog.getByRole("button", { name: "Give notice" });
    await expect(submit).toBeDisabled();

    await userEvent.click(
      within(dialog.getByRole("group", { name: "Today" })).getByRole(
        "checkbox",
      ),
    );
    await userEvent.click(
      within(dialog.getByRole("group", { name: "Sat, 17 Oct" })).getByRole(
        "checkbox",
      ),
    );
    await userEvent.click(dialog.getByLabelText("Reason"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", {
        name: "Family function",
      }),
    );
    await userEvent.type(dialog.getByLabelText("Note (optional)"), "Wedding");
    await expect(dialog.getByText("7/300")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Give notice for 2 Classes" }),
    );

    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Absence notice sent to the Teacher for 2 Classes.",
    );
    await waitFor(() =>
      expect(body(canvasElement).queryByRole("dialog")).toBeNull(),
    );
    await expect(callsTo(`POST ${NOTICES}`)).toHaveLength(1);
    await expect(callsTo(`POST ${NOTICES}`)[0]?.body).toEqual({
      studentId: ASHA_ID,
      classes: [
        {
          enrollmentId: ashaClasses[0]?.enrollmentId,
          date: "2026-10-14",
          startTime: "18:00",
        },
        {
          enrollmentId: ashaClasses[2]?.enrollmentId,
          date: "2026-10-17",
          startTime: "10:00",
        },
      ],
      reason: "family",
      note: "Wedding",
    });
    // The refetched list shows both new notices.
    const list = within(
      await canvas.findByRole("list", { name: "Absence Notices" }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(2);
    await expect(list.getByText("Today · 18:00–19:00")).toBeVisible();
    await expect(list.getByText("Sat, 17 Oct · 10:00–11:00")).toBeVisible();
    await expect(list.getAllByText("Given by you")).toHaveLength(2);
  },
};

export const MissingReason: Story = {
  beforeEach: () => mockNoticeApi([asha()]),
  render: studentCard,
  play: async ({ canvasElement }) => {
    const dialog = await openGiveDialog(canvasElement);
    await userEvent.click(
      within(dialog.getByRole("group", { name: "Today" })).getByRole(
        "checkbox",
      ),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Give notice for 1 Class" }),
    );
    await expect(await dialog.findByText("Choose a reason")).toBeVisible();
    await expect(dialog.getByLabelText("Reason")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(callsTo(`POST ${NOTICES}`)).toHaveLength(0);
  },
};

/** Classes in two Batches show the Batch; noticed ones can't be picked. */
export const AlreadyNoticedClassesDisabled: Story = {
  beforeEach: () => mockNoticeApi([asha([travelNotice])]),
  render: studentCard,
  play: async ({ canvasElement }) => {
    const dialog = await openGiveDialog(canvasElement);
    const friday = within(dialog.getByRole("group", { name: "Fri, 16 Oct" }));
    await expect(friday.getByRole("checkbox")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(friday.getByText("Notice given")).toBeVisible();
    await expect(friday.getByText("Python · Python Evening")).toBeVisible();

    const saturday = within(dialog.getByRole("group", { name: "Sat, 17 Oct" }));
    await expect(saturday.getByText("Tally · Tally Morning")).toBeVisible();
    await expect(saturday.getByRole("checkbox")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    const thursday = within(dialog.getByRole("group", { name: "Thu, 22 Oct" }));
    await expect(thursday.getByText("17:00–18:00")).toBeVisible();
    await expect(thursday.getByText("Rescheduled")).toBeVisible();

    // The cancelled and moved-away slots aren't offered at all.
    await expect(
      dialog.queryByRole("group", { name: "Mon, 19 Oct" }),
    ).toBeNull();
    await expect(
      dialog.queryByRole("group", { name: "Wed, 21 Oct" }),
    ).toBeNull();
  },
};

/** Someone noticed the same Class meanwhile: say so and show the latest. */
export const GiveConflict: Story = {
  beforeEach: () =>
    mockNoticeApi([asha()], {
      [`POST ${NOTICES}`]: () => ({
        status: 409,
        json: {
          code: "ABSENCE_NOTICE_ALREADY_GIVEN",
          message: "Notice has already been given for one of these Classes.",
        },
      }),
    }),
  render: studentCard,
  play: async ({ canvasElement }) => {
    const dialog = await openGiveDialog(canvasElement);
    await userEvent.click(
      within(dialog.getByRole("group", { name: "Today" })).getByRole(
        "checkbox",
      ),
    );
    await userEvent.click(dialog.getByLabelText("Reason"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Sick" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Give notice for 1 Class" }),
    );
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Notice has already been given for one of these Classes.",
    );
    await waitFor(() =>
      expect(callsTo(`GET ${NOTICES}/classes`)).toHaveLength(2),
    );
    // The dialog stays open with the pick, so the family can try again.
    await expect(
      dialog.getByRole("button", { name: "Give notice for 1 Class" }),
    ).toBeEnabled();
  },
};

export const NoUpcomingClasses: Story = {
  beforeEach: () => mockNoticeApi([asha([], [])]),
  render: studentCard,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Give absence notice" }),
    );
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await expect(
      await dialog.findByText("No upcoming Classes in the next 60 days."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Give notice" }),
    ).toBeDisabled();
  },
};

/* ---------------------- Parent Home, two children ------------------- */

const homeStudent = (id: string, name: string): FamilyHomeStudent => ({
  id,
  name,
  nextClass: null,
  dues: [],
  recentAttendance: [],
  recordings: [],
});

export const ParentWithTwoChildren: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent" } } },
  beforeEach() {
    storyRole = "parent";
    signInAs("parent", { name: "Riverside Centre" });
    const restoreNotices = mockNoticeApi([asha([travelNotice]), ravi()]);
    const restoreHome = mockApi({
      "GET /home": () => ({
        json: {
          students: [
            homeStudent(ASHA_ID, "Asha Kumar"),
            homeStudent(RAVI_ID, "Ravi Kumar"),
          ],
        },
      }),
      "GET /home/homework": () => ({ json: { students: [] } }),
      "GET /home/results": () => ({ json: { students: [] } }),
    });
    return () => {
      restoreHome();
      restoreNotices();
    };
  },
  render: () => (
    <AppShell>
      <FamilyHomeScreen role="parent" />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    const ashaSection = within(
      await canvas.findByRole("region", { name: "Asha Kumar" }),
    );
    const raviSection = within(
      canvas.getByRole("region", { name: "Ravi Kumar" }),
    );
    await expect(
      ashaSection.getByText("Given by Parent · Ramesh Kumar"),
    ).toBeVisible();
    await expect(
      raviSection.getByText(
        "No absence notices. Tell the Teacher ahead if Ravi Kumar will miss a Class.",
      ),
    ).toBeVisible();

    // Give notice for Ravi only: his own Classes, one Batch so no names.
    await userEvent.click(
      raviSection.getByRole("button", { name: "Give absence notice" }),
    );
    const dialog = within(
      await body(canvasElement).findByRole("dialog", {
        name: "Give absence notice",
      }),
    );
    await expect(
      dialog.getByText(
        "Tell the Teacher ahead of time that Ravi Kumar will miss these Classes.",
      ),
    ).toBeVisible();
    const saturday = within(
      await dialog.findByRole("group", { name: "Sat, 17 Oct" }),
    );
    await expect(saturday.queryByText("Tally · Tally Morning")).toBeNull();
    await expect(dialog.queryByRole("group", { name: "Today" })).toBeNull();
    await userEvent.click(saturday.getByRole("checkbox"));
    await userEvent.click(dialog.getByLabelText("Reason"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Exam" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Give notice for 1 Class" }),
    );

    await expect(await raviSection.findByRole("status")).toHaveTextContent(
      "Absence notice sent to the Teacher for 1 Class.",
    );
    await expect(callsTo(`POST ${NOTICES}`)[0]?.body).toMatchObject({
      studentId: RAVI_ID,
      reason: "exam",
      note: null,
    });
    await expect(
      await raviSection.findByText("Sat, 17 Oct · 10:00–11:00"),
    ).toBeVisible();
    await expect(
      raviSection.getByText("Given by Parent · Ramesh Kumar"),
    ).toBeVisible();
    // Asha's card is untouched.
    await expect(ashaSection.queryByRole("status")).toBeNull();
    await expect(
      within(
        ashaSection.getByRole("list", { name: "Absence Notices" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(1);
  },
};
