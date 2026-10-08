import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import type {
  AttachmentView,
  BatchClassWorkView,
  HomeworkSubmissionsView,
  StaffHomeworkView,
  StudyMaterialView,
  SubmissionView,
} from "@/src/queries/class-work";
import { signInAs } from "../../../.storybook/mocks/auth";

import { BatchClassWorkScreen } from "./batch-class-work-screen";
import { STUDY_MATERIAL_EMPTY_MESSAGE } from "./study-material-form-dialog";
import { HomeworkSubmissionsScreen } from "./homework-submissions-screen";

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

/* ---------------------------- fixtures ---------------------------- */

const TODAY = "2026-10-07";
const BATCH_ID = "660e8400-e29b-41d4-a716-446655440001";
const OWNER_BASE = `/batches/${BATCH_ID}/homework`;
const TEACHER_BASE = `/teacher/batches/${BATCH_ID}/homework`;
const EXCEL_ID = "c10e8400-e29b-41d4-a716-446655440001";
const LETTER_ID = "c10e8400-e29b-41d4-a716-446655440002";
const OLD_ID = "c10e8400-e29b-41d4-a716-446655440003";
const SHORTCUTS_ID = "d10e8400-e29b-41d4-a716-446655440001";
const WORKBOOK_ID = "d10e8400-e29b-41d4-a716-446655440002";

const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

const batch: BatchClassWorkView["batch"] = {
  id: BATCH_ID,
  name: "DCA Weekday 10–11",
  courseName: "DCA",
  classMode: "offline",
  timezone: "Asia/Kolkata",
  closed: false,
};

const worksheet: AttachmentView = {
  id: "a10e8400-e29b-41d4-a716-446655440001",
  name: "excel-practice.pdf",
  mimeType: "application/pdf",
  sizeBytes: 182_000,
};

const shortcutsPhoto: AttachmentView = {
  id: "a10e8400-e29b-41d4-a716-446655440002",
  name: "tally-shortcuts.png",
  mimeType: "image/png",
  sizeBytes: 640_000,
};

const meena = { role: "teacher" as const, teacherName: "Meena Iyer" };
const owner = { role: "owner" as const, teacherName: null };

const excel: StaffHomeworkView = {
  id: EXCEL_ID,
  batchId: BATCH_ID,
  title: "Excel: SUM and AVERAGE practice",
  instructions:
    "Open the worksheet and fill in the totals for each month using SUM.\nThen find the average sale per day with AVERAGE.\nSave the file and send a photo or PDF.",
  classDate: "2026-10-05",
  dueOn: "2026-10-07",
  postedBy: meena,
  postedAt: at("2026-10-05", "11:10"),
  updatedAt: at("2026-10-05", "11:10"),
  removedAt: null,
  attachments: [worksheet],
  counts: { submitted: 6, late: 0, notSubmitted: 4, checked: 2 },
};

const letter: StaffHomeworkView = {
  id: LETTER_ID,
  batchId: BATCH_ID,
  title: "Type a one-page letter in Word",
  instructions:
    "Type a leave letter to your class teacher.\n\n1. Use Times New Roman, size 12.\n2. Add the date on the right.\n3. Use bold for the subject line.\n4. Check spelling with F7 before saving.\n\nBring a printout to the next Class if you can. If you have no printer, send the file instead and we will look at it together on screen.",
  classDate: "2026-09-30",
  dueOn: "2026-10-02",
  postedBy: owner,
  postedAt: at("2026-09-30", "17:45"),
  updatedAt: at("2026-09-30", "17:45"),
  removedAt: null,
  attachments: [],
  counts: { submitted: 7, late: 1, notSubmitted: 2, checked: 8 },
};

const removedHomework: StaffHomeworkView = {
  ...letter,
  id: OLD_ID,
  title: "Draw a flowchart for making tea",
  instructions: "Use the shapes we learnt today.",
  classDate: "2026-09-25",
  dueOn: "2026-09-28",
  postedBy: meena,
  removedAt: at("2026-09-26", "09:00"),
  counts: { submitted: 1, late: 0, notSubmitted: 0, checked: 0 },
};

