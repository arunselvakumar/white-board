import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { StudentAvatar } from "./student-avatar";

const meta = {
  title: "Components/Student Avatar",
  component: StudentAvatar,
  parameters: { layout: "centered" },
} satisfies Meta<typeof StudentAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SameStudent: Story = {
  args: { studentId: "student-arun", name: "Arun Selva Kumar" },
  render: (args) => (
    <div className="flex items-center gap-4">
      <StudentAvatar {...args} className="size-10" />
      <StudentAvatar {...args} name="Arun Kumar" className="size-14" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const fallbacks = canvasElement.querySelectorAll(
      '[data-slot="avatar-fallback"]',
    );
    await expect(fallbacks).toHaveLength(2);
    await expect(fallbacks[0]?.className).toBe(fallbacks[1]?.className);
    await expect(fallbacks[0]?.textContent).toBe("AS");
    await expect(fallbacks[1]?.textContent).toBe("AK");
  },
};
