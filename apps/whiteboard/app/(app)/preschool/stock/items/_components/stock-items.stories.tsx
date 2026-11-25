import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import { StockItemLedgerScreen } from "@/app/(app)/preschool/stock/items/[id]/_components/stock-item-ledger-screen";
import type {
  PreschoolStockItem,
  PreschoolStockLedger,
} from "@/src/queries/preschool/stock";

import { StockItemsScreen } from "./stock-items-screen";

const KIT = "aa0e8400-e29b-41d4-a716-446655440001";

function item(overrides: Partial<PreschoolStockItem>): PreschoolStockItem {
  return {
    id: KIT,
    name: "Nursery kit",
    category: "kit",
    kind: "consumable",
    unit: "set",
    reorderLevel: 5,
    isArchived: false,
    ...overrides,
  };
}

const ITEMS = [
  item({}),
  item({
    id: "aa0e8400-e29b-41d4-a716-446655440002",
    name: "LKG English reader",
    category: "books",
    unit: "piece",
    reorderLevel: null,
  }),
  item({
    id: "aa0e8400-e29b-41d4-a716-446655440003",
    name: "Small chair",
    category: "furniture_equipment",
    kind: "asset",
    unit: "piece",
    reorderLevel: null,
    isArchived: true,
  }),
];

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Stock/Stock Items",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/stock/items" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: { "GET /stock/items": () => ({ json: { items: [] } }) },
    });
  },
  render: () => <StockItemsScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Stock Items yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Stock Item" }),
    ).toBeVisible();
  },
};

export const Master: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: {
        "GET /stock/items": () => ({ json: { items: ITEMS } }),
        "POST /stock/items": (body) =>
          (body as { name: string }).name === "Nursery kit"
            ? {
                status: 409,
                json: {
                  code: "STOCK_ITEM_NAME_IN_USE",
                  message: "There is already a Stock Item called Nursery kit.",
                },
              }
            : { status: 201, json: item({ name: "Crayon box" }) },
        [`POST /stock/items/${KIT}/archive`]: () => ({
          json: item({ isArchived: true }),
        }),
      },
    });
  },
  render: () => <StockItemsScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Books" }),
    ).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Kits" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Restore Small chair" }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Add Stock Item" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "Nursery kit");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save Stock Item" }),
    );
    await expect(
      await dialog.findByText(
        "There is already a Stock Item called Nursery kit.",
      ),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Name"));
    await userEvent.type(dialog.getByLabelText("Name"), "Crayon box");
    await userEvent.click(dialog.getByLabelText("Category"));
    await userEvent.click(
      await body.findByRole("option", { name: "Stationery" }),
    );
    await expect(
      dialog.getByText(
        "Used up or given away: books, notebooks, uniforms, kits.",
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "box" }));
    await userEvent.type(dialog.getByLabelText("Reorder level"), "10");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save Stock Item" }),
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.route === "POST /stock/items").at(-1)?.body,
      ).toEqual({
        name: "Crayon box",
        category: "stationery",
        kind: "consumable",
        unit: "box",
        reorderLevel: 10,
      }),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Archive Nursery kit" }),
    );
    await waitFor(() =>
      expect(calls.map((call) => call.route)).toContain(
        `POST /stock/items/${KIT}/archive`,
      ),
    );
  },
};

const LEDGER: PreschoolStockLedger = {
  items: [
    {
      id: "ab0e8400-e29b-41d4-a716-446655440003",
      centreId: CENTRE_IDS.annaNagar,
      movedOn: "2026-11-22",
      kind: "transfer_out",
      itemId: KIT,
      itemName: "Nursery kit",
      unit: "set",
      quantityDelta: -4,
      child: null,
      classroom: null,
      staff: null,
      otherCentre: { id: CENTRE_IDS.tambaram, name: "Little Steps Tambaram" },
      supplierName: null,
      billNumber: null,
      unitCostPaise: null,
      transferId: "ac0e8400-e29b-41d4-a716-446655440001",
      note: null,
      recordedByName: "Arun",
      balanceAfter: 16,
    },
    {
      id: "ab0e8400-e29b-41d4-a716-446655440002",
      centreId: CENTRE_IDS.annaNagar,
      movedOn: "2026-11-02",
      kind: "received",
      itemId: KIT,
      itemName: "Nursery kit",
      unit: "set",
      quantityDelta: 20,
      child: null,
      classroom: null,
      staff: null,
      otherCentre: null,
      supplierName: "Sri Books",
      billNumber: "SB-101",
      unitCostPaise: 85_000,
      transferId: null,
      note: null,
      recordedByName: "Arun",
      balanceAfter: 20,
    },
  ],
  nextCursor: null,
  total: 2,
};

export const ItemLedger: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/stock/items/${KIT}` } },
  },
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        "GET /stock/items": () => ({ json: { items: ITEMS } }),
        "GET /stock": () => ({
          json: {
            centreId: CENTRE_IDS.annaNagar,
            itemsInStock: 1,
            lowItems: 0,
            items: [
              {
                itemId: KIT,
                name: "Nursery kit",
                category: "kit",
                kind: "consumable",
                unit: "set",
                reorderLevel: 5,
                onHand: 16,
                low: false,
                lastMovedOn: "2026-11-22",
              },
            ],
          },
        }),
        "GET /stock/movements": () => ({ json: LEDGER }),
      },
    });
  },
  render: () => <StockItemLedgerScreen itemId={KIT} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Nursery kit" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/16 set on hand at Little Steps Anna Nagar/),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("columnheader", { name: "Balance" }),
    ).toBeVisible();
    await expect(canvas.getByText("To Little Steps Tambaram")).toBeVisible();
    await expect(canvas.getByText("−4 set")).toBeVisible();
    await expect(canvas.queryByLabelText("Item")).toBeNull();
  },
};