const shortcuts: StudyMaterialView = {
  id: SHORTCUTS_ID,
  batchId: BATCH_ID,
  title: "Tally shortcut keys",
  note: "Keep this open while you practise.\nF4 Contra, F5 Payment, F6 Receipt, F7 Journal.",
  linkUrl: "https://www.youtube.com/watch?v=tally-shortcuts",
  classDate: "2026-10-05",
  postedBy: meena,
  postedAt: at("2026-10-05", "11:20"),
  updatedAt: at("2026-10-05", "11:20"),
  removedAt: null,
  attachments: [shortcutsPhoto],
};

const workbook: StudyMaterialView = {
  id: WORKBOOK_ID,
  batchId: BATCH_ID,
  title: "DCA practice workbook",
  note: null,
  linkUrl: null,
  classDate: null,
  postedBy: owner,
  postedAt: at("2026-09-28", "18:00"),
  updatedAt: at("2026-09-28", "18:00"),
  removedAt: null,
  attachments: [
    {
      ...worksheet,
      id: "a10e8400-e29b-41d4-a716-446655440003",
      name: "dca-workbook.pdf",
      sizeBytes: 2_400_000,
    },
  ],
};

const classDates: BatchClassWorkView["classDates"] = [
  { date: "2026-10-09", startTime: "10:00", endTime: "11:00" },
  { date: "2026-10-07", startTime: "10:00", endTime: "11:00" },
  { date: "2026-10-05", startTime: "10:00", endTime: "11:00" },
  { date: "2026-10-05", startTime: "16:00", endTime: "17:00" },
  { date: "2026-10-02", startTime: "10:00", endTime: "11:00" },
  { date: "2026-09-30", startTime: "10:00", endTime: "11:00" },
];

function batchView(
  overrides: Partial<BatchClassWorkView> = {},
): BatchClassWorkView {
  return {
    batch,
    today: TODAY,
    canEdit: true,
    classDates,
    materials: [shortcuts, workbook],
    homework: [excel, letter],
    ...overrides,
  };
}

function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: "e10e8400-e29b-41d4-a716-446655440001",
    note: null,
    submittedAt: at("2026-10-05", "19:30"),
    submittedBy: "student",
    updatedAt: at("2026-10-05", "19:30"),
    late: false,
    checkedAt: null,
    remark: null,
    attachments: [],
    ...overrides,
  };
}

const RAVI_SUBMISSION = "e10e8400-e29b-41d4-a716-446655440003";

function submissionsView(
  overrides: Partial<HomeworkSubmissionsView> = {},
): HomeworkSubmissionsView {
  return {
    batch,
    today: TODAY,
    homework: { ...excel, dueOn: "2026-10-06" },
    counts: { submitted: 2, late: 1, notSubmitted: 2, checked: 1 },
    students: [
      {
        studentId: "880e8400-e29b-41d4-a716-446655440001",
        studentName: "Arjun Nair",
        status: "not_submitted",
        inBatch: true,
        submission: null,
      },
      {
        studentId: "880e8400-e29b-41d4-a716-446655440002",
        studentName: "Divya Raj",
        status: "not_submitted",
        inBatch: true,
        submission: null,
      },
      {
        studentId: "880e8400-e29b-41d4-a716-446655440003",
        studentName: "Fathima Begum",
        status: "late",
        inBatch: true,
        submission: submission({
          id: "e10e8400-e29b-41d4-a716-446655440002",
          submittedBy: "parent",
          submittedAt: at("2026-10-07", "08:15"),
          late: true,
          note: "She was unwell on Monday. Sending it today.",
        }),
      },
      {
        studentId: "880e8400-e29b-41d4-a716-446655440004",
        studentName: "Priya Sharma",
        status: "submitted",
        inBatch: true,
        submission: submission({
          id: "e10e8400-e29b-41d4-a716-446655440004",
          checkedAt: at("2026-10-06", "12:00"),
          remark: "Good work. Check the March total again.",
          attachments: [
            {
              id: "a10e8400-e29b-41d4-a716-446655440010",
              name: "priya-excel.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 820_000,
            },
          ],
        }),
      },
      {
        studentId: "880e8400-e29b-41d4-a716-446655440005",
        studentName: "Ravi Kumar",
        status: "submitted",
        inBatch: false,
        submission: submission({
          id: RAVI_SUBMISSION,
          submittedAt: at("2026-10-06", "20:05"),
          note: "Done. AVERAGE came to 412.",
        }),
      },
    ],
    ...overrides,
  };
}

