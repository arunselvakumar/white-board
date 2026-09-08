import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthHeader } from "@/components/auth-header";

const meta = {
  title: "Workspace/AuthHeader",
  component: AuthHeader,
  tags: ["autodocs"],
} satisfies Meta<typeof AuthHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Whiteboard")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open user menu" }),
    ).toBeVisible();
  },
};
