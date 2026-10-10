import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { GOODS_RECEIPTS_API } from "@/src/queries/goods-receipts";

import {
  accessWith,
  FORM_OPTIONS,
  goodsReceiptHandler,
  GRN_ID,
  NO_FINANCIAL,
  PROJECT_ID,
  RECEIPT,
  TODAY,
} from "./goods-receipt-fixtures";
import {
  EditGoodsReceiptScreen,
  NewGoodsReceiptScreen,
} from "./goods-receipt-form";

let api: ReturnType<typeof mockApi>;

function sent(path: string): Record<string, unknown> | undefined {
  const call = api.calls.mock.calls
    .map(([item]) => item)
    .find((item: ApiCall) => item.method === "POST" && item.path === path);
  return call?.body as Record<string, unknown> | undefined;
}

const meta = {
  title: "Procurement/Goods Receipts/Form",
  component: NewGoodsReceiptScreen,
  args: { projectId: PROJECT_ID, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <NewGoodsReceiptScreen {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof NewGoodsReceiptScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Picking the PO sets its supplier and loads ordered, received and pending. */
export const AgainstPurchaseOrder: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Record Goods Receipt" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Purchase Order"));
    await userEvent.click(
      await body.findByRole("option", { name: /PO\/26-27\/00012/ }),
    );
    // Pending defaults: 40 bags of cement, all 500 kg of steel.
    const cement = await canvas.findByLabelText(
      "Received now, Cement OPC 53 Grade",
    );
    await expect(cement).toHaveValue("40");
    const steel = canvas.getByLabelText("Received now, TMT Steel Bar 12 mm");
    await userEvent.clear(steel);
    await userEvent.type(steel, "50");
    await userEvent.clear(cement);
    await userEvent.type(cement, "50");
    await expect(await canvas.findByText("Excess received 10")).toBeVisible();
    // 50 × ₹400 + 28% and 50 × ₹54 + 18%: ₹28,786.
    await expect(canvas.getByText("₹28,786.00")).toBeVisible();
    await expect(canvas.getByText("Sri Murugan Traders")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Invoice No"), "SMT/2026/118");
    await userEvent.type(canvas.getByLabelText("Vehicle No"), "TN 09 AB 1234");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Goods Receipt" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${PROJECT_ID}/materials/goods-received/${GRN_ID}`,
      ),
    );
    await expect(sent(GOODS_RECEIPTS_API)).toMatchObject({
      locationKind: "project",
      locationId: PROJECT_ID,
      receiptDate: TODAY,
      inventoryDate: TODAY,
      supplierId: "0199c4a0-0000-7000-8000-00000000d001",
      purchaseOrderId: "0199c4a0-0000-7000-8000-00000000e001",
      supplyType: "intra_state",
      invoiceNo: "SMT/2026/118",
      vehicleNo: "TN 09 AB 1234",
      lines: [
        {
          purchaseOrderItemId: "0199c4a0-0000-7000-8000-00000000e101",
          quantity: "50",
          unitRate: 40_000,
          gstRate: "28",
        },
        {
          purchaseOrderItemId: "0199c4a0-0000-7000-8000-00000000e102",
          quantity: "50",
          unitRate: 5_400,
          gstRate: "18",
        },
      ],
    });
  },
};

/** Without a PO: a Karnataka supplier makes it IGST; materials picked by hand. */
export const WithoutPurchaseOrder: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByLabelText("Supplier"));
    await userEvent.click(
      await body.findByRole("option", { name: "Bengaluru Steels" }),
    );
    await expect(await canvas.findByText("Inter-state (IGST)")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add material" }));
    await userEvent.selectOptions(
      await canvas.findByLabelText("Material, line 1"),
      "TMT Steel Bar 12 mm (kg)",
    );
    await expect(canvas.getByLabelText("Rate")).toHaveValue("62.5");
    await expect(canvas.getByLabelText("HSN")).toHaveValue("7214");
    await userEvent.type(canvas.getByLabelText("Quantity (kg)"), "200");
    // 200 × ₹62.50 + 18% IGST.
    await expect(
      (await canvas.findAllByText("₹14,750.00")).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText("IGST")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Goods Receipt" }),
    );
    await waitFor(() =>
      expect(sent(GOODS_RECEIPTS_API)).toMatchObject({
        purchaseOrderId: null,
        supplyType: "inter_state",
        lines: [
          {
            materialId: "0199c4a0-0000-7000-8000-00000000a002",
            quantity: "200",
            unitRate: 6_250,
            gstRate: "18",
            hsnCode: "7214",
          },
        ],
      }),
    );
  },
};

