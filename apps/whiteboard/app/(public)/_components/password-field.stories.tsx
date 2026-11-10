import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { PasswordField } from "@/components/auth/password-field";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/PasswordField",
  component: PasswordField,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
  args: {
    id: "password",
    placeholder: "Enter your password",
    autoComplete: "current-password",
  },
} satisfies Meta<typeof PasswordField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hidden: Story = {
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByPlaceholderText("Enter your password");
    await userEvent.type(field, "secret-pass");
    await expect(field).toHaveAttribute("type", "password");
  },
};

export const Revealed: Story = {
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByPlaceholderText("Enter your password");
    await userEvent.type(field, "secret-pass");
    await userEvent.click(
      canvas.getByRole("button", { name: "Show password" }),
    );
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue("secret-pass");
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide password" }),
    );
    await expect(field).toHaveAttribute("type", "password");
  },
};
