import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { WORKSHEETS_API } from "@/src/queries/worksheets";

import {
  mockWorksheetApi,
  PROJECT_ID,
  worksheet,
  type WorksheetApiOptions,
} from "./worksheet-fixtures";
import { WorksheetDetailPage } from "./worksheet-detail";

let api: ReturnType<typeof mockWorksheetApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function withApi(options: WorksheetApiOptions = {}) {
  return () => {
    api = mockWorksheetApi(options);
    return api.restore;
  };
}

const PENDING = worksheet({
  number: "WS/26-27/00021",
  approvalStatus: "pending",
  actions: {
    edit: true,
    delete: true,
    approve: true,
    reject: true,
    duplicate: true,
  },
});

const REJECTED = worksheet({
  number: "WS/26-27/00022",
  approvalStatus: "rejected",
  decidedAt: "2026-10-10T12:30:00.000Z",
  decidedBy: { userId: "user-arun", name: "Arun Selva Kumar" },
  rejectionReason: "Counts do not match attendance",
});

const meta = {
  title: "Site work/Daily Worksheet/Detail",
  component: WorksheetDetailPage,
  args: { projectId: PROJECT_ID, id: PENDING.id },
  beforeEach: withApi({ items: [PENDING] }),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <WorksheetDetailPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorksheetDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything on the sheet, its approval actions, remarks and photos. */
export const Pending: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "WS/26-27/00021" }),
    ).toBeVisible();
    await expect(canvas.getByText("Pending")).toBeVisible();
    await expect(
      await canvas.findByText("Location · Pump house"),
    ).toBeVisible();
    await expect(canvas.getByText("Velan Constructions")).toBeVisible();
    await expect(canvas.getByText("Masonry & Plaster")).toBeVisible();
    await expect(canvas.getByText("Brickwork")).toBeVisible();
    await expect(canvas.getByText("42.5 sqm")).toBeVisible();
    await expect(canvas.getByText("12 Bag")).toBeVisible();
    for (const name of ["Approve", "Reject", "Edit", "Duplicate", "Delete"])
      await expect(canvas.getByRole("button", { name })).toBeVisible();
    await expect(
      await canvas.findByRole("heading", { name: "Work Photos" }),
    ).toBeVisible();
  },
};

/** Approve: the badge turns Approved at once and the approve actions go. */
export const Approve: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }),
    );
    await expect(await canvas.findByText("Approved")).toBeVisible();
    await expect(canvas.queryByText("Pending")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.getByText("Approved by")).toBeVisible();
  },
};

/** Reject asks for a reason. */
export const Reject: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await dialog.findByText("Write a reason.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Wrong floor");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(
        posts(`${WORKSHEETS_API}/${PENDING.id}/reject`)[0]?.body,
      ).toEqual({
        reason: "Wrong floor",
        expectedUpdatedAt: PENDING.updatedAt,
      });
    });
  },
};

/** Delete asks first. */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await expect(
      dialog.getByText(/goes back into the Project's stock/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(
        posts(`${WORKSHEETS_API}/${PENDING.id}/delete`),
      ).toHaveLength(1);
    });
  },
};

/** A rejected sheet shows who rejected it and why; photos that failed are named. */
export const Rejected: Story = {
  args: { id: REJECTED.id, uploadFailed: ["slab-east.jpg"] },
  beforeEach: withApi({ items: [REJECTED] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Rejected")).toBeVisible();
    await expect(
      canvas.getByText("Counts do not match attendance"),
    ).toBeVisible();
    await expect(canvas.getByText("Rejected by")).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "slab-east.jpg did not upload",
    );
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};
