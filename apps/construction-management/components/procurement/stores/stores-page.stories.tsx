import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { access, IDS, mockCentralStoreApi } from "./central-store-fixtures";
import { StoresPage } from "./stores-page";

const meta = {
  title: "Procurement/Central Store/Stores",
  component: StoresPage,
  beforeEach: () => mockCentralStoreApi().restore,
  parameters: {
    nextjs: { navigation: { pathname: "/app/workspace/central-store" } },
  },
  render: () => (
    <StoryQueries>
      <StoresPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof StoresPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each store with its state, Projects and store keepers; Add store and Central Inventory. */
export const Stores: Story = {
  play: async ({ canvas, canvasElement }) => {
    const link = await canvas.findByRole("link", { name: /Ambattur Central Store/ });
    await expect(link).toHaveAttribute(
      "href",
      `/app/workspace/central-store/${IDS.store}`,
    );
    await expect(
      canvas.getByText("Tamil Nadu · 2 Projects · 1 store keeper"),
    ).toBeVisible();
    await expect(await canvas.findByRole("link", { name: "Add store" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Central Inventory" })).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** No stores yet, for a member who cannot add one. */
export const Empty: Story = {
  beforeEach: () =>
    mockCentralStoreApi({
      stores: [],
      access: access({ "procurement.central_store": ["read"] }),
    }).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No stores yet")).toBeVisible();
    await expect(
      canvas.getByText("The Company's Central Stores show here."),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Add store" })).toBeNull();
  },
};
