import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { FormAlert } from "@/components/auth/form-alert";
import { withAuthFormFrame } from "../../.storybook/decorators";

const meta = {
  title: "Auth/FormAlert",
  component: FormAlert,
  tags: ["autodocs"],
  decorators: [withAuthFormFrame],
  args: {
    message: "Too many attempts. Please try again later.",
  },
} satisfies Meta<typeof FormAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithMessage: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
  },
};

export const Hidden: Story = {
  args: {
    message: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
