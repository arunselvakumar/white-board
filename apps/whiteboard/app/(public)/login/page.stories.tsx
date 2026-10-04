import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { LoginForm } from "@/components/auth/login-form";
import { PublicShell } from "@/components/auth/public-shell";

const meta = {
  title: "Pages/Sign-in",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <PublicShell>
      <LoginForm redirectUrl="/" />
    </PublicShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Sign in" })).toBeVisible();
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      canvas.getByText("Email or username is required"),
    ).toBeVisible();
    await expect(canvas.getByText("Password is required")).toBeVisible();
  },
};
