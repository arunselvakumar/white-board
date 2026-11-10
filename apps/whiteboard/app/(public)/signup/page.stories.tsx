import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { PublicShell } from "@/app/(public)/_components/public-shell";
import { SignupForm } from "@/app/(public)/signup/_components/signup-form";

const meta = {
  title: "Pages/Sign-up",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <PublicShell>
      <SignupForm />
    </PublicShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
  },
};
