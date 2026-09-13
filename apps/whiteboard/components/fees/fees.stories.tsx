import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { FeesCatalog } from "@/components/fees/fees-catalog";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Pages/Fees",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/fees" } },
  },
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      {
        organization: { id: "org_riverside", name: "Riverside Centre" },
      },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <FeesCatalog
          dues={[]}
          onCollect={() => undefined}
          onOpenStudents={() => undefined}
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

export const Dues: Story = {
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <FeesCatalog
          dues={[
            {
              id: "990e8400-e29b-41d4-a716-446655440000",
              studentName: "Anita Sharma",
              batchName: "DCA Weekday 9–11 Offline",
              remainingDuesPaise: 400000,
            },
          ]}
          onCollect={() => undefined}
          onOpenStudents={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.getByText("₹4,000")).toBeVisible();
  },
};
