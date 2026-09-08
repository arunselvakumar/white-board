import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthDivider } from "@/components/auth/auth-divider";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/AuthDivider",
  component: AuthDivider,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
} satisfies Meta<typeof AuthDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("or")).toBeVisible();
  },
};