/** The Company hides fields; without Financial no rates or totals. */
export const HiddenFieldsWithoutFinancial: Story = {
  beforeEach: () => {
    api = mockApi(
      goodsReceiptHandler({
        access: accessWith(NO_FINANCIAL),
        formOptions: {
          ...FORM_OPTIONS,
          financial: false,
          hiddenFields: ["vehicleNo", "driverMobile", "ewayBillNo", "remark"],
          purchaseOrders: FORM_OPTIONS.purchaseOrders.map((order) => ({
            ...order,
            lines: order.lines.map((line) => ({ ...line, unitRate: null })),
          })),
        },
      }),
    );
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByLabelText("Invoice No")).toBeVisible();
    await expect(canvas.getByLabelText("Delivery Challan No")).toBeVisible();
    await expect(canvas.queryByLabelText("Invoice Amount")).toBeNull();
    await expect(canvas.queryByLabelText("Vehicle No")).toBeNull();
    await expect(canvas.queryByLabelText("Driver mobile")).toBeNull();
    await expect(canvas.queryByLabelText("Remark")).toBeNull();
    await userEvent.click(canvas.getByLabelText("Purchase Order"));
    await userEvent.click(
      await body.findByRole("option", { name: /PO\/26-27\/00012/ }),
    );
    await expect(
      await canvas.findByLabelText("Received now, Cement OPC 53 Grade"),
    ).toBeVisible();
    await expect(canvas.queryByText("Rate")).toBeNull();
    await expect(canvas.queryByText("GRN value")).toBeNull();
  },
};

/** Required fields and date order are checked before sending. */
export const Validation: Story = {
  beforeEach: () => {
    api = mockApi(goodsReceiptHandler({}));
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const inventory = await canvas.findByLabelText("Inventory Date");
    await userEvent.clear(inventory);
    await userEvent.type(inventory, "2026-10-01");
    await userEvent.type(canvas.getByLabelText("E-way bill No"), "12AB");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Goods Receipt" }),
    );
    await expect(await canvas.findByText("Choose a Supplier.")).toBeVisible();
    await expect(
      canvas.getByText("The Inventory Date cannot be before the GR Date."),
    ).toBeVisible();
    await expect(
      canvas.getByText("An e-way bill number has 12 digits."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add at least one material received."),
    ).toBeVisible();
    await expect(sent(GOODS_RECEIPTS_API)).toBeUndefined();
  },
};

/** An edit that would leave stock below zero is explained, not just refused. */
export const EditRefusedForStock: Story = {
  render: () => (
    <StoryQueries>
      <div className="w-full p-6">
        <EditGoodsReceiptScreen
          projectId={PROJECT_ID}
          id={GRN_ID}
          today={TODAY}
        />
      </div>
    </StoryQueries>
  ),
  beforeEach: () => {
    api = mockApi(
      goodsReceiptHandler({
        formOptions: {
          ...FORM_OPTIONS,
          purchaseOrders: FORM_OPTIONS.purchaseOrders.map((order) => ({
            ...order,
            lines: order.lines.map((line, index) => ({
              ...line,
              receivedQty: index === 0 ? "50.000" : "0.000",
            })),
          })),
        },
        update: () =>
          Response.json(
            {
              code: "STOCK_INSUFFICIENT",
              message:
                "Not enough Cement OPC 53 Grade in stock: 30 short on 2026-10-09.",
              details: {
                shortfalls: [
                  {
                    locationKind: "project",
                    locationId: PROJECT_ID,
                    materialId: "0199c4a0-0000-7000-8000-00000000a001",
                    materialName: "Cement OPC 53 Grade",
                    shortBy: "30.000",
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
    await expect(
      await canvas.findByRole("heading", { name: `Edit ${RECEIPT.number}` }),
    ).toBeVisible();
    const cement = await canvas.findByLabelText(
      "Received now, Cement OPC 53 Grade",
    );
    await expect(cement).toHaveValue("60");
    await expect(
      canvas.getByLabelText("Received now, TMT Steel Bar 12 mm"),
    ).toHaveValue("50");
    await userEvent.clear(cement);
    await userEvent.type(cement, "20");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("Not enough stock to save this change"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Cement OPC 53 Grade: 30 short on 9 Oct 2026/),
    ).toBeVisible();
    await expect(sent(`${GOODS_RECEIPTS_API}/${GRN_ID}/update`)).toMatchObject({
      expectedUpdatedAt: RECEIPT.updatedAt,
      lines: [
        {
          id: "0199c4a0-0000-7000-8000-00000000f101",
          purchaseOrderItemId: "0199c4a0-0000-7000-8000-00000000e101",
          quantity: "20",
        },
        {
          id: "0199c4a0-0000-7000-8000-00000000f102",
          purchaseOrderItemId: "0199c4a0-0000-7000-8000-00000000e102",
          quantity: "50",
        },
      ],
    });
  },
};
