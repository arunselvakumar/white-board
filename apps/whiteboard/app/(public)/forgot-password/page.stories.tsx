import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { PublicShell } from "@/components/auth/public-shell";

const meta = {
  title: "Pages/Password Reset",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <PublicShell>
      <ForgotPasswordForm />
    </PublicShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Send reset code" }),
    ).toBeVisible();
  },
};
