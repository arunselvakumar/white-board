import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { inventoryHandler } from "../inventory/inventory-fixtures";
import { transferHandler } from "../transfers/transfer-fixtures";
import {
  centralStoreHandler,
  IDS,
  type CentralStoreApiOptions,
} from "./central-store-fixtures";
import { StoreDetailPage } from "./store-detail-page";

/** The store's own reads, then Current Inventory and transfers for its tabs. */
function serve(
  options: CentralStoreApiOptions = {},
  inventory: Parameters<typeof inventoryHandler>[0] = {},
) {
  return () => {
    const store = centralStoreHandler(options);
    const stock = inventoryHandler(inventory);
    const transfers = transferHandler();
    return mockApi((call) => store(call) ?? stock(call) ?? transfers(call))
      .restore;
  };
}

const meta = {
  title: "Procurement/Central Store/Store",
  component: StoreDetailPage,
  args: { storeId: IDS.store },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <StoreDetailPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof StoreDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Current Inventory for the store (CM-506), then the Projects, requests,
 * notes and transfers tabs.
 */
export const Stock: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Ambattur Central Store" }),
    ).toBeVisible();
    // The phone card list or the desktop table, whichever shows.
    const shown = (text: string) =>
      canvas.queryAllByText(text).some((element) => element.checkVisibility());
    await waitFor(() => expect(shown("Cement OPC 53 Grade")).toBe(true));
    await expect(shown("Low stock")).toBe(true);

    await userEvent.click(canvas.getByRole("tab", { name: "Projects" }));
    await expect(await canvas.findByText("Velachery Villas")).toBeVisible();
    await expect(canvas.getByText("Murugan K")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("tab", { name: "Material Requests" }),
    );
    await expect(
      await canvas.findByRole("link", { name: /MR\/26-27\/00007/ }),
    ).toHaveAttribute(
      "href",
      `/app/workspace/central-store/material-requests/${IDS.request}`,
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Delivery Notes" }));
    await expect(await canvas.findByText("DN/26-27/00003")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Transfers" }));
    await expect(await canvas.findByText("MT/26-27/00003")).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** A store with no stock says so. */
export const NoStock: Story = {
  beforeEach: serve({ stock: [] }, { rows: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No stock here yet")).toBeVisible();
  },
};
