import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
  type PreschoolApiHandler,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type {
  PreschoolStockLedger,
  PreschoolStockOnHand,
} from "@/src/queries/preschool/stock";

import { ChildStockIssued } from "./child-stock-issued";
import { StockScreen } from "./stock-screen";

const KIT = "aa0e8400-e29b-41d4-a716-446655440001";
const NOTEBOOK = "aa0e8400-e29b-41d4-a716-446655440002";
const UNIFORM = "aa0e8400-e29b-41d4-a716-446655440003";
const AARAV = "7a0e8400-e29b-41d4-a716-446655440001";

const STOCK: PreschoolStockOnHand = {
  centreId: CENTRE_IDS.annaNagar,
  itemsInStock: 2,
  lowItems: 1,
  items: [
    {
      itemId: KIT,
      name: "Nursery kit",
      category: "kit",
      kind: "consumable",
      unit: "set",
      reorderLevel: 5,
      onHand: 3,
      low: true,
      lastMovedOn: "2026-11-20",
    },
    {
      itemId: NOTEBOOK,
      name: "Four-line notebook",
      category: "notebooks",
      kind: "consumable",
      unit: "piece",
      reorderLevel: 20,
      onHand: 84,
      low: false,
      lastMovedOn: "2026-11-24",
    },
    {
      itemId: UNIFORM,
      name: "Summer uniform",
      category: "uniform",
      kind: "consumable",
      unit: "set",
      reorderLevel: null,
      onHand: 0,
      low: false,
      lastMovedOn: null,
    },
  ],
};

const LEDGER: PreschoolStockLedger = {
  items: [
    {
      id: "ab0e8400-e29b-41d4-a716-446655440001",
      centreId: CENTRE_IDS.annaNagar,
      movedOn: "2026-11-20",
      kind: "issued_to_child",
      itemId: KIT,
      itemName: "Nursery kit",
      unit: "set",
      quantityDelta: -1,
      child: { id: AARAV, name: "Aarav Kumar" },
      classroom: null,
      staff: null,
      otherCentre: null,
      supplierName: null,
      billNumber: null,
      unitCostPaise: null,
      transferId: null,
      note: null,
      recordedByName: "Arun",
      balanceAfter: null,
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
      balanceAfter: null,
    },
  ],
  nextCursor: null,
  total: 2,
};

function routes(
  stock: PreschoolStockOnHand,
  extra: Record<string, PreschoolApiHandler> = {},
): Record<string, PreschoolApiHandler> {
  return {
    "GET /stock": () => ({ json: stock }),
    "GET /stock/movements": () => ({ json: LEDGER }),
    ...extra,
  };
}

const EMPTY: PreschoolStockOnHand = {
  centreId: CENTRE_IDS.annaNagar,
  itemsInStock: 0,
  lowItems: 0,
  items: [],
};

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Stock",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/stock" } },
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

export const NoItemsOwner: Story = {
  beforeEach() {
    return mockPreschoolApi({ routes: routes(EMPTY) });
  },
  render: () => <StockScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Stock Items yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Stock Items" }),
    ).toHaveAttribute("href", "/preschool/stock/items");
    await expect(
      canvas.queryByRole("button", { name: "Receive stock" }),
    ).toBeNull();
  },
};

export const NoItemsCentreHead: Story = {
  beforeEach() {
    return mockPreschoolApi({
      me: preschoolMe({ role: "centre_head" }),
      routes: routes(EMPTY),
    });
  },
  render: () => <StockScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Head Office has not added Stock Items yet."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Open Stock Items" }),
    ).toBeNull();
  },
};

export const OnHand: Story = {
  beforeEach() {
    return mockPreschoolApi({ routes: routes(STOCK) });
  },
  render: () => <StockScreen />,
  play: async ({ canvas, userEvent }) => {
    const kit = within(
      (await canvas.findByRole("link", { name: "Nursery kit" })).closest(
        "tr",
      ) as HTMLElement,
    );
    await expect(kit.getByText("Low")).toBeVisible();
    await expect(kit.getByText("3 set")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Nursery kit" }),
    ).toHaveAttribute("href", `/preschool/stock/items/${KIT}`);
    await expect(
      canvas.getByRole("button", { name: "Transfer to another Centre" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Low stock only" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Movements" }));
    await expect(await canvas.findByText("Aarav Kumar")).toBeVisible();
    await expect(canvas.getByText("Sri Books · Bill SB-101")).toBeVisible();
    await expect(canvas.getByText("+20 set")).toBeVisible();
  },
};

