import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CreateWorkspaceForm } from "@/app/(onboarding)/create-workspace/_components/create-workspace-form";
import { OnboardingShell } from "@/app/(onboarding)/_components/onboarding-shell";
import { createWorkspace } from "../../../.storybook/mocks/create-workspace";

const meta = {
  title: "Pages/Workspace Creation",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <OnboardingShell>
      <CreateWorkspaceForm redirectUrl="/" createWorkspace={createWorkspace} />
    </OnboardingShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Create your workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
  },
};
