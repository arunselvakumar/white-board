import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  CONTRACTOR_ID,
  KARTHIK,
  mockTaskApi,
  ROOT_ID,
  SUMMARY_DETAIL,
  TAG_ID,
  TASK_PROJECT_ID,
  TASKS_API,
  taskDetail,
  UNIT_ID,
  type TaskApiOptions,
} from "./task-fixtures";
import { TaskForm } from "./task-form";

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
  title: "Tracking/Tasks/Form",
  component: TaskForm,
  args: { projectId: TASK_PROJECT_ID },
  beforeEach: taskApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <TaskForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TaskForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

async function choose(
  formElement: HTMLElement,
  canvasElement: HTMLElement,
  label: string,
  option: string,
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(
    within(formElement).getByRole("combobox", { name: label }),
  );
  await userEvent.click(
    await body(canvasElement).findByRole("option", { name: option }),
  );
}

/** A name is required; Due on or after Start; a quantity needs its unit. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: "New task" }));
    await userEvent.type(form.getByLabelText("Start Date"), "2026-10-10");
    await userEvent.type(form.getByLabelText("Due Date"), "2026-10-01");
    await userEvent.type(form.getByLabelText("Total work"), "48");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Enter the task's name.")).toBeVisible();
    await expect(
      form.getByText("The Due Date cannot be before the Start Date."),
    ).toBeVisible();
    await expect(form.getByText("Choose the unit.")).toBeVisible();
    await expect(posts(TASKS_API)).toHaveLength(0);
  },
};

/** A full task: assignees, dates, priority, Department, Contractor, a new tag, work and price. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", { name: "New task" });
    const form = within(formElement);
    await userEvent.type(
      form.getByLabelText("Task name"),
      "Ground floor columns",
    );
    await userEvent.click(form.getByLabelText("Assign to"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Karthik R" }),
    );
    await userEvent.type(form.getByLabelText("Start Date"), "2026-10-01");
    await userEvent.type(form.getByLabelText("Due Date"), "2026-10-15");
    await choose(formElement, canvasElement, "Priority", "High", userEvent);
    await choose(
      formElement,
      canvasElement,
      "Contractor",
      "Velan Constructions",
      userEvent,
    );
    await userEvent.click(form.getByLabelText("Tags"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Structure" }),
    );
    await userEvent.type(form.getByLabelText("Total work"), "48");
    await choose(formElement, canvasElement, "Unit", "Cum", userEvent);
    await userEvent.type(form.getByLabelText("Total Price"), "250000");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(TASKS_API)).toHaveLength(1);
    });
    await expect(posts(TASKS_API)[0]?.body).toMatchObject({
      projectId: TASK_PROJECT_ID,
      parentId: null,
      name: "Ground floor columns",
      assigneeIds: [KARTHIK],
      startDate: "2026-10-01",
      dueDate: "2026-10-15",
      priority: "high",
      contractorId: CONTRACTOR_ID,
      tagIds: [TAG_ID],
      totalWorkQty: "48",
      totalWorkUnitId: UNIT_ID,
      totalPrice: 25_000_000,
      siteLocation: null,
      extraLocations: [],
    });
    // Busy until the task's page opens.
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};

/** With Tags Create, a new name is created inline and chosen. */
export const CreateTagInline: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: "New task" }));
    await userEvent.type(form.getByLabelText("Tags"), "Critical path");
    await userEvent.click(
      await body(canvasElement).findByRole("option", {
        name: "Create “Critical path”",
      }),
    );
    await expect(
      await form.findByRole("button", { name: "Remove Critical path" }),
    ).toBeVisible();
    await expect(
      posts("/api/construction/masters/tags/ensure")[0]?.body,
    ).toEqual({ name: "Critical path" });
  },
};

/** Add Sub-Task names its parent. */
export const SubTask: Story = {
  args: { parent: { id: ROOT_ID, label: "T-1", name: "Tower A structure" } },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New sub-task of T-1" }),
    );
    await expect(
      form.getByText("Sub-task of T-1 Tower A structure"),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Task name"), "Columns");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(TASKS_API)[0]?.body).toMatchObject({
        parentId: ROOT_ID,
        name: "Columns",
      });
    });
  },
};

/** A summary task's dates, work and price roll up, so the form leaves them out. */
export const EditSummary: Story = {
  args: { task: SUMMARY_DETAIL },
  play: async ({ canvas }) => {
    const form = within(await canvas.findByRole("form", { name: "Edit T-1" }));
    await expect(form.getByLabelText("Task name")).toHaveValue(
      "Tower A structure",
    );
    await expect(
      form.getByText(/its dates, work, price and progress roll up/),
    ).toBeVisible();
    await expect(form.queryByLabelText("Start Date")).toBeNull();
    await expect(form.queryByLabelText("Total work")).toBeNull();
  },
};

/** Without Task Financial there is no Total Price. */
export const WithoutFinancial: Story = {
  args: { task: taskDetail({ totalPrice: null, financial: false }) },
  beforeEach: taskApi({ flags: { "tracking.tasks": ["read", "update"] } }),
  play: async ({ canvas }) => {
    const form = within(await canvas.findByRole("form", { name: "Edit T-2" }));
    await expect(form.getByLabelText("Total work")).toHaveValue("48");
    await expect(form.queryByLabelText("Total Price")).toBeNull();
  },
};

/** A server refusal lands on its field. */
export const ServerError: Story = {
  beforeEach: taskApi({
    saveError: {
      status: 400,
      code: "CONTRACTOR_NOT_ON_PROJECT",
      message: "Choose a Contractor assigned to this Project.",
      field: "contractorId",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: "New task" }));
    await userEvent.type(form.getByLabelText("Task name"), "Slab");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose a Contractor assigned to this Project."),
    ).toBeVisible();
  },
};