/* ------------------------------ meta ------------------------------ */

const meta = {
  title: "Pages/Homework and Study Material (staff)",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: TEACHER_BASE } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const batchRoute = (view: BatchClassWorkView): Record<string, Route> => ({
  [`GET /batches/${BATCH_ID}/class-work`]: () => ({ json: view }),
});

function TeacherPage() {
  return (
    <AppShell>
      <BatchClassWorkScreen batchId={BATCH_ID} basePath={TEACHER_BASE} />
    </AppShell>
  );
}

function OwnerPage() {
  return (
    <AppShell>
      <BatchClassWorkScreen batchId={BATCH_ID} basePath={OWNER_BASE} />
    </AppShell>
  );
}

/* ----------------------------- stories ---------------------------- */

export const HomeworkTab: Story = {
  beforeEach: () => mockApi(batchRoute(batchView())),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", {
        name: "Homework and Study Material",
      }),
    ).toBeVisible();
    await expect(canvas.getByText("DCA · DCA Weekday 10–11")).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: /Homework\s*2/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByRole("tab", { name: /Study Material\s*2/ }),
    ).toBeVisible();

    const excelCard = within(
      canvas.getByRole("article", { name: excel.title }),
    );
    await expect(excelCard.getByText("Class: Mon, 5 Oct")).toBeVisible();
    await expect(excelCard.getByText("Due: Wed, 7 Oct")).toBeVisible();
    await expect(excelCard.getByText("Set after Monday’s Class")).toBeVisible();
    await expect(excelCard.queryByText("Overdue")).toBeNull();
    await expect(excelCard.getByText(/Posted by Meena Iyer/)).toBeVisible();
    await expect(
      excelCard.getByRole("link", { name: /Download excel-practice.pdf/ }),
    ).toBeVisible();
    await expect(
      excelCard.getByRole("link", { name: "Review submissions" }),
    ).toHaveAttribute("href", `${TEACHER_BASE}/${EXCEL_ID}`);

    const letterCard = within(
      canvas.getByRole("article", { name: letter.title }),
    );
    await expect(letterCard.getByText("Overdue")).toBeVisible();
    await expect(letterCard.getByText(/Posted by Owner/)).toBeVisible();
    await userEvent.click(
      letterCard.getByRole("button", { name: "Show more" }),
    );
    await expect(
      letterCard.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
};

export const StudyMaterialTab: Story = {
  beforeEach: () => mockApi(batchRoute(batchView())),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("tab", { name: /Study Material/ }),
    );
    await expect(
      canvas.getByRole("button", { name: "Share material" }),
    ).toBeVisible();
    const card = within(canvas.getByRole("article", { name: shortcuts.title }));
    await expect(card.getByText("For Mon, 5 Oct’s Class")).toBeVisible();
    await expect(card.getByText(/F4 Contra/)).toBeVisible();
    const link = card.getByRole("link", { name: /youtube\.com/ });
    await expect(link).toHaveAttribute("href", shortcuts.linkUrl);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(
      card.getByRole("link", { name: /Download tally-shortcuts.png/ }),
    ).toBeVisible();
    const workbookCard = within(
      canvas.getByRole("article", { name: workbook.title }),
    );
    await expect(workbookCard.getByText(/Posted by Owner/)).toBeVisible();
  },
};

