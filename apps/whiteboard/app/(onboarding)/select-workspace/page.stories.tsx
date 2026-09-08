import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { SelectWorkspaceForm } from "@/components/onboarding/select-workspace-form";
import { clerkMocks } from "../../../.storybook/mocks/clerk";

const meta = {
  title: "Pages/Workspace Selection",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <OnboardingShell>
      <SelectWorkspaceForm redirectUrl="/" />
    </OnboardingShell>
  ),
  beforeEach() {
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside School" } },
      { organization: { id: "org_harbor", name: "Harbor Academy" } },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Select a workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Riverside School/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
  },
};
