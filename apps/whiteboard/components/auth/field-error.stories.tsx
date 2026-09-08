import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { FieldError } from "@/components/auth/field-error";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/FieldError",
  component: FieldError,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
  args: {
    message: "Email or username is required",
  },
} satisfies Meta<typeof FieldError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithMessage: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Email or username is required"),
    ).toBeVisible();
  },
};

export const Hidden: Story = {
  args: {
    message: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/required/i)).not.toBeInTheDocument();
  },
};
