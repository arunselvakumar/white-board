import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  COLUMNS_ID,
  mockTaskApi,
  ROOT_ID,
  TASK_PROJECT_ID,
  TASKS_API,
  taskDetail,
  type TaskApiOptions,
} from "./task-fixtures";
import { TaskDetail } from "./task-detail";

let api: ReturnType<typeof mockTaskApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function taskApi(options: TaskApiOptions = {}) {
  return () => {
    api = mockTaskApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${TASK_PROJECT_ID}/tasks`;

const meta = {
  title: "Tracking/Tasks/Detail",
  component: TaskDetail,
  args: { projectId: TASK_PROJECT_ID, id: COLUMNS_ID },
  beforeEach: taskApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/${COLUMNS_ID}` } } },
  render: (args) => (
    <StoryQueries>
      <TaskDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TaskDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** A leaf task: planned, baseline, actual, variance, work and earned value, updates and feed. */
export const Leaf: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "T-2 Ground floor columns" }),
    ).toBeVisible();
    const summary = within(canvas.getByRole("region", { name: "Summary" }));
    await expect(summary.getByText("In Progress")).toBeVisible();
    await expect(summary.getByText("3 days late")).toBeVisible();
    await expect(summary.getByText("18 Cum of 48 Cum")).toBeVisible();
    await expect(summary.getByText("₹2,50,000.00")).toBeVisible();
    await expect(summary.getByText("₹93,750.00")).toBeVisible();
    const updates = within(
      await canvas.findByRole("list", { name: "Progress updates" }),
    );
    await expect(updates.getByText("C13–C18 cast")).toBeVisible();
    await expect(
      updates.getByRole("link", { name: "WS/26-27/00012" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${TASK_PROJECT_ID}/worksheets/0199c4a0-0000-7000-8000-0000000d4001`,
    );
    // Worksheet updates are read-only here: one edit and one delete button.
    await expect(
      updates.getAllByRole("button", { name: /^Edit the update/ }),
    ).toHaveLength(1);
    await expect(
      within(await canvas.findByRole("list", { name: "Activity" })).getByText(
        "Assigned Karthik R",
      ),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "Baselines" })).getByText(
        /Captured from the planned dates/,
      ),
    ).toBeVisible();
  },
};

/** A summary task: sub-tasks rolled up by price; no progress of its own. */
export const Summary: Story = {
  args: { id: ROOT_ID },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "T-1 Tower A structure" }),
    ).toBeVisible();
    await expect(canvas.getByText("₹6,50,000.00")).toBeVisible();
    await expect(canvas.getByText("Rolled up by")).toBeVisible();
    const subTasks = within(canvas.getByRole("list", { name: "Sub-tasks" }));
    await expect(subTasks.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      canvas.queryByRole("button", { name: "Update Task Progress" }),
    ).toBeNull();
    await expect(canvas.queryByRole("region", { name: "Progress" })).toBeNull();
  },
};

/** Update Task Progress takes the work done in this update, in the task's unit. */
export const UpdateProgress: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Update Task Progress" }),
    );
    const dialog = within(
      await body(canvasElement).findByRole("dialog", {
        name: "Update Task Progress",
      }),
    );
    await expect(dialog.getByText(/18 Cum of 48 Cum done/)).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "Enter the work done, above 0, at most three decimals.",
      ),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Work done (Cum)"), "6.5");
    await userEvent.type(dialog.getByLabelText("Remark"), "C19–C22");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        posts(`${TASKS_API}/${COLUMNS_ID}/progress`)[0]?.body,
      ).toMatchObject({ workQty: "6.5", remark: "C19–C22", fileIds: [] });
    });
  },
};

/** A percent task takes the new percentage. */
export const UpdatePercent: Story = {
  beforeEach: taskApi({
    detail: taskDetail({
      kind: "percent",
      totalWorkQty: null,
      completedWorkQty: null,
      unit: null,
      progressPct: 40,
    }),
    progress: [],
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No progress recorded yet."),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Update Task Progress" }),
    );
    const dialog = within(
      await body(canvasElement).findByRole("dialog", {
        name: "Update Task Progress",
      }),
    );
    await userEvent.type(dialog.getByLabelText("Progress (%)"), "120");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter a percentage from 0 to 100."),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Progress (%)"));
    await userEvent.type(dialog.getByLabelText("Progress (%)"), "65");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        posts(`${TASKS_API}/${COLUMNS_ID}/progress`)[0]?.body,
      ).toMatchObject({ progressPct: 65 });
    });
  },
};

/** Mark As Completed records the remaining work. */
export const MarkAsCompleted: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark As Completed" }),
    );
    const dialog = within(
      await body(canvasElement).findByRole("dialog", {
        name: "Mark T-2 as completed",
      }),
    );
    await expect(dialog.getByText(/remaining 30 Cum/)).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark As Completed" }),
    );
    await waitFor(async () => {
      await expect(posts(`${TASKS_API}/${COLUMNS_ID}/complete`)).toHaveLength(
        1,
      );
    });
  },
};

/** Re-baseline needs a reason. */
export const Rebaseline: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Re-baseline" }),
    );
    const dialog = within(
      await body(canvasElement).findByRole("dialog", {
        name: "Re-baseline T-2",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Re-baseline" }));
    await expect(
      await dialog.findByText("Say why the baseline changes."),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Client moved the pour",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Re-baseline" }));
    await waitFor(async () => {
      await expect(
        posts(`${TASKS_API}/${COLUMNS_ID}/rebaseline`)[0]?.body,
      ).toMatchObject({ reason: "Client moved the pour" });
    });
  },
};

/** Without Financial, prices are not shown; without Update, no progress actions. */
export const ReadOnly: Story = {
  beforeEach: taskApi({
    detail: taskDetail({
      financial: false,
      totalPrice: null,
      completedPrice: null,
      actions: {
        edit: false,
        delete: false,
        addSubTask: false,
        copy: false,
        recordProgress: false,
        markCompleted: false,
        rebaseline: false,
      },
    }),
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "T-2 Ground floor columns" });
    await expect(canvas.queryByText("Total Price")).toBeNull();
    for (const name of [
      "Update Task Progress",
      "Mark As Completed",
      "Re-baseline",
      "Delete",
    ])
      await expect(canvas.queryByRole("button", { name })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
  },
};
