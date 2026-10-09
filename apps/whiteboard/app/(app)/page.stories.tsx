import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { BatchCatalog } from "@/components/batches/batch-catalog";
import { CourseCatalog } from "@/components/courses/course-catalog";
import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { FeesCatalog } from "@/components/fees/fees-catalog";
import { StudentCatalog } from "@/components/students/student-catalog";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { signInAs } from "../../.storybook/mocks/auth";

const meta = {
  title: "Pages/In-app",
  parameters: {
    layout: "fullscreen",
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <OwnerDashboard
          dashboard={{
            activeStudentCount: 0,
            outstandingDuesPaise: 0,
            feeFollowUpsDueCount: 0,
            todayBatches: [],
            recentStudents: [],
          }}
          hasCourses={false}
          onAddCourse={() => undefined}
          onOpenBatch={() => undefined}
          onOpenStudent={() => undefined}
          onOpenStudents={() => undefined}
          onOpenFees={() => undefined}
          onOpenCalendar={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Owner Dashboard" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add the first Course this centre teaches."),
    ).toBeVisible();
  },
};

export const Students: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/students" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <StudentCatalog
          students={[]}
          search=""
          onSearchChange={() => undefined}
          onAdd={() => undefined}
          onView={() => undefined}
          onEdit={() => undefined}
          onDrop={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Students" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add the first Student this centre admits."),
    ).toBeVisible();
  },
};

export const Courses: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/courses" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <CourseCatalog
          courses={[]}
          onAdd={() => undefined}
          onEdit={() => undefined}
          onArchive={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Courses" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add the first Course this centre teaches."),
    ).toBeVisible();
  },
};

export const Batches: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/batches" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <BatchCatalog
          batches={[]}
          courses={[]}
          courseId="all"
          onCourseIdChange={() => undefined}
          onAdd={() => undefined}
          onEdit={() => undefined}
          onClose={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Batches" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add a Course before opening a Batch."),
    ).toBeVisible();
  },
};

export const Fees: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/fees" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <FeesCatalog
          dues={{
            filter: "all",
            sort: "amount",
            items: [],
            counts: { overdue: 0, dueSoon: 0, all: 0 },
            totalRemainingPaise: 0,
          }}
          followUpsDue={[]}
          filter="all"
          sort="amount"
          onFilterChange={() => undefined}
          onSortChange={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Fees" })).toBeVisible();
    await expect(
      canvas.getByText(
        "Remaining dues will show here after an Enrollment has a Fee Plan.",
      ),
    ).toBeVisible();
  },
};
