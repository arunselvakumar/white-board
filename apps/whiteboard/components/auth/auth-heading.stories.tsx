import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthHeading } from "@/components/auth/auth-heading";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/AuthHeading",
  component: AuthHeading,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
  args: {
    title: "Welcome back",
    description: "Sign in to continue",
  },
} satisfies Meta<typeof AuthHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(canvas.getByText("Sign in to continue")).toBeVisible();
    await expect(canvas.getByAltText("Whiteboard")).toBeVisible();
  },
};

export const SignUp: Story = {
  args: {
    title: "Create your account",
    description: "Get started with Whiteboard",
  },
};

export const PasswordReset: Story = {
  args: {
    title: "Reset your password",
    description: "We'll email you a reset code",
  },
};
