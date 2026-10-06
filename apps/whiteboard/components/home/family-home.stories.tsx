import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { FamilyHome } from "@/components/home/family-home";
import type { FamilyHomeStudent } from "@/src/queries/family-home";
import { clerkMocks } from "../../.storybook/mocks/clerk";

// 2026-09-30 09:00 in Asia/Kolkata.
const NOW = new Date("2026-09-30T03:30:00.000Z");
const BATCH = "660e8400-e29b-41d4-a716-446655440000";

const asha: FamilyHomeStudent = {
  id: "880e8400-e29b-41d4-a716-446655440000",
  name: "Asha Kumar",
  nextClass: {
    enrollmentId: "990e8400-e29b-41d4-a716-446655440000",
    batchId: BATCH,
    batchName: "Python Evening",
    courseName: "Python",
    classMode: "online",
    room: null,
    timezone: "Asia/Kolkata",
    date: "2026-09-30",
    startTime: "18:00",
    endTime: "19:00",
    rescheduled: false,
    inProgress: false,
  },
  dues: [
    {
      enrollmentId: "990e8400-e29b-41d4-a716-446655440000",
      batchName: "Python Evening",
      courseName: "Python",
      feePlanPaise: 450000,
      paidPaise: 100000,
      remainingDuesPaise: 350000,
    },
  ],
  recentAttendance: [
    {
      date: "2026-09-29",
      batchName: "Python Evening",
      courseName: "Python",
      status: "present",
    },
    {
      date: "2026-09-28",
      batchName: "Python Evening",
      courseName: "Python",
      status: "absent",
    },
  ],
  recordings: [
    {
      batchId: BATCH,
      batchName: "Python Evening",
      courseName: "Python",
      date: "2026-09-29",
      startTime: "18:00",
      endTime: "19:00",
    },
  ],
};

const ravi: FamilyHomeStudent = {
  id: "770e8400-e29b-41d4-a716-446655440000",
  name: "Ravi Kumar",
  nextClass: {
    enrollmentId: "550e8400-e29b-41d4-a716-446655440000",
    batchId: "440e8400-e29b-41d4-a716-446655440000",
    batchName: "Tally Morning",
    courseName: "Tally",
    classMode: "offline",
    room: "Lab 2",
    timezone: "Asia/Kolkata",
    date: "2026-10-01",
    startTime: "10:00",
    endTime: "11:00",
    rescheduled: true,
    inProgress: false,
  },
  dues: [
    {
      enrollmentId: "550e8400-e29b-41d4-a716-446655440000",
      batchName: "Tally Morning",
      courseName: "Tally",
      feePlanPaise: 300000,
      paidPaise: 300000,
      remainingDuesPaise: 0,
    },
  ],
  recentAttendance: [],
  recordings: [],
};

const meta = {
  title: "Pages/Student and Parent Home",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/student" } },
  },
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.orgRole = "org:student";
    clerkMocks.memberships = [
      {
        organization: { id: "org_riverside", name: "Riverside Centre" },
      },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StudentHome: Story = {
  render: () => (
    <AppShell>
      <FamilyHome home={{ students: [asha] }} role="org:student" now={NOW} />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Student Home" }),
    ).toBeVisible();
    await expect(canvas.getByText("Today · 18:00–19:00")).toBeVisible();
    await expect(canvas.getByText("Online")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Class" }),
    ).toHaveAttribute("href", `/classes/${BATCH}/2026-09-30/18%3A00`);
    await expect(canvas.getAllByText("₹3,500")).toHaveLength(2);
    await expect(canvas.getByText("₹1,000 of ₹4,500 paid")).toBeVisible();
    await expect(canvas.getByText("Present")).toBeVisible();
    await expect(canvas.getByText("Absent")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Download recording/ }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        `/api/training-institute/classes/${BATCH}/2026-09-29/18%3A00/recording`,
      ),
    );
  },
};

export const ParentHome: Story = {
  parameters: { nextjs: { navigation: { pathname: "/parent" } } },
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
  },
  render: () => (
    <AppShell>
      <FamilyHome
        home={{ students: [asha, ravi] }}
        role="org:parent"
        now={NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Parent Home" }),
    ).toBeVisible();
    const raviSection = within(
      canvas.getByRole("region", { name: "Ravi Kumar" }),
    );
    await expect(
      canvas.getByRole("region", { name: "Asha Kumar" }),
    ).toBeVisible();
    await expect(
      raviSection.getByText("Tomorrow · 10:00–11:00 · Rescheduled"),
    ).toBeVisible();
    await expect(raviSection.getByText("Room Lab 2")).toBeVisible();
    await expect(
      raviSection.queryByRole("link", { name: "Open Class" }),
    ).toBeNull();
    await expect(raviSection.getByText("Nothing due")).toBeVisible();
    await expect(
      raviSection.getByText("No Attendance marked yet."),
    ).toBeVisible();
    await expect(raviSection.getByText("No recordings yet.")).toBeVisible();
  },
};

export const StudentNotLinked: Story = {
  render: () => (
    <AppShell>
      <FamilyHome home={{ students: [] }} role="org:student" now={NOW} />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Your Student record isn’t linked yet/),
    ).toBeVisible();
  },
};

export const StudentWithoutEnrollments: Story = {
  render: () => (
    <AppShell>
      <FamilyHome
        home={{
          students: [
            {
              id: asha.id,
              name: asha.name,
              nextClass: null,
              dues: [],
              recentAttendance: [],
              recordings: [],
            },
          ],
        }}
        role="org:student"
        now={NOW}
      />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No upcoming Classes.")).toBeVisible();
    await expect(canvas.getByText("No active Enrollments.")).toBeVisible();
    await expect(canvas.getByText("No Attendance marked yet.")).toBeVisible();
    await expect(canvas.getByText("No recordings yet.")).toBeVisible();
  },
};
