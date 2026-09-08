import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthHeading } from "@/components/auth/auth-heading";
import { PublicShell } from "@/components/auth/public-shell";

const meta = {
  title: "Auth/PublicShell",
  component: PublicShell,
  tags: ["autodocs"],
  args: {
    background: "/images/login/1.jpg",
    children: (
      <AuthHeading title="Welcome back" description="Sign in to continue" />
    ),
  },
} satisfies Meta<typeof PublicShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  },
};
