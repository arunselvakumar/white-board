import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import MastersPage from "@/app/app/masters/page";
import { MASTERS_SECTIONS } from "@/lib/masters-nav";

const meta = {
  title: "App/MastersIndex",
  component: MastersPage,
} satisfies Meta<typeof MastersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Masters" }),
    ).toBeVisible();
    const list = within(canvas.getByRole("list"));
    for (const section of MASTERS_SECTIONS)
      await expect(
        list.getByRole("link", { name: new RegExp(section.title) }),
      ).toHaveAttribute("href", section.href);
  },
};
