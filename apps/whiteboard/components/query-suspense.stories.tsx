import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { PageFallback } from "@/components/query-suspense";

const meta = {
  title: "Workspace/PageFallback",
  component: PageFallback,
  tags: ["autodocs"],
} satisfies Meta<typeof PageFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[aria-busy="true"]'),
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
  },
};
