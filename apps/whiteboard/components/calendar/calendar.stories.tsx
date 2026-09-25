import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import type { CalendarItem } from "@/src/queries/calendar";

import { CalendarView } from "./calendar-view";

const items: CalendarItem[] = [
  { id: "10000000-0000-4000-8000-000000000001", batchId: "20000000-0000-4000-8000-000000000001", batchName: "DCA Morning", courseId: "30000000-0000-4000-8000-000000000001", courseName: "DCA", studentName: null, classMode: "offline", room: "Lab 1", joinUrl: null, timezone: "Asia/Kolkata", timings: [{ daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" }], activeFrom: "2025-01-01T00:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000002", batchId: "20000000-0000-4000-8000-000000000002", batchName: "Python Evening", courseId: "30000000-0000-4000-8000-000000000002", courseName: "Python", studentName: null, classMode: "online", room: null, joinUrl: "https://example.com", timezone: "Asia/Kolkata", timings: [{ daysOfWeek: [1, 3, 5], startTime: "17:00", endTime: "18:30" }], activeFrom: "2025-01-01T00:00:00.000Z" },
];

const meta = { title: "Pages/Calendar", component: CalendarView, parameters: { layout: "fullscreen" } } satisfies Meta<typeof CalendarView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Weekly: Story = {
  args: { items },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Month" }));
    await expect(canvas.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    await expect(canvas.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No Batch Timings to show" })).toBeVisible();
  },
};
