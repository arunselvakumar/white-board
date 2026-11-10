import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { CalendarItem } from "@/src/queries/calendar";

import { OnlineClassesView } from "./online-classes-view";

const items: CalendarItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    batchId: "20000000-0000-4000-8000-000000000001",
    batchName: "Python Morning",
    courseId: "30000000-0000-4000-8000-000000000001",
    courseName: "Python",
    studentName: "Asha",
    classMode: "online",
    meetingOption: "external",
    room: null,
    joinUrl: "https://meet.google.com/example",
    timezone: "Asia/Kolkata",
    timings: [{ daysOfWeek: [0, 1], startTime: "09:00", endTime: "10:30" }],
    activeFrom: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    batchId: "20000000-0000-4000-8000-000000000002",
    batchName: "Tally Evening",
    courseId: "30000000-0000-4000-8000-000000000002",
    courseName: "Tally",
    studentName: null,
    classMode: "hybrid",
    meetingOption: "whiteboard",
    room: "Lab 2",
    joinUrl: null,
    timezone: "Asia/Kolkata",
    timings: [{ daysOfWeek: [2], startTime: "17:00", endTime: "18:00" }],
    activeFrom: "2026-01-01T00:00:00.000Z",
  },
];

const meta = {
  title: "Pages/Online Classes",
  component: OnlineClassesView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OnlineClassesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
  args: { items, now: new Date("2026-10-04T06:00:00.000Z") },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Online Classes" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: /Open Python class/i })[0],
    ).toHaveAttribute(
      "href",
      "/classes/20000000-0000-4000-8000-000000000001/2026-10-04/09%3A00",
    );
    await expect(canvas.getAllByText(/Asha/)[0]).toBeVisible();
  },
};

export const Empty: Story = {
  args: { items: [], now: new Date("2026-10-04T06:00:00.000Z") },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "No upcoming online classes" }),
    ).toBeVisible();
  },
};
