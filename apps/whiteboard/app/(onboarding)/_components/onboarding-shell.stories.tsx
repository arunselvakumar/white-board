import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthHeading } from "@/components/auth/auth-heading";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

const meta = {
  title: "Onboarding/OnboardingShell",
  component: OnboardingShell,
  tags: ["autodocs"],
  args: {
    children: (
      <AuthHeading
        title="Create your workspace"
        description="Name the workspace you'll work in"
      />
    ),
  },
} satisfies Meta<typeof OnboardingShell>;

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
