import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  STORY_PROJECT_ID,
  STORY_VOUCHERS,
  pettyCashHandler,
  type PettyCashApiOptions,
} from "./petty-cash-fixtures";
import { VoucherDetail } from "./voucher-detail";

let api: ReturnType<typeof mockApi>;

function serve(options: PettyCashApiOptions = {}) {
  return () => {
    api = mockApi(pettyCashHandler(options));
    return api.restore;
  };
}

function posted(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(path));
}

const [PENDING, APPROVED, , REJECTED] = STORY_VOUCHERS;

const meta = {
  title: "Finance/Petty Cash/Voucher detail",
  component: VoucherDetail,
  args: { projectId: STORY_PROJECT_ID, voucherId: PENDING?.id ?? "" },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl">
        <VoucherDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof VoucherDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pending Payment: approve it; its files and remarks below. */
export const PendingApprove: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "PC/26-27/00012" }),
    ).toBeVisible();
    await expect(canvas.getByText("-₹700.00")).toBeVisible();
    await expect(canvas.getByText("Sri Murugan Fuels")).toBeVisible();
    await expect(
      canvas.getByText(
        "Waiting for approval. It moves the balance once approved.",
      ),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("heading", { name: "Photos & receipts" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await waitFor(async () => {
      await expect(posted("/approve")).toHaveLength(1);
    });
    await expect(await canvas.findByText("Approved")).toBeVisible();
  },
};

/** Reject asks for a reason. */
export const Reject: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Reject PC/26-27/00012?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await dialog.findByText("Write a reason.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Bill is unreadable");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(posted("/reject")[0]?.body).toEqual({
        reason: "Bill is unreadable",
      });
    });
  },
};

/** A rejected voucher shows why; it can be edited, not approved. */
export const Rejected: Story = {
  args: { voucherId: REJECTED?.id ?? "" },
  beforeEach: serve(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Rejected by Arun Selva Kumar:/),
    ).toHaveTextContent("No bill attached");
    await expect(canvas.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};

/** Deleting an approved voucher warns that it reverses the balance. */
export const DeleteApproved: Story = {
  args: { voucherId: APPROVED?.id ?? "" },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete PC/26-27/00011" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", { name: "Delete PC/26-27/00011?" }),
    );
    await expect(
      dialog.getByText(
        "It is approved: deleting it reverses its entries, so the balance goes back.",
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(posted("/delete")).toHaveLength(1);
    });
  },
};

/** Read only: no actions, and no files to add. */
export const ReadOnly: Story = {
  beforeEach: serve({
    flags: ["read"],
    vouchers: STORY_VOUCHERS.map((voucher) => ({
      ...voucher,
      actions: { edit: false, delete: false, approve: false, reject: false },
    })),
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "PC/26-27/00012" });
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add files" }),
    ).toBeNull();
  },
};

/** Mobile: nothing scrolls sideways. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "PC/26-27/00012" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
