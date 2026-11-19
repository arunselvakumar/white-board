import {
  BookOpenIcon,
  ChalkboardTeacherIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  StudentIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlusIcon } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { EmptyState } from "@repo/ui/components/empty-state";

const meta = {
  title: "UI/Empty State",
  component: EmptyState,
  args: {
    icon: BookOpenIcon,
    title: "No Courses yet",
    description:
      "Add the Courses you teach, such as DCA, Tally or Python, to open Batches for them.",
  },
  argTypes: {
    icon: { control: false },
    tone: {
      control: "inline-radio",
      options: ["neutral", "brand", "success", "warning", "danger"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
  render: (args) => (
    <div className="flex min-h-[420px] items-center justify-center p-4">
      <EmptyState {...args} />
    </div>
  ),
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: {
    actions: (
      <Button type="button">
        <PlusIcon aria-hidden="true" />
        New Course
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No Courses yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "New Course" }),
    ).toBeVisible();
    // The orbit and the centre tile are decoration only.
    const orbit = canvasElement.querySelector(
      '[data-slot="empty-state-orbit"] svg',
    );
    await expect(orbit).toHaveAttribute("aria-hidden", "true");
    await expect(
      canvasElement.querySelectorAll('[data-slot="empty-state-satellite"]'),
    ).toHaveLength(8);
    await expect(
      canvasElement.querySelector('[data-slot="empty-state-icon"]'),
    ).toHaveAttribute("aria-hidden", "true");
  },
};

const clearSearch = fn();

export const NoSearchResults: Story = {
  args: {
    icon: MagnifyingGlassIcon,
    tone: "neutral",
    title: "No Students found",
    description: (
      <>
        Your search &ldquo;Priya&rdquo; did not match any Students. Check the
        spelling or try another name.
      </>
    ),
    actions: (
      <>
        <Button type="button" variant="outline" onClick={clearSearch}>
          Clear search
        </Button>
        <Button type="button">
          <PlusIcon aria-hidden="true" />
          New Student
        </Button>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(clearSearch).toHaveBeenCalledOnce();
  },
};

export const InsideACard: Story = {
  args: {
    icon: StudentIcon,
    size: "md",
    title: "No Students in this Batch",
    description: "Enroll Students to take attendance and collect fees.",
    actions: (
      <Button type="button" variant="outline">
        Enroll a Student
      </Button>
    ),
  },
  render: (args) => (
    <div className="mx-auto max-w-xl p-4">
      <Card>
        <CardContent>
          <EmptyState {...args} />
        </CardContent>
      </Card>
    </div>
  ),
};

export const Compact: Story = {
  args: {
    icon: ReceiptIcon,
    size: "sm",
    title: "No Fee Payments yet",
    description: "Payments you take for this Enrollment appear here.",
  },
  render: (args) => (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-xl border">
        <EmptyState {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Small empty states keep to the tile: no orbit in a table or sheet.
    await expect(
      canvasElement.querySelector('[data-slot="empty-state-orbit"]'),
    ).toBeNull();
    await expect(
      canvasElement.querySelector('[data-slot="empty-state-icon"]'),
    ).toBeVisible();
  },
};

export const LoadError: Story = {
  args: {
    icon: WarningCircleIcon,
    tone: "danger",
    size: "md",
    orbit: false,
    title: "Couldn't load Fees",
    description: "Check your connection and try again.",
    actions: (
      <Button type="button" variant="outline">
        Try again
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-slot="empty-state-orbit"]'),
    ).toBeNull();
  },
};

export const Tones: Story = {
  render: () => (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {(["neutral", "brand", "success", "warning", "danger"] as const).map(
        (tone) => (
          <div key={tone} className="bg-card rounded-xl border">
            <EmptyState
              icon={ChalkboardTeacherIcon}
              tone={tone}
              size="md"
              title={`Tone: ${tone}`}
              description="Teachers you add appear here."
            />
          </div>
        ),
      )}
    </div>
  ),
};

export const Dark: Story = {
  ...Page,
  globals: { theme: "dark" },
};

export const Phone: Story = {
  ...Page,
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement }) => {
    // The orbit scales down with the column instead of overflowing it.
    const orbit = canvasElement.querySelector<HTMLElement>(
      '[data-slot="empty-state-orbit"]',
    );
    await expect(orbit).not.toBeNull();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  },
};
