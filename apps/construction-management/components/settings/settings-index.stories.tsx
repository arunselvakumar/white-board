import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import SettingsPage from "@/app/app/masters/settings/page";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";

const meta = {
  title: "Settings/SettingsIndex",
  component: SettingsPage,
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Back to Masters/ }),
    ).toHaveAttribute("href", "/app/masters");
    const list = within(canvas.getByRole("list"));
    for (const section of SETTINGS_SECTIONS)
      await expect(
        list.getByRole("link", { name: new RegExp(section.title) }),
      ).toHaveAttribute("href", section.href);
  },
};
