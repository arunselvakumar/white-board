import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { EditPurchaseOrder } from "./edit-purchase-order";
import { PurchaseOrderDetailPage } from "./purchase-order-detail";
import {
  CEMENT,
  ORDERED_PO,
  PENDING_PO,
  PROJECT_ID,
  purchaseOrdersHandler,
  SAND,
  SUPPLIER,
  TODAY,
  type PoApiOptions,
} from "./purchase-order-fixtures";
import { PurchaseOrderForm } from "./purchase-order-form";
import { PurchaseOrdersPage } from "./purchase-orders-page";

let api: ReturnType<typeof mockApi>;

function serve(options: PoApiOptions = {}) {
  return () => {
    api = mockApi(purchaseOrdersHandler(options));
    return api.restore;
  };
}

function calls(method: string, pathPart: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.includes(pathPart));
}

type Body = {
  findByRole: (
    role: "option",
    options: { name: string },
  ) => Promise<HTMLElement>;
};

async function choose(
  body: Body,
  trigger: HTMLElement,
  option: string,
  userEvent: { click: (el: Element) => Promise<void> },
) {
  await userEvent.click(trigger);
  await userEvent.click(await body.findByRole("option", { name: option }));
}

const meta = {
  title: "Procurement/Purchase Orders",
  component: PurchaseOrdersPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <PurchaseOrdersPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PurchaseOrdersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both statuses on each row; amounts always shown. */
export const List: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      (await canvas.findAllByText(PENDING_PO.number)).length,
    ).toBeGreaterThan(0);
    await expect(
      canvas.getAllByText("Partially received").length,
    ).toBeGreaterThan(0);
    await expect(canvas.getAllByText("₹49,280.00").length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Pending" }));
    await waitFor(async () => {
      await expect(calls("GET", "approvalStatus=pending")).toHaveLength(1);
    });
    await expect(await canvas.findByText("1 Purchase Order")).toBeVisible();
  },
};

/** Bulk approval of pending orders. */
export const BulkApprove: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    const box = canvas.getAllByRole("checkbox", {
      name: `Select ${PENDING_PO.number}`,
    })[0];
    if (box == null) throw new Error("no checkbox");
    await userEvent.click(box);
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await waitFor(async () => {
      await expect(calls("POST", "/bulk-approve")[0]?.body).toEqual({
        projectId: PROJECT_ID,
        ids: [PENDING_PO.id],
      });
    });
  },
};

/** No orders: an empty state with Add Purchase Order. */
export const Empty: Story = {
  beforeEach: serve({ items: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No Purchase Orders yet"),
    ).toBeVisible();
  },
};

