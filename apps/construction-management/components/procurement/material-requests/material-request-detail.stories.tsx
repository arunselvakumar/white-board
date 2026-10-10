import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  access,
  IDS,
  mockCentralStoreApi,
} from "@/components/procurement/stores/central-store-fixtures";

import { MaterialRequestDetail } from "./material-request-detail";

const meta = {
  title: "Procurement/Central Store/Material Request",
  component: MaterialRequestDetail,
  args: { requestId: IDS.request, side: "store" },
  beforeEach: () => mockCentralStoreApi().restore,
  render: (args) => (
    <StoryQueries>
      <MaterialRequestDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MaterialRequestDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The store side: lines with Ask Qty, delivered, on the way and pending;
 * Create Delivery Note; Close with a reason ends what is left.
 */
export const StoreSideClose: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "MR/26-27/00007" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Partially delivered", {
        selector: "[data-slot=badge]",
      }),
    ).toBeVisible();
    const lines = canvas.getByRole("table", { name: "Requested materials" });
    await expect(lines).toHaveTextContent("100 Bag");
    await expect(lines).toHaveTextContent("Columns C1–C8");
    await expect(
      await canvas.findByRole("link", { name: "Create Delivery Note" }),
    ).toHaveAttribute(
      "href",
      `/app/workspace/central-store/material-requests/${IDS.request}/delivery-notes/new`,
    );
    // Edit and Delete belong to the Project side.
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(await canvas.findByText("DN/26-27/00003")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Close request" }),
    );
    await expect(
      await dialog.findByText("Write why the store will not send the rest."),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Cement out of stock this month",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Close request" }),
    );
    await expect(
      await canvas.findByText("Cement out of stock this month"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Closed", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
  },
};

/** The Project side with read only: no actions but the facts and lines. */
export const ProjectSideReadOnly: Story = {
  args: { side: "project" },
  beforeEach: () =>
    mockCentralStoreApi({
      access: access({ "procurement.material_requests": ["read"] }),
    }).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Velan Constructions")).toBeVisible();
    await expect(
      canvas.getByText("Needed for the 3rd floor slab."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Close" })).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Create Delivery Note" }),
    ).toBeNull();
    await expect(canvas.queryByRole("link", { name: "PDF" })).toBeNull();
  },
};
