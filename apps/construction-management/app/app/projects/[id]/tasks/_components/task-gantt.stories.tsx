import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { localToday } from "@/components/payments/payment-format";
import { addDays } from "@/src/shared-kernel/calendar-date";

import { TaskGanttChart } from "./task-gantt";
import { task, TASK_PROJECT_ID, TASKS } from "./task-fixtures";

const meta = {
  title: "Tracking/Tasks/Gantt",
  component: TaskGanttChart,
  args: { projectId: TASK_PROJECT_ID, items: TASKS, today: localToday() },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${TASK_PROJECT_ID}/tasks` },
    },
  },
} satisfies Meta<typeof TaskGanttChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rows are the tree; a legend names each status colour, the baseline and Today. */
export const Chart: Story = {
  play: async ({ canvas, userEvent }) => {
    const rows = within(canvas.getByRole("list", { name: "Gantt rows" }));
    await expect(
      rows.getByRole("link", { name: /T-2 Ground floor columns/ }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${TASK_PROJECT_ID}/tasks/${TASKS[1]?.id ?? ""}`,
    );
    const legend = within(canvas.getByRole("list", { name: "Legend" }));
    for (const label of [
      "Not Started",
      "In Progress",
      "Delayed",
      "Completed",
      "Baseline",
      "Today",
    ])
      await expect(legend.getByText(label)).toBeVisible();
    // Collapse the summary task: its sub-tasks leave the chart.
    await userEvent.click(rows.getByRole("button", { name: "Collapse T-1" }));
    await expect(
      rows.queryByRole("link", { name: /Ground floor columns/ }),
    ).toBeNull();
    await expect(canvas.getByTestId("gantt-chart")).toHaveAttribute(
      "data-rows",
      "2",
    );
  },
};

/** Day, Week and Month scales change the chart's width. */
export const Scales: Story = {
  play: async ({ canvas, userEvent }) => {
    const chart = () => canvas.getByTestId("gantt-chart");
    const week = Number(chart().getAttribute("width"));
    await userEvent.click(canvas.getByRole("button", { name: "Day" }));
    const day = Number(chart().getAttribute("width"));
    await userEvent.click(canvas.getByRole("button", { name: "Month" }));
    const month = Number(chart().getAttribute("width"));
    await expect(day).toBeGreaterThan(week);
    await expect(week).toBeGreaterThan(month);
  },
};

/** On a phone the chart scrolls sideways inside its card; the page does not. */
export const Phone: Story = {
  args: {
    initialScale: "day",
    items: [
      ...TASKS,
      task({
        id: "0199c4a0-0000-7000-8000-0000000d1099",
        parentId: null,
        depth: 1,
        sortOrder: 9,
        taskNo: 9,
        label: "T-9",
        name: "Handover",
        startDate: addDays(localToday(), 60),
        dueDate: addDays(localToday(), 90),
      }),
    ],
  },
  render: (args) => (
    <div data-testid="phone" style={{ width: 375 }} className="p-4">
      <TaskGanttChart {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
    const scroller = canvas.getByTestId("gantt-scroll");
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
  },
};

/** Without dates there is nothing to chart. */
export const NoDates: Story = {
  args: {
    items: [
      task({
        startDate: null,
        dueDate: null,
        baselineStart: null,
        baselineEnd: null,
        actualStart: null,
      }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing to chart yet")).toBeVisible();
  },
};

/** On a wide screen the time axis runs to the card's right edge. */
export const FillsTheCard: Story = {
  args: { initialScale: "month" },
  render: (args) => (
    <div style={{ width: 1200 }}>
      <TaskGanttChart {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const scroller = canvas.getByTestId("gantt-scroll");
    await waitFor(async () => {
      await expect(scroller.scrollWidth).toBeGreaterThanOrEqual(
        scroller.clientWidth,
      );
      await expect(
        Number(canvas.getByTestId("gantt-chart").getAttribute("width")),
      ).toBeGreaterThanOrEqual(scroller.clientWidth - 168);
    });
  },
};