/** The form: a line from the sheet with live CGST + SGST, then IGST once delivered to Karnataka. */
export const Form: StoryObj<typeof PurchaseOrderForm> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseOrderForm projectId={PROJECT_ID} today={TODAY} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await choose(
      body,
      await canvas.findByLabelText("Supplier"),
      SUPPLIER.name,
      userEvent,
    );
    await expect(canvas.getByLabelText("Supplier POC Name")).toHaveValue(
      "Murugan",
    );
    await userEvent.type(
      canvas.getByLabelText("Expected Delivery Date"),
      "2026-10-15",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Materials" }),
    );
    const sheet = within(await body.findByRole("dialog"));
    const picker = sheet.getByLabelText("Material");
    await waitFor(async () => {
      await expect(
        within(picker).getAllByRole("option").length,
      ).toBeGreaterThan(2);
    });
    await userEvent.selectOptions(picker, CEMENT.id);
    await expect(sheet.getByLabelText("Unit Rate (₹)")).toHaveValue("385");
    await expect(sheet.getByLabelText("GST Rate %")).toHaveValue("28");
    await expect(
      await sheet.findByText(/Available Stock: 40 Bag/),
    ).toBeVisible();
    await userEvent.type(sheet.getByLabelText(/^Quantity/), "100");
    await expect(sheet.getByText("₹49,280.00")).toBeVisible();
    await userEvent.click(sheet.getByRole("button", { name: "Add" }));
    await expect(await canvas.findByTestId("po-grand-total")).toHaveTextContent(
      "₹49,280.00",
    );
    await expect(canvas.getByText("CGST")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("checkbox", {
        name: "Delivery Address is other than Project Address",
      }),
    );
    await userEvent.type(
      await canvas.findByLabelText("Delivery Address"),
      "Whitefield, Bengaluru",
    );
    await choose(
      body,
      canvas.getByLabelText("Delivery State"),
      "Karnataka",
      userEvent,
    );
    await expect(await canvas.findByText("IGST")).toBeVisible();
    await expect(canvas.getByText("Place of supply: Karnataka")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: /^Delivery Material/ }),
    );
    await userEvent.type(canvas.getByLabelText("Additional Charges"), "1500");
    await expect(canvas.getByTestId("po-grand-total")).toHaveTextContent(
      "₹50,780.00",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save & Approve" }),
    );
    await waitFor(async () => {
      await expect(calls("POST", "/purchase-orders")[0]?.body).toMatchObject({
        projectId: PROJECT_ID,
        orderDate: TODAY,
        expectedDeliveryDate: "2026-10-15",
        supplierId: SUPPLIER.id,
        supplyType: null,
        deliveryAddressDiffers: true,
        deliveryAddress: "Whitefield, Bengaluru",
        deliveryStateCode: "29",
        additionalCharges: 150_000,
        termsIds: ["0199c4a0-0000-7000-8000-0000000t0001"],
        approve: true,
        items: [
          {
            materialId: CEMENT.id,
            quantity: "100",
            unitRate: 38_500,
            gstRate: "28",
            hsnCode: "2523",
          },
        ],
      });
    });
    const sent = calls("POST", "/purchase-orders")[0]?.body as Record<
      string,
      unknown
    >;
    await expect(sent["totals"]).toBeUndefined();
  },
};

/** Generate PO: the PR's pending items load, Expected Delivery from its Required Date. */
export const GenerateFromRequest: StoryObj<typeof PurchaseOrderForm> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseOrderForm
          projectId={PROJECT_ID}
          today={TODAY}
          initialPurchaseRequestId="0199c4a0-0000-7000-8000-0000000r0002"
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(SAND.name)).toBeVisible();
    await expect(canvas.getByText(/^4 cum × ₹1450/)).toBeVisible();
    await expect(canvas.getByLabelText("Expected Delivery Date")).toHaveValue(
      "2026-10-12",
    );
  },
};

/** No line yet: the form says so on Save. */
export const FormNeedsLines: StoryObj<typeof PurchaseOrderForm> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseOrderForm projectId={PROJECT_ID} today={TODAY} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save & Approve" }),
    );
    await expect(
      await canvas.findByText("Add at least one material"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Choose a Supplier", { selector: "p" }),
    ).toBeVisible();
  },
};

/** Edit opens on the stored lines. */
export const Edit: StoryObj<typeof EditPurchaseOrder> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <EditPurchaseOrder
          projectId={PROJECT_ID}
          id={PENDING_PO.id}
          today={TODAY}
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(CEMENT.name)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        (
          calls("POST", `/${PENDING_PO.id}/update`)[0]?.body as {
            expectedUpdatedAt: string;
          }
        ).expectedUpdatedAt,
      ).toBe(PENDING_PO.updatedAt);
    });
  },
};

/** An ordered PO: lines with the GST split, linked PR and GRN, Close with a reason. */
export const DetailOrdered: StoryObj<typeof PurchaseOrderDetailPage> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseOrderDetailPage projectId={PROJECT_ID} id={ORDERED_PO.id} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: ORDERED_PO.number }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "GRN/26-27/00001" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "PR/26-27/00002" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Edit" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Supplier short of stock",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Close Purchase Order" }),
    );
    await waitFor(async () => {
      await expect(calls("POST", `/${ORDERED_PO.id}/close`)[0]?.body).toEqual({
        reason: "Supplier short of stock",
        expectedUpdatedAt: ORDERED_PO.updatedAt,
      });
    });
  },
};

/** A pending PO's detail at phone width. */
export const DetailPhone: StoryObj<typeof PurchaseOrderDetailPage> = {
  beforeEach: serve(),
  globals: { viewport: { value: "mobile1" } },
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseOrderDetailPage projectId={PROJECT_ID} id={PENDING_PO.id} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Approve" }),
    ).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth + 1,
    );
  },
};