export const ReceiveStock: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: routes(STOCK, {
        "POST /stock/receive": () => ({
          status: 201,
          json: { movementIds: [], balances: [] },
        }),
      }),
    });
  },
  render: () => <StockScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Receive stock" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Supplier"), "Sri Books");
    await userEvent.type(dialog.getByLabelText("Bill number"), "SB-202");
    await userEvent.click(dialog.getByLabelText("Item 1"));
    await userEvent.click(
      await body.findByRole("option", { name: /Nursery kit/ }),
    );
    await expect(dialog.getByText("3 set on hand")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Quantity 1"), "20");
    await userEvent.type(dialog.getByLabelText("Unit cost 1 (₹)"), "850");
    await userEvent.click(dialog.getByRole("button", { name: "Add item" }));
    await userEvent.click(dialog.getByLabelText("Item 2"));
    await userEvent.click(
      await body.findByRole("option", { name: /Four-line notebook/ }),
    );
    await userEvent.type(dialog.getByLabelText("Quantity 2"), "100");
    await userEvent.click(
      dialog.getByRole("button", { name: "Receive stock" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /stock/receive")?.body,
      ).toMatchObject({
        centreId: CENTRE_IDS.annaNagar,
        supplierName: "Sri Books",
        billNumber: "SB-202",
        note: null,
        lines: [
          { itemId: KIT, quantity: 20, unitCostPaise: 85_000 },
          { itemId: NOTEBOOK, quantity: 100, unitCostPaise: null },
        ],
      }),
    );
  },
};

export const IssueToChildNotEnough: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: routes(STOCK, {
        "GET /children": () => ({
          json: {
            items: [
              {
                id: AARAV,
                name: "Aarav Kumar",
                admissionNumber: "LSAN-0007",
                classroomName: "Nursery A",
              },
            ],
            nextCursor: null,
            total: 1,
          },
        }),
        "POST /stock/issue-to-child": () => ({
          status: 409,
          json: {
            code: "STOCK_INSUFFICIENT",
            message: "Only 3 set of Nursery kit in stock at this Centre.",
            details: { onHand: 3 },
          },
        }),
      }),
    });
  },
  render: () => <StockScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Nursery kit" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Issue" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("button", { name: /Aarav Kumar/ }),
    );
    await expect(dialog.getByRole("button", { name: "Change" })).toBeVisible();
    const quantity = dialog.getByLabelText("Quantity 1");
    await userEvent.type(quantity, "5");
    await userEvent.click(dialog.getByRole("button", { name: "Issue stock" }));
    await expect(
      await dialog.findByText(
        "Only 3 set of Nursery kit in stock at this Centre.",
      ),
    ).toBeVisible();
    await expect(quantity).toHaveAttribute("aria-invalid", "true");
    await expect(
      calls.find((call) => call.route === "POST /stock/issue-to-child")?.body,
    ).toMatchObject({
      centreId: CENTRE_IDS.annaNagar,
      childId: AARAV,
      lines: [{ itemId: KIT, quantity: 5 }],
    });
  },
};

export const ChildCard: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        [`GET /stock/children/${AARAV}`]: () => ({
          json: {
            items: [
              {
                movementId: "ab0e8400-e29b-41d4-a716-446655440001",
                itemId: KIT,
                itemName: "Nursery kit",
                unit: "set",
                quantity: 1,
                movedOn: "2026-11-20",
                note: null,
              },
            ],
          },
        }),
      },
    });
  },
  render: () => (
    <div className="max-w-md p-6">
      <ChildStockIssued childId={AARAV} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nursery kit")).toBeVisible();
    await expect(canvas.getByText("1 set · 20 Nov 2026")).toBeVisible();
  },
};
