import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import {
  callsTo,
  hasNoHorizontalOverflow,
  mockApi,
  withFreshQueryClient,
} from "@/components/notifications/story-api";
import type { ExpectedAbsencesView } from "@/src/queries/absence-notices";
import { signInAs } from "../../../.storybook/mocks/auth";

import {
  AbsenceNoticesContent,
  AbsenceNoticesScreen,
} from "./absence-notices-screen";

// Monday 2026-10-12, 9:00 am in Asia/Kolkata.
const NOW = new Date("2026-10-12T03:30:00.000Z");
const TALLY = "660e8400-e29b-41d4-a716-446655440101";
const DCA = "660e8400-e29b-41d4-a716-446655440102";
const ASHA = "880e8400-e29b-41d4-a716-446655440101";
const VIKRAM = "880e8400-e29b-41d4-a716-446655440102";
const MEERA = "880e8400-e29b-41d4-a716-446655440103";

const tally = {
  batchId: TALLY,
  batchName: "Tally Evening",
  courseName: "Tally",
  timezone: "Asia/Kolkata",
  startTime: "17:00",
  endTime: "18:00",
  rescheduled: false,
};

const expected: ExpectedAbsencesView = {
  classes: [
    {
      ...tally,
      date: "2026-10-12",
      absentees: [
        {
          noticeId: "b10e8400-e29b-41d4-a716-446655440001",
          studentId: ASHA,
          studentName: "Asha Rao",
          reason: "sick",
          note: "Fever since Sunday; the doctor said two days of rest.",
          givenAt: "2026-10-12T02:15:00.000Z",
          givenBy: { role: "parent", name: "Ramesh Rao" },
        },
        {
          noticeId: "b10e8400-e29b-41d4-a716-446655440002",
          studentId: MEERA,
          studentName: "Meera Pillai",
          reason: "exam",
          note: null,
          givenAt: "2026-10-09T13:00:00.000Z",
          givenBy: { role: "student", name: "Meera Pillai" },
        },
      ],
    },
    {
      batchId: DCA,
      batchName: "DCA Morning",
      courseName: "DCA",
      timezone: "Asia/Kolkata",
      date: "2026-10-13",
      startTime: "11:30",
      endTime: "12:30",
      rescheduled: true,
      absentees: [
        {
          noticeId: "b10e8400-e29b-41d4-a716-446655440003",
          studentId: VIKRAM,
          studentName: "Vikram Nair",
          reason: "travel",
          note: "Going to Chennai for my sister's admission.",
          givenAt: "2026-10-11T06:20:00.000Z",
          givenBy: { role: "student", name: "Vikram Nair" },
        },
      ],
    },
    {
      ...tally,
      date: "2026-10-15",
      absentees: [
        {
          noticeId: "b10e8400-e29b-41d4-a716-446655440004",
          studentId: ASHA,
          studentName: "Asha Rao",
          reason: "sick",
          note: "Fever since Sunday; the doctor said two days of rest.",
          givenAt: "2026-10-12T02:15:00.000Z",
          givenBy: { role: "parent", name: "Ramesh Rao" },
        },
      ],
    },
  ],
};

function mockExpected(view: ExpectedAbsencesView) {
  return mockApi({
    "GET /absence-notices/expected": () => ({ json: view }),
    "GET /notifications/unread-count": () => ({ json: { unreadCount: 0 } }),
  });
}

const meta = {
  title: "Pages/Absence Notices (staff)",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/absence-notices" } },
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
    return mockExpected(expected);
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Owner: Story = {
  render: () => (
    <AppShell>
      <AbsenceNoticesContent view={expected} audience="owner" now={NOW} />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Absence Notices" }),
    ).toBeVisible();
    await expect(canvas.getByText(/across every Batch/)).toBeVisible();
    const breadcrumb = within(
      canvas.getByRole("navigation", { name: "Breadcrumb" }),
    );
    await expect(
      breadcrumb.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/");

    // Grouped by day: Today, Tomorrow, then the weekday and date.
    const days = canvas
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    await expect(days).toEqual([
      "Today Mon 12 Oct",
      "Tomorrow Tue 13 Oct",
      "Thursday 15 Oct",
    ]);

    const today = within(
      canvas.getByRole("region", { name: "Today Mon 12 Oct" }),
    );
    const tallyToday = within(
      today.getByRole("article", { name: "Tally Evening, 5:00–6:00 pm" }),
    );
    await expect(tallyToday.getByText("Tally")).toBeVisible();
    await expect(tallyToday.getByText("2 Students gave notice")).toBeVisible();
    const absentees = within(
      tallyToday.getByRole("list", {
        name: "Absence Notices for Tally Evening, 5:00–6:00 pm",
      }),
    );
    await expect(absentees.getAllByRole("listitem")).toHaveLength(2);
    await expect(absentees.getByText("Asha Rao")).toBeVisible();
    await expect(absentees.getByText("Sick")).toBeVisible();
    await expect(
      absentees.getByText(
        "“Fever since Sunday; the doctor said two days of rest.”",
      ),
    ).toBeVisible();
    await expect(
      absentees.getByText("Notice by Parent (Ramesh Rao) · 12 Oct, 7:45 am"),
    ).toBeVisible();
    await expect(absentees.getByText("Exam")).toBeVisible();
    await expect(
      absentees.getByText("Notice by Student (Meera Pillai) · 9 Oct, 6:30 pm"),
    ).toBeVisible();

    // A Moved Class's new time is tagged.
    const dca = within(
      canvas.getByRole("article", { name: "DCA Morning, 11:30 am–12:30 pm" }),
    );
    await expect(dca.getByText("Rescheduled")).toBeVisible();
    await expect(dca.getByText("1 Student gave notice")).toBeVisible();
    await expect(dca.getByText("Travel")).toBeVisible();

    await expect(canvas.queryByText(/@/)).toBeNull();
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const Teacher: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/teacher/absence-notices" } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <AbsenceNoticesContent view={expected} audience="teacher" now={NOW} />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Absence Notices" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Students in your Batches who gave notice/),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("article")).toHaveLength(3);

    // Absence Notices, not My Batches, is the current nav item.
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(
      nav.getByRole("link", { name: "Absence Notices" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "My Batches" }),
    ).not.toHaveAttribute("aria-current");
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

/** The page reads the expected absentees from the API. */
export const OwnerEmpty: Story = {
  beforeEach: () => mockExpected({ classes: [] }),
  render: () => (
    <AppShell>
      <AbsenceNoticesScreen audience="owner" />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No absence notices for upcoming Classes"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/When a Student or Parent gives notice/),
    ).toBeVisible();
    await waitFor(() =>
      expect(callsTo("GET /absence-notices/expected")).toHaveLength(1),
    );
  },
};

export const TeacherEmpty: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/teacher/absence-notices" } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
    return mockExpected({ classes: [] });
  },
  render: () => (
    <AppShell>
      <AbsenceNoticesScreen audience="teacher" />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No absence notices for upcoming Classes"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/When a Student in your Batches/),
    ).toBeVisible();
  },
};

/** The API's list read through the screen, as a Teacher opens it. */
export const TeacherFromApi: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/teacher/absence-notices" } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <AbsenceNoticesScreen audience="teacher" />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("article", {
        name: "DCA Morning, 11:30 am–12:30 pm",
      }),
    ).toBeVisible();
    await expect(canvas.getAllByText("Asha Rao")).toHaveLength(2);
  },
};
