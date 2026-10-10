import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  API,
  IDS,
  mockCentralStoreApi,
} from "@/components/procurement/stores/central-store-fixtures";

import { DeliveryNoteForm } from "./delivery-note-form";

let api: ReturnType<typeof mockCentralStoreApi>;

function posts(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === `${API}/delivery-notes`);
}

const meta = {
  title: "Procurement/Central Store/Delivery Note form",
  component: DeliveryNoteForm,
  args: { materialRequestId: IDS.request },
  beforeEach: () => {
    api = mockCentralStoreApi();
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <DeliveryNoteForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DeliveryNoteForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Each line shows Requested, Pending and the store's stock; Delivered
 * now defaults to pending and cannot exceed it; Save & Approve sends it.
 */
export const SaveAndApprove: Story = {
  play: async ({ canvas, userEvent }) => {
    const cement = await canvas.findByLabelText("Delivered now: Cement OPC 53 Grade");
    await expect(cement).toHaveValue("40");
    await expect(await canvas.findByText("In store: 40 Bag")).toBeVisible();
    await userEvent.clear(cement);
    await userEvent.type(cement, "45");
    await userEvent.click(canvas.getByRole("button", { name: "Save & Approve" }));
    await expect(await canvas.findByText("At most 40 is pending.")).toBeVisible();
    await expect(posts()).toHaveLength(0);

    await userEvent.clear(cement);
    await userEvent.type(cement, "30");
    await userEvent.clear(canvas.getByLabelText("Delivered now: TMT Steel Bar 12 mm"));
    await userEvent.click(canvas.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/workspace/central-store/delivery-notes/${IDS.note}`,
      ),
    );
    await expect(posts()[0]?.body).toMatchObject({
      materialRequestId: IDS.request,
      deliveredTo: "Prabhu S",
      approve: true,
      items: [{ materialRequestItemId: IDS.cementLine, quantity: "30" }],
    });
  },
};

/** Nothing to deliver is caught before saving. */
export const NothingEntered: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(await canvas.findByLabelText("Delivered now: Cement OPC 53 Grade"));
    await userEvent.clear(canvas.getByLabelText("Delivered now: TMT Steel Bar 12 mm"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter a delivered quantity for at least one material."),
    ).toBeVisible();
    await expect(posts()).toHaveLength(0);
  },
};
