import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  INQUIRY_PROJECT_ID,
  INQUIRY_TODAY,
  inquiry,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";
import { InquiryTasksPanel } from "./inquiry-tasks-panel";

let api: ReturnType<typeof mockInquiryApi>;

function posts(suffix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(suffix));
}

function serve(options: InquiryApiOptions = {}) {
  return () => {
    api = mockInquiryApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Sales/Inquiries/Tasks panel",
  component: InquiryTasksPanel,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    inquiry: inquiry(),
    today: INQUIRY_TODAY,
  },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-sm p-4">
        <InquiryTasksPanel {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryTasksPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open tasks with their Due date (late ones say Overdue), then done ones. */
export const Tasks: Story = {
  play: async ({ canvas, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    await expect(list.getByText(/Overdue · 13 Oct 2026/)).toBeVisible();
    await expect(canvas.getByText("2 open")).toBeVisible();
    await userEvent.click(
      list.getByRole("checkbox", {
        name: "Mark Send the brochure on WhatsApp done",
      }),
    );
    await waitFor(() => expect(posts("/done")).toHaveLength(1));
    await waitFor(() => expect(canvas.getByText("1 open")).toBeVisible());
  },
};

/** Add a task in its dialog: the title is required. */
export const AddTask: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Tasks" });
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add task" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(await dialog.findByText("Enter the task.")).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Task"),
      "Book the site visit car",
    );
    await userEvent.type(dialog.getByLabelText("Due date"), "2026-10-16");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await canvas.findByText("Book the site visit car"),
    ).toBeVisible();
    await expect(posts("/tasks").at(-1)?.body).toEqual({
      title: "Book the site visit car",
      dueDate: "2026-10-16",
      assigneeMemberId: null,
    });
  },
};

/** Edit and delete from a task's menu. */
export const EditAndDelete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Tasks" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      list.getByRole("button", { name: "Actions for Share the price list" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit task" }),
    );
    await expect(dialog.getByLabelText("Task")).toHaveValue(
      "Share the price list",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      list.getByRole("button", { name: "Actions for Share the price list" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(list.queryByText("Share the price list")).toBeNull(),
    );
  },
};

/** No tasks yet; without Update nothing to add or tick. */
export const EmptyReadOnly: Story = {
  beforeEach: serve({ tasks: [], canManageTasks: false }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/No tasks/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Add task" })).toBeNull();
  },
};