export const EmptyStates: Story = {
  beforeEach: () =>
    mockApi(
      batchRoute(batchView({ homework: [], materials: [], classDates: [] })),
    ),
  render: () => <TeacherPage />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("No Homework yet")).toBeVisible();
    await expect(
      canvas.getByText(/After a Class, set Homework with a due date/),
    ).toBeVisible();

    const section = within(canvas.getByRole("region", { name: "Homework" }));
    await userEvent.click(
      section.getByRole("button", { name: "Set homework" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Set homework" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByText(/This Batch has no Classes in the last 60 days/),
      ).toBeVisible(),
    );
    await expect(
      dialog.getByRole("button", { name: "Set homework" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await userEvent.click(canvas.getByRole("tab", { name: /Study Material/ }));
    await expect(
      await canvas.findByText("No Study Material yet"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Share notes, a link, or a PDF or photo with the Batch.",
      ),
    ).toBeVisible();
  },
};

export const ClosedBatch: Story = {
  beforeEach: () =>
    mockApi(
      batchRoute(
        batchView({ batch: { ...batch, closed: true }, canEdit: false }),
      ),
    ),
  render: () => <TeacherPage />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Closed")).toBeVisible();
    await expect(
      canvas.getByText(/This Batch is closed\. Nothing new can be posted/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Set homework" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: `Edit ${excel.title}` }),
    ).toBeNull();
    await expect(
      canvas.getAllByRole("link", { name: "Review submissions" }),
    ).toHaveLength(2);
  },
};

export const OwnerWithRemovedItem: Story = {
  parameters: { nextjs: { navigation: { pathname: OWNER_BASE } } },
  beforeEach: () => {
    signInAs("owner", { name: "Riverside Centre" });
    return mockApi({
      ...batchRoute(
        batchView({
          homework: [excel, letter, removedHomework],
          materials: [shortcuts, { ...workbook, removedAt: at("2026-10-01") }],
        }),
      ),
      [`POST /homework/${LETTER_ID}/remove`]: () => ({
        json: { ...letter, removedAt: at(TODAY) },
      }),
    });
  },
  render: () => <OwnerPage />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const removed = within(
      await canvas.findByRole("article", { name: removedHomework.title }),
    );
    await expect(removed.getByText("Removed")).toBeVisible();
    await expect(removed.queryByRole("button", { name: /Edit/ })).toBeNull();
    await expect(
      removed.getByRole("link", { name: "Review submissions" }),
    ).toHaveAttribute("href", `${OWNER_BASE}/${OLD_ID}`);

    await userEvent.click(
      canvas.getByRole("button", { name: `Remove ${letter.title}` }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(
        confirm.getByText(
          "Students and Parents won’t see it any more. The Owner keeps the record.",
        ),
      ).toBeVisible(),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(callsTo(`POST /homework/${LETTER_ID}/remove`)).toHaveLength(1),
    );
    await waitFor(() => expect(body.queryByRole("alertdialog")).toBeNull());

    await userEvent.click(canvas.getByRole("tab", { name: /Study Material/ }));
    const removedMaterial = within(
      await canvas.findByRole("article", { name: workbook.title }),
    );
    await expect(removedMaterial.getByText("Removed")).toBeVisible();
    await expect(
      removedMaterial.queryByRole("button", { name: /Remove/ }),
    ).toBeNull();
  },
};

export const SetHomework: Story = {
  beforeEach: () =>
    mockApi({
      ...batchRoute(batchView()),
      [`POST /batches/${BATCH_ID}/homework`]: ({ body }) => ({
        status: 201,
        json: { ...excel, ...(body as object), id: "new-homework" },
      }),
    }),
  render: () => <TeacherPage />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Set homework" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Set homework" }),
    );
    // Defaults: today's Class, due at the next Class.
    await expect(dialog.getByLabelText("Class date")).toHaveTextContent(
      "Wed, 7 Oct (today) · 10:00–11:00",
    );
    await expect(dialog.getByLabelText("Due date")).toHaveValue("2026-10-09");

    await userEvent.click(dialog.getByRole("button", { name: "Set homework" }));
    await expect(
      await dialog.findByText("Give the Homework a title"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Write what the Students should do"),
    ).toBeVisible();

    await userEvent.type(dialog.getByLabelText("Title"), "Format a table");
    await userEvent.type(
      dialog.getByLabelText("Instructions"),
      "Make the header row bold.",
    );
    await userEvent.click(dialog.getByLabelText("Class date"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Mon, 5 Oct · 10:00–11:00, 16:00–17:00",
      }),
    );
    const due = dialog.getByLabelText("Due date");
    await userEvent.clear(due);
    await userEvent.type(due, "2026-10-04");
    await userEvent.click(dialog.getByRole("button", { name: "Set homework" }));
    await expect(
      await dialog.findByText("The due date can’t be before the Class date"),
    ).toBeVisible();

    await userEvent.clear(due);
    await userEvent.type(due, "2026-10-08");
    await userEvent.click(dialog.getByRole("button", { name: "Set homework" }));
    await waitFor(() =>
      expect(callsTo(`POST /batches/${BATCH_ID}/homework`)[0]?.body).toEqual({
        title: "Format a table",
        instructions: "Make the header row bold.",
        classDate: "2026-10-05",
        dueOn: "2026-10-08",
        attachmentIds: [],
      }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Set homework" })).toBeNull(),
    );
  },
};

