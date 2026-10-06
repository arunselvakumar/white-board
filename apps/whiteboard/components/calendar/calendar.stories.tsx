import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { addDays, dateKeyInZone } from "@/lib/calendar-dates";
import type {
  CalendarItem,
  ClassChange,
  Holiday,
} from "@/src/queries/calendar";

import { CalendarView } from "./calendar-view";

const items: CalendarItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    batchId: "20000000-0000-4000-8000-000000000001",
    batchName: "DCA Morning",
    courseId: "30000000-0000-4000-8000-000000000001",
    courseName: "DCA",
    studentName: null,
    classMode: "offline",
    meetingOption: "external",
    room: "Lab 1",
    joinUrl: null,
    timezone: "Asia/Kolkata",
    timings: [
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
    ],
    activeFrom: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    batchId: "20000000-0000-4000-8000-000000000002",
    batchName: "Python Evening",
    courseId: "30000000-0000-4000-8000-000000000002",
    courseName: "Python",
    studentName: null,
    classMode: "online",
    meetingOption: "external",
    room: null,
    joinUrl: "https://example.com",
    timezone: "Asia/Kolkata",
    timings: [{ daysOfWeek: [1, 3, 5], startTime: "17:00", endTime: "18:30" }],
    activeFrom: "2025-01-01T00:00:00.000Z",
  },
];

const meta = {
  title: "Pages/Calendar",
  component: CalendarView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CalendarView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Weekly: Story = {
  args: { items },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Calendar" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Month" }));
    await expect(canvas.getByRole("button", { name: "Month" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    await expect(canvas.getByRole("button", { name: "Day" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "No Batch Timings to show" }),
    ).toBeVisible();
  },
};

const today = dateKeyInZone(new Date(), "Asia/Kolkata");
const everyDay: CalendarItem = {
  id: "10000000-0000-4000-8000-000000000003",
  batchId: "20000000-0000-4000-8000-000000000003",
  batchName: "DCA Weekday 9–11",
  courseId: "30000000-0000-4000-8000-000000000001",
  courseName: "DCA",
  studentName: null,
  classMode: "offline",
  meetingOption: "external",
  room: "Lab 1",
  joinUrl: null,
  timezone: "Asia/Kolkata",
  timings: [
    { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "11:00" },
  ],
  activeFrom: "2025-01-01T00:00:00.000Z",
};
const classChanges: ClassChange[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    batchId: everyDay.batchId,
    date: addDays(today, 1),
    startTime: "09:00",
    endTime: "11:00",
    kind: "cancelled",
    reason: "Pongal",
    movedTo: null,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    batchId: everyDay.batchId,
    date: addDays(today, 2),
    startTime: "09:00",
    endTime: "11:00",
    kind: "moved",
    reason: "Teacher travelling",
    movedTo: { date: addDays(today, 3), startTime: "16:00", endTime: "18:00" },
  },
];
const holidays: Holiday[] = [
  {
    id: "50000000-0000-4000-8000-000000000001",
    startDate: addDays(today, 5),
    endDate: addDays(today, 6),
    reason: "Diwali",
  },
];

export const WithClassChanges: Story = {
  args: { items: [everyDay], classChanges, holidays },
  play: async ({ canvas }) => {
    const upcoming = within(
      canvas.getByRole("region", { name: /Upcoming changes/ }),
    );
    await expect(upcoming.getByText("Cancelled · Pongal")).toBeVisible();
    await expect(
      upcoming.getByText(/Moved to .* 4:00 PM · Teacher travelling/),
    ).toBeVisible();
    await expect(upcoming.getByText(/Diwali/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Holidays" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Change / })).toBeNull();
  },
};

export const OwnerCancelsAClass: Story = {
  args: {
    items: [everyDay],
    permissions: { changeClasses: true, manageHolidays: true },
    classActions: {
      onCancel: fn(() => Promise.resolve()),
      onMove: fn(() => Promise.resolve()),
      onRestore: fn(() => Promise.resolve()),
    },
    holidayActions: {
      onDeclare: fn(() => Promise.resolve()),
      onRemove: fn(() => Promise.resolve()),
    },
  },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(
      canvas.getByRole("button", { name: /^Change DCA, DCA Weekday 9–11/ }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Cancel class" }),
    );
    await userEvent.type(body.getByLabelText("Reason (optional)"), "Pongal");
    await userEvent.click(body.getByRole("button", { name: "Cancel class" }));
    await waitFor(() =>
      expect(args.classActions?.onCancel).toHaveBeenCalledWith(
        {
          batchId: everyDay.batchId,
          date: addDays(today, 1),
          startTime: "09:00",
        },
        "Pongal",
      ),
    );
  },
};

export const OwnerMovesAClass: Story = {
  args: OwnerCancelsAClass.args,
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(
      canvas.getByRole("button", { name: /^Change DCA, DCA Weekday 9–11/ }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Move class" }),
    );
    const start = body.getByLabelText("Start");
    const end = body.getByLabelText("End");
    await userEvent.clear(end);
    await userEvent.type(end, "08:00");
    await userEvent.click(body.getByRole("button", { name: "Move class" }));
    await waitFor(() =>
      expect(
        body.getByText("End time must be after the start time."),
      ).toBeVisible(),
    );
    await userEvent.clear(start);
    await userEvent.type(start, "16:00");
    await userEvent.clear(end);
    await userEvent.type(end, "18:00");
    await userEvent.click(body.getByRole("button", { name: "Move class" }));
    await waitFor(() =>
      expect(args.classActions?.onMove).toHaveBeenCalledWith(
        {
          batchId: everyDay.batchId,
          date: addDays(today, 1),
          startTime: "09:00",
        },
        {
          date: addDays(today, 1),
          startTime: "16:00",
          endTime: "18:00",
          reason: null,
        },
      ),
    );
  },
};

export const OwnerRestoresACancelledClass: Story = {
  args: { ...OwnerCancelsAClass.args, classChanges, holidays },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(
      canvas.getByRole("button", { name: /^Change DCA, .*Cancelled · Pongal/ }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByText("Cancelled · Pongal")).toBeVisible(),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Restore class" }),
    );
    await waitFor(() =>
      expect(args.classActions?.onRestore).toHaveBeenCalledWith({
        batchId: everyDay.batchId,
        date: addDays(today, 1),
        startTime: "09:00",
      }),
    );
  },
};

export const OwnerDeclaresAHoliday: Story = {
  args: OwnerCancelsAClass.args,
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Holidays" }));
    await waitFor(() =>
      expect(body.getByText("No Holidays declared.")).toBeVisible(),
    );
    const first = body.getByLabelText("First day");
    const last = body.getByLabelText("Last day");
    await userEvent.clear(first);
    await userEvent.type(first, addDays(today, 4));
    await userEvent.clear(last);
    await userEvent.type(last, addDays(today, 3));
    await userEvent.click(
      body.getByRole("button", { name: "Declare Holiday" }),
    );
    await waitFor(() =>
      expect(
        body.getByText("The last day must be on or after the first day."),
      ).toBeVisible(),
    );
    await userEvent.clear(last);
    await userEvent.type(last, addDays(today, 6));
    await userEvent.type(body.getByLabelText("Reason (optional)"), "Diwali");
    await userEvent.click(
      body.getByRole("button", { name: "Declare Holiday" }),
    );
    await waitFor(() =>
      expect(args.holidayActions?.onDeclare).toHaveBeenCalledWith({
        startDate: addDays(today, 4),
        endDate: addDays(today, 6),
        reason: "Diwali",
      }),
    );
  },
};
