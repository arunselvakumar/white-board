import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { goodsReceiptPdfUrl } from "@/src/queries/goods-receipts";

import {
  accessWith,
  goodsReceiptHandler,
  GRN_ID,
  PROJECT_ID,
  RECEIPT,
  RECEIPT_NO_FINANCIAL,
} from "./goods-receipt-fixtures";
import { GoodsReceiptDetail } from "./goods-receipt-detail";

let api: ReturnType<typeof mockApi>;

const meta = {
  title: "Procurement/Goods Receipts/Detail",
  component: GoodsReceiptDetail,
  args: { projectId: PROJECT_ID, id: GRN_ID },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <GoodsReceiptDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof GoodsReceiptDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Lines with ordered, earlier and excess; totals; both detail groups. */
export const AgainstPurchaseOrder: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: RECEIPT.number }),
    ).toBeVisible();
    await expect(canvas.getByText("Excess received 10")).toBeVisible();
    await expect(canvas.getByText("₹33,906.00")).toBeVisible();
    await expect(
      canvas.getByText("The invoice amount is ₹35,000.00, not the GRN value."),
    ).toBeVisible();
    await expect(canvas.getByText("DC-4471")).toBeVisible();
    await expect(canvas.getByText("+917708165767")).toBeVisible();
    await expect(
      await canvas.findByRole("link", { name: "PDF" }),
    ).toHaveAttribute("href", goodsReceiptPdfUrl(GRN_ID));
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/materials/goods-received/${GRN_ID}/edit`,
    );
    await expect(
      await canvas.findByRole("heading", { name: "Remarks" }),
    ).toBeVisible();
  },
};

/** Without Financial no rates or values; hidden fields are left out. */
export const WithoutFinancialAndHiddenFields: Story = {
  beforeEach: () => {
    api = mockApi(
      goodsReceiptHandler({
        access: accessWith(["read"]),
        receipt: {
          ...RECEIPT_NO_FINANCIAL,
          hiddenFields: ["vehicleNo", "driverMobile"],
          vehicleNo: null,
          driverMobile: null,
        },
      }),
    );
    return api.restore;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: RECEIPT.number }),
    ).toBeVisible();
    await expect(canvas.queryByText("GRN value")).toBeNull();
    await expect(
      canvas.queryByRole("columnheader", { name: "Rate" }),
    ).toBeNull();
    await expect(canvas.queryByText("Vehicle No")).toBeNull();
    await expect(canvas.queryByText("Invoice Amount")).toBeNull();
    await expect(canvas.getByText("Invoice No")).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};

/** Delete is refused when the stock has gone out, and says why. */
export const DeleteRefusedForStock: Story = {
  beforeEach: () => {
    api = mockApi(
      goodsReceiptHandler({
        remove: () =>
          Response.json(
            {
              code: "STOCK_INSUFFICIENT",
              message: "Not enough stock.",
              details: {
                shortfalls: [
                  {
                    locationKind: "project",
                    locationId: PROJECT_ID,
                    materialId: "0199c4a0-0000-7000-8000-00000000a001",
                    materialName: "Cement OPC 53 Grade",
                    shortBy: "45.500",
                    onDate: "2026-10-09",
                  },
                ],
              },
            },
            { status: 409 },
          ),
      }),
    );
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(
      await body.findByRole("alertdialog", {
        name: `Delete ${RECEIPT.number}?`,
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await canvas.findByText("Not enough stock to delete this Goods Receipt"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Cement OPC 53 Grade: 45.5 short on 9 Oct 2026/),
    ).toBeVisible();
  },
};

/** Delete goes back to the list. */
export const Delete: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${PROJECT_ID}/materials/goods-received`,
      ),
    );
  },
};