export const EditHomeworkServerError: Story = {
  beforeEach: () =>
    mockApi({
      ...batchRoute(batchView()),
      [`POST /homework/${EXCEL_ID}/update`]: () => ({
        status: 422,
        json: {
          code: "HOMEWORK_DUE_BEFORE_CLASS",
          message: "The due date must be on or after the Class date.",
        },
      }),
    }),
  render: () => <TeacherPage />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: `Edit ${excel.title}` }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit homework" }),
    );
    await expect(dialog.getByLabelText("Title")).toHaveValue(excel.title);
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: `Remove ${worksheet.name}` }),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await expect(
      await dialog.findByText(
        "The due date must be on or after the Class date.",
      ),
    ).toBeVisible();
    await expect(
      callsTo(`POST /homework/${EXCEL_ID}/update`)[0]?.body,
    ).toMatchObject({ attachmentIds: [worksheet.id] });
  },
};

export const ShareMaterialValidation: Story = {
  beforeEach: () =>
    mockApi({
      ...batchRoute(batchView()),
      [`POST /batches/${BATCH_ID}/study-materials`]: ({ body }) => ({
        status: 201,
        json: { ...shortcuts, ...(body as object), id: "new-material" },
      }),
    }),
  render: () => <TeacherPage />,
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: /Study Material/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Share material" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Share material" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Share material" }),
    );
    await expect(
      await dialog.findByText("Give the material a title"),
    ).toBeVisible();

    await userEvent.type(dialog.getByLabelText("Title"), "Typing practice");
    await userEvent.click(
      dialog.getByRole("button", { name: "Share material" }),
    );
    await expect(
      await dialog.findByText(STUDY_MATERIAL_EMPTY_MESSAGE),
    ).toBeVisible();

    const link = dialog.getByLabelText("Link (optional)");
    await userEvent.type(link, "typingclub.com");
    await userEvent.click(
      dialog.getByRole("button", { name: "Share material" }),
    );
    await expect(
      await dialog.findByText("Enter a full link starting with https://"),
    ).toBeVisible();

    await userEvent.clear(link);
    await userEvent.type(link, "https://www.typingclub.com");
    await userEvent.click(dialog.getByLabelText("Class date (optional)"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Wed, 7 Oct (today) · 10:00–11:00",
      }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Share material" }),
    );
    await waitFor(() =>
      expect(
        callsTo(`POST /batches/${BATCH_ID}/study-materials`)[0]?.body,
      ).toEqual({
        title: "Typing practice",
        note: null,
        linkUrl: "https://www.typingclub.com",
        classDate: "2026-10-07",
        attachmentIds: [],
      }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Share material" })).toBeNull(),
    );
  },
};

