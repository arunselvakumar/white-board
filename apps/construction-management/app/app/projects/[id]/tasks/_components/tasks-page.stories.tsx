import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  mockTaskApi,
  ROOT_ID,
  task,
  TASK_PROJECT_ID,
  TASKS,
  TASKS_API,
  type TaskApiOptions,
} from "./task-fixtures";
import { TasksPage } from "./tasks-page";

let api: ReturnType<typeof mockTaskApi>;

function taskApi(options: TaskApiOptions = {}) {
  return () => {
    api = mockTaskApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${TASK_PROJECT_ID}/tasks`;

const meta = {
  title: "Tracking/Tasks/List",
  component: TasksPage,
  args: { projectId: TASK_PROJECT_ID },
  beforeEach: taskApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <TasksPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TasksPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** The tree: Task No., name, assignees, dates, progress and the derived status. */
export const Tree: Story = {
  play: async ({ canvas, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(4);
    const columns = within(
      list.getByRole("listitem", { name: "T-2 Ground floor columns" }),
    );
    await expect(
      columns.getByRole("link", { name: "Ground floor columns" }),
    ).toHaveAttribute("href", `${BASE}/${TASKS[1]?.id ?? ""}`);
    await expect(columns.getByText("In Progress")).toBeVisible();
    await expect(columns.getByText("High")).toBeVisible();
    await expect(
      columns.getByRole("progressbar", { name: "Progress of T-2" }),
    ).toHaveAttribute("aria-valuenow", "37.5");
    await expect(
      within(
        list.getByRole("listitem", { name: "T-4 External plastering" }),
      ).getByText("Delayed"),
    ).toBeVisible();
    await userEvent.click(list.getByRole("button", { name: "Collapse T-1" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      canvas.getByRole("link", { name: "Add Task" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** Status and search filter the tree. */
export const Filters: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Tasks" });
    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Delayed" }),
    );
    await waitFor(async () => {
      await expect(
        within(canvas.getByRole("list", { name: "Tasks" })).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(1);
    });
    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search by Task No. or name" }),
      "nothing like this",
    );
    await waitFor(async () => {
      await expect(canvas.getByText("No tasks match")).toBeVisible();
    });
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await expect(
      canvas.getByRole("combobox", { name: "Assignee" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("From")).toBeVisible();
  },
};

/** Bulk delete names the sub-tasks that go with the chosen tasks. */
export const BulkDelete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    await userEvent.click(list.getByRole("checkbox", { name: "Select T-1" }));
    await userEvent.click(list.getByRole("checkbox", { name: "Select T-2" }));
    await userEvent.click(list.getByRole("checkbox", { name: "Select T-4" }));
    await expect(canvas.getByText("3 selected")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    const dialog = within(
      await body(canvasElement).findByRole("alertdialog", {
        name: "Delete 2 tasks?",
      }),
    );
    await expect(
      dialog.getByText(/Their 2 sub-tasks go with them/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      const posted = api.calls.mock.calls
        .map(([call]) => call)
        .filter((call) => call.path === `${TASKS_API}/bulk-delete`);
      await expect(posted).toHaveLength(1);
      await expect(posted[0]?.body).toEqual({
        projectId: TASK_PROJECT_ID,
        ids: [ROOT_ID, TASKS[1]?.id, TASKS[3]?.id],
      });
    });
  },
};

/** Another page starts with nothing selected: Delete takes only what is on screen. */
export const PageClearsSelection: Story = {
  beforeEach: taskApi({ paged: true }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = () => within(canvas.getByRole("list", { name: "Tasks" }));
    await canvas.findByRole("list", { name: "Tasks" });
    await userEvent.click(list().getByRole("checkbox", { name: "Select T-1" }));
    await expect(canvas.getByText("1 selected")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    const plaster = await canvas.findByRole("checkbox", {
      name: "Select T-4",
    });
    await expect(canvas.queryByText(/selected$/)).toBeNull();
    await userEvent.click(plaster);
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    const dialog = within(
      await body(canvasElement).findByRole("alertdialog", {
        name: "Delete 1 task?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      const posted = api.calls.mock.calls
        .map(([call]) => call)
        .filter((call) => call.path === `${TASKS_API}/bulk-delete`);
      await expect(posted[0]?.body).toEqual({
        projectId: TASK_PROJECT_ID,
        ids: [TASKS[3]?.id],
      });
    });
  },
};

/** A task a Daily Worksheet names stops the whole delete; each one is listed. */
export const DeleteInUse: Story = {
  beforeEach: taskApi({
    deleteError: {
      status: 409,
      code: "TASK_IN_USE",
      message: "T-2 is named by 2 Daily Worksheets. Unlink them first.",
      details: {
        worksheetCount: 2,
        tasks: [
          {
            id: TASKS[1]?.id,
            taskNo: 2,
            name: "Ground floor columns",
            worksheetCount: 2,
          },
        ],
      },
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    await userEvent.click(list.getByRole("checkbox", { name: "Select T-1" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(await body(canvasElement).findByRole("alertdialog")).getByRole(
        "button",
        { name: "Delete" },
      ),
    );
    await expect(
      await canvas.findByText(
        "T-2 is named by 2 Daily Worksheets. Unlink them first.",
      ),
    ).toBeVisible();
    await expect(
      within(
        canvas.getByRole("list", { name: "Tasks named by Daily Worksheets" }),
      ).getByText("T-2 Ground floor columns: 2 worksheets"),
    ).toBeVisible();
  },
};

/** Without View all, ancestors of the member's tasks show greyed and cannot be opened. */
export const ContextRows: Story = {
  beforeEach: taskApi({
    flags: { "tracking.tasks": ["read", "update"] },
    tasks: [
      task({
        id: ROOT_ID,
        taskNo: 1,
        label: "T-1",
        parentId: null,
        depth: 1,
        name: "Tower A structure",
        isSummary: true,
        childCount: 1,
        descendantCount: 1,
        contextOnly: true,
        matched: false,
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
      task(),
    ],
  }),
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    const context = within(
      list.getByRole("listitem", { name: "T-1 Tower A structure" }),
    );
    await expect(context.getByText("(shown for context)")).toBeVisible();
    await expect(context.queryByRole("link")).toBeNull();
    await expect(list.queryByRole("checkbox")).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Add Task" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Import" })).toBeNull();
  },
};

/** An empty Project offers Add Task to members with Create. */
export const Empty: Story = {
  beforeEach: taskApi({ tasks: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No tasks yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Task" }),
    ).toHaveLength(2);
  },
};

/** The Gantt tab charts the same tree. */
export const GanttTab: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Tasks" });
    await userEvent.click(canvas.getByRole("tab", { name: "Gantt" }));
    await expect(
      await canvas.findByRole("list", { name: "Gantt rows" }),
    ).toBeVisible();
  },
};
