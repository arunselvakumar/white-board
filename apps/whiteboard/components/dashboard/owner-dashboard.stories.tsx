import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { signInAs } from "../../.storybook/mocks/auth";

const meta = {
  title: "Pages/Owner Dashboard",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/" } },
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
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

export const Populated: Story = {
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <OwnerDashboard
          dashboard={{
            activeStudentCount: 1,
            outstandingDuesPaise: 400000,
            feeFollowUpsDueCount: 0,
            todayBatches: [
              {
                id: "660e8400-e29b-41d4-a716-446655440000",
                name: "DCA Weekday 9–11 Offline",
                courseId: "550e8400-e29b-41d4-a716-446655440000",
                classMode: "offline",
                capacity: 20,
                enrolledCount: 1,
                timings: [
                  {
                    daysOfWeek: [1, 2, 3, 4, 5],
                    startTime: "09:00",
                    endTime: "11:00",
                  },
                ],
                todayClasses: [
                  { startTime: "16:00", endTime: "18:00", rescheduled: true },
                ],
              },
            ],
            recentStudents: [
              {
                id: "880e8400-e29b-41d4-a716-446655440000",
                name: "Anita Sharma",
                phone: "9876543210",
                createdAt: "2026-09-12T12:00:00.000Z",
              },
            ],
          }}
          hasCourses
          onAddCourse={() => undefined}
          onOpenBatch={() => undefined}
          onOpenStudent={() => undefined}
          onOpenStudents={() => undefined}
          onOpenFees={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.getByText("DCA Weekday 9–11 Offline")).toBeVisible();
    await expect(
      canvas.getByText(/Today 16:00–18:00 · Rescheduled/),
    ).toBeVisible();
    await expect(canvas.getByText("₹4,000")).toBeVisible();
  },
};
