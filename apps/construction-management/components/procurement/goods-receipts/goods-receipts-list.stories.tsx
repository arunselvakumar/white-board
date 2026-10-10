import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { GOODS_RECEIPTS_API } from "@/src/queries/goods-receipts";

import {
  accessWith,
  goodsReceiptHandler,
  listPage,
  PROJECT_ID,
} from "./goods-receipt-fixtures";
import { GoodsReceiptsList } from "./goods-receipts-list";

let api: ReturnType<typeof mockApi>;

function listCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" && call.path.startsWith(`${GOODS_RECEIPTS_API}?`),
    );
}

const meta = {
  title: "Procurement/Goods Receipts/List",
  component: GoodsReceiptsList,
  args: { projectId: PROJECT_ID },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <GoodsReceiptsList {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof GoodsReceiptsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** GRNs with values; filters go to the server. */
export const WithReceipts: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: "GRN/26-27/00007" }),
    ).toBeVisible();
    await expect(canvas.getByText("2 Goods Receipts")).toBeVisible();
    await expect(canvas.getByText("₹33,906.00")).toBeVisible();
    await expect(canvas.getAllByText("Without PO").length).toBeGreaterThan(1);
    await expect(
      canvas.getByRole("link", { name: "Record Goods Receipt" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/materials/goods-received/new`,
    );

    await userEvent.click(canvas.getByRole("button", { name: "Without PO" }));
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("purchaseOrder=without"),
    );
    await userEvent.type(canvas.getByLabelText("Search"), "DC-4471");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("search=DC-4471"),
    );

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByLabelText("Supplier"));
    await userEvent.click(
      await body.findByRole("option", { name: "Bengaluru Steels" }),
    );
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain(
        "supplierId=0199c4a0-0000-7000-8000-00000000d002",
      ),
    );
  },
};

/** Without Financial: no Value column; without Create: no button. */
export const WithoutFinancial: Story = {
  beforeEach: () => {
    api = mockApi(
      goodsReceiptHandler({
        access: accessWith(["read"]),
        page: () => listPage(undefined, false),
      }),
    );
    return api.restore;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: "GRN/26-27/00007" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("columnheader", { name: "Value" }),
    ).toBeNull();
    await expect(canvas.queryByText("₹33,906.00")).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Record Goods Receipt" }),
    ).toBeNull();
  },
};

/** Nothing received yet. */
export const Empty: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({ page: () => listPage([]) }));
    return api.restore;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No goods received yet"),
    ).toBeVisible();
  },
};
