import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import MastersPage from "@/app/app/masters/page";
import { MASTERS_GROUPS } from "@/lib/masters-nav";

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
    for (const group of MASTERS_GROUPS) {
      const region = within(canvas.getByRole("region", { name: group.label }));
      await expect(
        region.getByRole("heading", { name: group.label }),
      ).toBeVisible();
      for (const section of group.sections)
        await expect(
          region.getByRole("link", { name: new RegExp(section.title) }),
        ).toHaveAttribute("href", section.href);
    }
  },
};
