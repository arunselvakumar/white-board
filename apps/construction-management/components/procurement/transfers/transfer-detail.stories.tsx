import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { TransferDetail } from "./transfer-detail";
import {
  mockTransferApi,
  TOWER,
  TRANSFERS,
  TRANSFERS_API,
  type TransferApiOptions,
} from "./transfer-fixtures";

let api: ReturnType<typeof mockTransferApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function transferApi(options: TransferApiOptions = {}) {
  return () => {
    api = mockTransferApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${TOWER.id}/materials/transfers`;
const [PENDING, IN_TRANSIT, DELIVERED] = TRANSFERS;

const meta = {
  title: "Procurement/Material Transfers/Detail",
  component: TransferDetail,
  args: {
    id: PENDING?.id ?? "",
    backHref: BASE,
    editHref: `${BASE}/${PENDING?.id ?? ""}/edit`,
    afterDeleteHref: BASE,
  },
  beforeEach: transferApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/${PENDING?.id ?? ""}` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <TransferDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TransferDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pending: approve dispatches; reject, edit and delete are offered; comments and files follow. */
export const Pending: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole("heading", { name: /MT\/26-27\/00004/ })).toBeVisible();
    await expect(canvas.getByText("Pending")).toBeVisible();
    await expect(canvas.getByText("Project to Project · 5 Oct 2026")).toBeVisible();
    const materials = within(canvas.getByRole("list", { name: "Materials" }));
    await expect(materials.getAllByRole("listitem")).toHaveLength(2);
    await expect(materials.getByText("500 kg")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `${BASE}/${PENDING?.id ?? ""}/edit`);
    await expect(canvas.queryByRole("button", { name: "Mark as Delivered" })).toBeNull();
    await expect(await canvas.findByRole("heading", { name: "Comments" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await waitFor(async () => {
      await expect(posts(`${TRANSFERS_API}/${PENDING?.id ?? ""}/approve`)[0]?.body).toEqual({
        expectedUpdatedAt: "2026-10-05T09:00:00.000Z",
      });
    });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Approve refused for stock: the material, how much short and from which date. */
export const ApproveRefused: Story = {
  beforeEach: transferApi({ short: true }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Approve" }));
    const alert = within(await canvas.findByRole("alert"));
    await expect(alert.getByText("Not enough stock")).toBeVisible();
    await expect(alert.getByText(/120 short on 5 Oct 2026/)).toBeVisible();
  },
};

/** Reject needs a reason. */
export const Reject: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Reject" }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: /Reject/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await dialog.findByText("Write the reason.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Villa has enough cement");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(posts(`${TRANSFERS_API}/${PENDING?.id ?? ""}/reject`)[0]?.body).toEqual({
        reason: "Villa has enough cement",
      });
    });
  },
};

/** In transit: the destination marks it delivered on a date. */
export const InTransit: Story = {
  args: { id: IN_TRANSIT?.id ?? "" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText("In transit")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Mark as Delivered" }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Mark as Delivered" }));
    const date = dialog.getByLabelText("Delivered on");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-02");
    await userEvent.click(dialog.getByRole("button", { name: "Mark as Delivered" }));
    await expect(await dialog.findByText("The delivery date cannot be before the transfer date.")).toBeVisible();
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-04");
    await userEvent.click(dialog.getByRole("button", { name: "Mark as Delivered" }));
    await waitFor(async () => {
      await expect(posts(`${TRANSFERS_API}/${IN_TRANSIT?.id ?? ""}/deliver`)[0]?.body).toEqual({
        deliveredOn: "2026-10-04",
      });
    });
  },
};

/** Delivered: who received it and when; no actions. */
export const Delivered: Story = {
  args: { id: DELIVERED?.id ?? "" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("2 Oct 2026 · Received by Anitha S")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Mark as Delivered" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};

/** Delete a pending transfer after confirming. */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Delete" }));
    const confirm = within(await within(canvasElement.ownerDocument.body).findByRole("alertdialog"));
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(posts(`${TRANSFERS_API}/${PENDING?.id ?? ""}/delete`)).toHaveLength(1);
    });
  },
};

/** Read only: no actions at all. */
export const ReadOnly: Story = {
  beforeEach: transferApi({ flags: { "procurement.material_transfers": ["read"] } }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: /MT\/26-27\/00004/ });
    for (const name of ["Approve", "Reject", "Delete"])
      await expect(canvas.queryByRole("button", { name })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
  },
};
