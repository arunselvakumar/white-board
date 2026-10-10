import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import WorkspacePage from "@/app/app/workspace/page";
import { HRMS_PATH } from "@/lib/hrms-nav";

const meta = {
  title: "App/WorkspaceIndex",
  component: WorkspacePage,
} satisfies Meta<typeof WorkspacePage>;

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
  },
};
