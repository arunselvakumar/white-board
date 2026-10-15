import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { ImportTasksDialog } from "./import-tasks-dialog";
import { TASK_PROJECT_ID, taskHandler } from "./task-fixtures";

const meta = {
  title: "Tracking/Tasks/Import",
  component: ImportTasksDialog,
  args: { projectId: TASK_PROJECT_ID, open: true, onClose: fn() },
  render: (args) => (
    <StoryQueries>
      <ImportTasksDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportTasksDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const file = () =>
  new File(["xlsx"], "tasks.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

/** Any problem imports nothing; each one is listed by row and column. */
export const RowErrors: Story = {
  beforeEach: () =>
    mockApi(
      taskHandler({
        importErrors: [
          { row: 3, field: "Parent Ref", message: "No row has Ref “Z”." },
          {
            row: 5,
            field: "Assignees",
            message: "No Team Member on this Project is named “Ravi”.",
          },
        ],
      }),
    ).restore,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await page.findByRole("dialog", { name: "Import tasks" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute(
      "href",
      `/api/construction/tracking/tasks/import-sample?projectId=${TASK_PROJECT_ID}`,
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), file());
    const problems = within(
      await dialog.findByRole("list", { name: "Problems in the sheet" }),
    );
    await expect(problems.getByText("Row 3")).toBeVisible();
    await expect(problems.getByText(/No row has Ref “Z”/)).toBeVisible();
    await expect(
      dialog.getByText("2 problems; nothing was imported."),
    ).toBeVisible();
  },
};

/** A clean sheet: every row becomes a task. */
export const Imported: Story = {
  beforeEach: () => mockApi(taskHandler()).restore,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await page.findByRole("dialog", { name: "Import tasks" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), file());
    await expect(await dialog.findByRole("status")).toHaveTextContent(
      "12 tasks imported.",
    );
  },
};
