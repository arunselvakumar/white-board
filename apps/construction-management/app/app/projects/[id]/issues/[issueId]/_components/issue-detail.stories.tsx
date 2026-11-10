import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  CLOSED_ID,
  INSPECTION_ID,
  issue,
  ISSUE_PROJECT_ID,
  ISSUES_API,
  mockIssueApi,
  PENDING_ID,
  SOLVED_ID,
  type IssueApiOptions,
} from "./issue-fixtures";
import { IssueDetail } from "./issue-detail";

let api: ReturnType<typeof mockIssueApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function issueApi(options: IssueApiOptions = {}) {
  return () => {
    api = mockIssueApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${ISSUE_PROJECT_ID}/issues`;

const meta = {
  title: "Tracking/Issues/Detail",
  component: IssueDetail,
  args: { projectId: ISSUE_PROJECT_ID, id: PENDING_ID },
  beforeEach: issueApi(),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${PENDING_ID}` } },
  },
  render: (args) => (
    <StoryQueries>
      <IssueDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof IssueDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pending issue: its fields, the Progress thread, history, Mark As Solved. */
export const Pending: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "ISS/26-27/00004" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Plaster cracks on the east wall of the stair core"),
    ).toBeVisible();
    await expect(canvas.getAllByText("High")[0]).toBeVisible();
    await expect(
      canvas.getByText("Karthik R", { selector: "dd" }),
    ).toBeVisible();
    await expect(
      await canvas.findByText("Location · Pump house"),
    ).toBeVisible();
    const updates = within(
      await canvas.findByRole("list", { name: "Updates" }),
    );
    await expect(
      updates.getByText("Mason called for tomorrow morning."),
    ).toBeVisible();
    await expect(
      updates.getByRole("list", {
        name: "Images of the update by Arun Selva Kumar",
      }),
    ).toBeVisible();
    // Only the viewer's own recent update can be deleted.
    await expect(
      updates.getAllByRole("button", { name: "Delete" }),
    ).toHaveLength(1);
    await expect(
      within(canvas.getByRole("list", { name: "History" })).getByText("Raised"),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Verify" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark As Solved" }),
    );
    await waitFor(async () => {
      await expect(posts(`${ISSUES_API}/${PENDING_ID}/solve`)).toHaveLength(1);
    });
    await expect(await canvas.findByText("Solved")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Verify" })).toBeVisible();
  },
};

/** Add Update: a comment is posted to the thread. */
export const AddUpdate: Story = {
  play: async ({ canvas, userEvent }) => {
    const composer = within(
      await canvas.findByRole("form", { name: "Add Update" }),
    );
    await userEvent.click(
      composer.getByRole("button", { name: "Post update" }),
    );
    await expect(
      await composer.findByText("Write a comment or add images."),
    ).toBeVisible();
    await userEvent.type(
      composer.getByLabelText("Add Update"),
      "Second coat done",
    );
    await userEvent.click(
      composer.getByRole("button", { name: "Post update" }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${ISSUES_API}/${PENDING_ID}/progress`)[0]?.body,
      ).toEqual({ body: "Second coat done", fileIds: [] });
    });
    await expect(await canvas.findByText("Second coat done")).toBeVisible();
  },
};

/** A solved issue is verified by an approver. */
export const Verify: Story = {
  args: { id: SOLVED_ID },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "ISS/26-27/00002" }),
    ).toBeVisible();
    await expect(canvas.getByText("Solved On")).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await waitFor(async () => {
      await expect(posts(`${ISSUES_API}/${SOLVED_ID}/verify`)).toHaveLength(1);
    });
    await expect(await canvas.findByText("Closed On")).toBeVisible();
  },
};

/** A closed snag from a rejected inspection links to it and can be reopened with a reason. */
export const ClosedFromInspection: Story = {
  args: { id: CLOSED_ID },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("link", { name: "IR/26-27/00007" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${ISSUE_PROJECT_ID}/inspections/${INSPECTION_ID}`,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reopen" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Cracks came back");
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await waitFor(async () => {
      await expect(posts(`${ISSUES_API}/${CLOSED_ID}/reopen`)[0]?.body).toEqual(
        { reason: "Cracks came back" },
      );
    });
  },
};

/** Read only: no actions, no composer. */
export const ReadOnly: Story = {
  beforeEach: issueApi({
    flags: { "tracking.issues": ["read", "view_all"] },
    progress: [],
    issues: [
      {
        ...issue(),
        actions: {
          edit: false,
          delete: false,
          solve: false,
          verify: false,
          reopen: false,
          postUpdate: false,
        },
      },
    ],
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "ISS/26-27/00004" });
    for (const name of ["Mark As Solved", "Verify", "Reopen", "Delete"])
      await expect(canvas.queryByRole("button", { name })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(canvas.queryByRole("form", { name: "Add Update" })).toBeNull();
  },
};
