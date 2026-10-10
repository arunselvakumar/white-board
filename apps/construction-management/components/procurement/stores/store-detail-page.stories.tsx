import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { IDS, mockCentralStoreApi } from "./central-store-fixtures";
import { StoreDetailPage } from "./store-detail-page";

const meta = {
  title: "Procurement/Central Store/Store",
  component: StoreDetailPage,
  args: { storeId: IDS.store },
  beforeEach: () => mockCentralStoreApi().restore,
  render: (args) => (
    <StoryQueries>
      <StoreDetailPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof StoreDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stock per material with its state, then the Projects, requests and notes tabs. */
export const Stock: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Ambattur Central Store" }),
    ).toBeVisible();
    const stock = await canvas.findByRole("table", { name: "Store stock" });
    await expect(stock).toHaveTextContent("Cement OPC 53 Grade");
    await expect(stock).toHaveTextContent("40 Bag");
    await expect(stock).toHaveTextContent("1,250.5 kg");
    await expect(stock).toHaveTextContent("Low stock");

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
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** A store with no stock says so. */
export const NoStock: Story = {
  beforeEach: () => mockCentralStoreApi({ stock: [] }).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No stock yet")).toBeVisible();
  },
};
