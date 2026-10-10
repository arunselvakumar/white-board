import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { mockCentralStoreApi } from "@/components/procurement/stores/central-store-fixtures";

import { CentralInventoryPage } from "./central-inventory-page";

const meta = {
  title: "Procurement/Central Inventory",
  component: CentralInventoryPage,
  beforeEach: () => mockCentralStoreApi().restore,
  render: () => (
    <StoryQueries>
      <CentralInventoryPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof CentralInventoryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Totals per material across Projects and the Store, with in transit;
 * a stock-state filter; the Stock Ledger on screen with its Excel link.
 */
export const Inventory: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const cement = await canvas.findByRole("table", {
      name: "Stock of Cement OPC 53 Grade",
    });
    await expect(cement).toHaveTextContent("Velachery Villas");
    await expect(canvas.getByText("245 Bag")).toBeVisible();
    await expect(canvas.getByText(/200 in transit/)).toBeVisible();

    await userEvent.click(canvas.getByLabelText("Stock state"));
    await userEvent.click(
      await body.findByRole("option", { name: "Out of stock" }),
    );
    await expect(
      await canvas.findByRole("table", {
        name: "Stock of TMT Steel Bar 12 mm",
      }),
    ).toHaveTextContent("Anugraha Towers");
    await expect(
      canvas.queryByRole("table", { name: "Stock of Cement OPC 53 Grade" }),
    ).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Show ledger" }));
    const ledger = await canvas.findByRole("table", { name: "Stock Ledger" });
    await expect(ledger).toHaveTextContent("−60");
    await expect(canvas.getByRole("link", { name: "Excel" })).toHaveAttribute(
      "href",
      expect.stringContaining("/central-inventory/stock-ledger/xlsx?"),
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
