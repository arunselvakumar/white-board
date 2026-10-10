import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  access,
  IDS,
  mockCentralStoreApi,
  NOTE,
} from "@/components/procurement/stores/central-store-fixtures";

import { DeliveryNoteDetail } from "./delivery-note-detail";

const meta = {
  title: "Procurement/Central Store/Delivery Note",
  component: DeliveryNoteDetail,
  args: { noteId: IDS.note },
  beforeEach: () => mockCentralStoreApi().restore,
  render: (args) => (
    <StoryQueries>
      <DeliveryNoteDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DeliveryNoteDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pending → Approve (in transit) → Mark as Delivered on a date. */
export const ApproveThenDeliver: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "DN/26-27/00003" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Pending", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("table", { name: "Delivered materials" }),
    ).toHaveTextContent("500 kg");
    await expect(
      await canvas.findByRole("link", { name: "Edit" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    const approve = within(await body.findByRole("alertdialog"));
    await userEvent.click(approve.getByRole("button", { name: "Approve" }));
    await expect(
      await canvas.findByText("In transit", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Mark as Delivered" }),
    );
    const deliver = within(await body.findByRole("dialog"));
    await userEvent.click(
      deliver.getByRole("button", { name: "Mark as Delivered" }),
    );
    await expect(
      await canvas.findByText("Delivered", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
  },
};

/** The site side may only mark delivered (Material Requests update). */
export const SiteSide: Story = {
  beforeEach: () =>
    mockCentralStoreApi({
      note: {
        ...NOTE,
        status: "in_transit",
      },
      access: access({ "procurement.material_requests": ["read", "update"] }),
    }).restore,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Mark as Delivered" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};
