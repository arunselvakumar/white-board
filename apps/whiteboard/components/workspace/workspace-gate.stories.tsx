import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Workspace/WorkspaceGate",
  component: WorkspaceGate,
  args: {
    children: <p>In-app home</p>,
  },
} satisfies Meta<typeof WorkspaceGate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithActiveWorkspace: Story = {
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside School" } },
    ];
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("In-app home")).toBeVisible();
  },
};

export const Loading: Story = {
  beforeEach() {
    clerkMocks.organizationListLoaded = false;
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
};

export const NeedsWorkspace: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
};
