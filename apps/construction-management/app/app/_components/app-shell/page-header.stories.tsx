import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "@repo/ui/components/button";

import { PageHeader } from "./page-header";
import { PageHeaderSkeleton } from "./page-header-skeleton";

const meta = {
  title: "App/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
  args: { title: "Vendors" },
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
    meta: "Suppliers and contractors across your Projects.",
    actions: <Button>Add Vendor</Button>,
  },
  play: async ({ canvas, canvasElement }) => {
    // The watermark is CSS generated content, so the heading is the only
    // element that holds the title as text.
    await expect(canvas.getByText("Vendors")).toBe(
      canvas.getByRole("heading", { level: 1 }),
    );
    const watermark = watermarkOf(canvasElement);
    await expect(watermark).toHaveAttribute("data-text", "Vendors");
    await expect(watermark).toHaveAttribute("aria-hidden", "true");
  },
};

export const RecordPage: Story = {
  args: {
    back: { label: "Vendors", href: "/app/staff/vendors" },
    title: "Sri Murugan Steels",
    watermark: "Vendors",
    meta: "Steel · 3 Projects",
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sri Murugan Steels",
    );
    await expect(watermarkOf(canvasElement)).toHaveAttribute(
      "data-text",
      "Vendors",
    );
  },
};

/** A title that is still loading has no name to draw. */
export const Loading: Story = {
  render: () => (
    <PageHeaderSkeleton
      back={{ label: "Vendors", href: "/app/staff/vendors" }}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(watermarkOf(canvasElement)).toBeNull();
  },
};

/** A name wider than the page is paint only: it never widens its parent. */
export const LongTitle: Story = {
  args: { title: "Prospect Companies and Follow-ups" },
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