/* --------------------------- submissions -------------------------- */

const submissionsRoute = (
  view: HomeworkSubmissionsView,
): Record<string, Route> => ({
  [`GET /homework/${EXCEL_ID}/submissions`]: () => ({ json: view }),
  [`POST /homework/${EXCEL_ID}/submissions/${RAVI_SUBMISSION}/check`]: ({
    body,
  }) => ({
    json: submission({
      id: RAVI_SUBMISSION,
      checkedAt: at(TODAY, "12:00"),
      remark: (body as { remark: string | null }).remark,
    }),
  }),
});

export const Submissions: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${TEACHER_BASE}/${EXCEL_ID}` } },
  },
  beforeEach: () => mockApi(submissionsRoute(submissionsView())),
  render: () => (
    <AppShell>
      <HomeworkSubmissionsScreen
        homeworkId={EXCEL_ID}
        basePath={TEACHER_BASE}
      />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { level: 1, name: excel.title }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", {
        name: "Back to Homework and Study Material",
      }),
    ).toHaveAttribute("href", TEACHER_BASE);

    const groups = canvas
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-label"))
      .filter((name) =>
        ["Not submitted", "Late", "Submitted"].includes(name ?? ""),
      );
    await expect(groups).toEqual(["Not submitted", "Late", "Submitted"]);

    const notSubmitted = within(
      canvas.getByRole("region", { name: "Not submitted" }),
    );
    await expect(notSubmitted.getByText("Overdue")).toBeVisible();
    await expect(notSubmitted.getByText("Arjun Nair")).toBeVisible();
    await expect(
      notSubmitted.queryByRole("button", { name: /Check/ }),
    ).toBeNull();

    const late = within(canvas.getByRole("region", { name: "Late" }));
    await expect(late.getByText("by Parent")).toBeVisible();
    await expect(
      late.getByText("She was unwell on Monday. Sending it today."),
    ).toBeVisible();

    const submitted = within(canvas.getByRole("region", { name: "Submitted" }));
    const priya = within(
      submitted.getByRole("listitem", { name: "Priya Sharma" }),
    );
    await expect(priya.getByText("Checked")).toBeVisible();
    await expect(
      priya.getByText("Good work. Check the March total again."),
    ).toBeVisible();
    await expect(
      priya.getByRole("button", { name: "Edit remark for Priya Sharma" }),
    ).toBeVisible();
    const ravi = within(
      submitted.getByRole("listitem", { name: "Ravi Kumar" }),
    );
    await expect(ravi.getByText("Left the Batch")).toBeVisible();
    await expect(ravi.getByText("by Student")).toBeVisible();

    await userEvent.click(
      ravi.getByRole("button", { name: "Check Ravi Kumar" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Check Homework" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Remark (visible to the Student and Parents)"),
      "Correct. Well done.",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Mark checked" }));
    await waitFor(() =>
      expect(
        callsTo(
          `POST /homework/${EXCEL_ID}/submissions/${RAVI_SUBMISSION}/check`,
        )[0]?.body,
      ).toEqual({ remark: "Correct. Well done." }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Check Homework" })).toBeNull(),
    );
  },
};

export const SubmissionsForRemovedHomework: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${OWNER_BASE}/${EXCEL_ID}` } },
  },
  beforeEach: () => {
    signInAs("owner", { name: "Riverside Centre" });
    const view = submissionsView();
    return mockApi(
      submissionsRoute({
        ...view,
        homework: { ...view.homework, removedAt: at("2026-10-06", "09:00") },
      }),
    );
  },
  render: () => (
    <AppShell>
      <HomeworkSubmissionsScreen homeworkId={EXCEL_ID} basePath={OWNER_BASE} />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/This Homework was removed/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Check Ravi Kumar" }),
    ).toBeVisible();
  },
};
