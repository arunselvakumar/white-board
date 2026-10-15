import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  CLOSED_ID,
  ISSUE_PROJECT_ID,
  ISSUES_API,
  mockIssueApi,
} from "./issue-fixtures";
import { IssueReopenDialog } from "./issue-reopen-dialog";

let api: ReturnType<typeof mockIssueApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

const meta = {
  title: "Tracking/Issues/Reopen dialog",
  component: IssueReopenDialog,
  args: {
    issue: { id: CLOSED_ID, number: "ISS/26-27/00001" },
    open: true,
    onOpenChange: fn(),
  },
  beforeEach: () => {
    api = mockIssueApi();
    return api.restore;
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${ISSUE_PROJECT_ID}/issues/${CLOSED_ID}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <IssueReopenDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof IssueReopenDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A reason is required; Reopen sends it and closes the dialog. */
export const Reopen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Reopen ISS/26-27/00001?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await expect(await dialog.findByText("Write a reason.")).toBeVisible();
    await expect(posts(`${ISSUES_API}/${CLOSED_ID}/reopen`)).toHaveLength(0);
    await userEvent.type(dialog.getByLabelText("Reason"), "Seepage is back");
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await waitFor(async () => {
      await expect(posts(`${ISSUES_API}/${CLOSED_ID}/reopen`)[0]?.body).toEqual(
        { reason: "Seepage is back" },
      );
    });
    await waitFor(async () => {
      await expect(args.onOpenChange).toHaveBeenCalledWith(false);
    });
  },
};
