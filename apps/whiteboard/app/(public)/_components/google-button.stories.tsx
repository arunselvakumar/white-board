import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { GoogleButton } from "@/components/auth/google-button";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/GoogleButton",
  component: GoogleButton,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
  args: {
    label: "Continue with Google",
    disabled: false,
    onClick: fn(),
  },
} satisfies Meta<typeof GoogleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole("button", {
      name: "Continue with Google",
    });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
  },
};
