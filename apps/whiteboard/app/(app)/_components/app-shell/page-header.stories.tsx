import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
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

/** A page that loads, is left for one with no watermark, and is opened again. */
function LeaveAndComeBack() {
  const [view, setView] = useState<"loading" | "loaded" | "away">("loading");
  return (
    <div className="space-y-6">
      {view === "loading" && <PageHeader title="Students" />}
      {view === "loaded" && <PageHeader title="Students" meta="5 Students" />}
      {view === "away" && <p>A page with no watermark.</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setView("loaded");
          }}
        >
          Finish loading
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setView("away");
          }}
        >
          Leave
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setView("loading");
          }}
        >
          Come back
        </Button>
      </div>
    </div>
  );
}

/**
 * The name drifts in each time the page appears, and never again while the
 * page stays: the loaded screen joins the drift its skeleton began, and a
 * page opened again starts a new one.
 */
export const ComesBack: Story = {
  render: () => <LeaveAndComeBack />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    /** How far into its drift the watermark was when it mounted, in ms. */
    const joinedAt = () => {
      const watermark = watermarkOf(canvasElement);
      if (!(watermark instanceof HTMLElement)) throw new Error("No watermark");
      return -parseFloat(watermark.style.animationDelay);
    };

    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish loading" }),
    );
    await expect(joinedAt()).toBeGreaterThanOrEqual(250);

    await userEvent.click(canvas.getByRole("button", { name: "Leave" }));
    await expect(watermarkOf(canvasElement)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Come back" }));
    await expect(joinedAt()).toBeLessThan(100);
  },
};
