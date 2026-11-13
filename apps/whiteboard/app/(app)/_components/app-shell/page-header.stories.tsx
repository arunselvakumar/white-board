import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "@repo/ui/components/button";

import { PageHeader } from "./page-header";

const meta = {
  title: "Workspace/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
  args: { title: "Students" },
  decorators: [
    (Story) => (
      <div className="w-full p-6">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

function watermarkOf(canvasElement: HTMLElement) {
  return canvasElement.querySelector('[data-slot="page-watermark"]');
}

export const ListPage: Story = {
  args: {
    meta: "Student records and Guardian contacts for this Workspace.",
    actions: <Button>Add Student</Button>,
  },
  play: async ({ canvas, canvasElement }) => {
    // The watermark is CSS generated content, so the heading is the only
    // element that holds the title as text.
    await expect(canvas.getByText("Students")).toBe(
      canvas.getByRole("heading", { level: 1 }),
    );
    const watermark = watermarkOf(canvasElement);
    await expect(watermark).toHaveAttribute("data-text", "Students");
    await expect(watermark).toHaveAttribute("aria-hidden", "true");
  },
};

export const RecordPage: Story = {
  args: {
    back: { label: "Students", href: "/students" },
    title: "Asha Kumar",
    watermark: "Students",
    meta: "98765 43210 · Active",
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Asha Kumar",
    );
    await expect(watermarkOf(canvasElement)).toHaveAttribute(
      "data-text",
      "Students",
    );
  },
};

/** A name wider than the page is paint only: it never widens its parent. */
export const LongTitle: Story = {
  args: { title: "Homework and Study Material" },
  decorators: [
    (Story) => (
      <div data-testid="phone" style={{ width: 375 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("phone").scrollWidth).toBeLessThanOrEqual(
      375,
    );
  },
};
