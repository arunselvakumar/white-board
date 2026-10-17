import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { HRMS_PATH } from "@/lib/hrms-nav";

import { WorkspaceIndex } from "./workspace-index";

const meta = {
  title: "App/WorkspaceIndex",
  component: WorkspaceIndex,
  args: {
    centralStore: true,
    centralInventory: true,
    centralPayment: true,
    centralReports: true,
  },
} satisfies Meta<typeof WorkspaceIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Workspace" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: /^HRMS/ })).toHaveAttribute(
      "href",
      HRMS_PATH,
    );
    await expect(
      canvas.getByRole("link", { name: /^Central Store/ }),
    ).toHaveAttribute("href", "/app/workspace/central-store");
    await expect(
      canvas.getByRole("link", { name: /^Central Inventory/ }),
    ).toHaveAttribute("href", "/app/workspace/central-inventory");
    await expect(
      canvas.getByRole("link", { name: /^Central Payment/ }),
    ).toHaveAttribute("href", "/app/workspace/central-payment");
    await expect(
      canvas.getByRole("link", { name: /^Central Reports/ }),
    ).toHaveAttribute("href", "/app/workspace/central-reports");
  },
};

/** Without the Central Store menus only HRMS shows. */
export const HrmsOnly: Story = {
  args: {
    centralStore: false,
    centralInventory: false,
    centralPayment: false,
    centralReports: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: /^Central/ })).toBeNull();
  },
};
