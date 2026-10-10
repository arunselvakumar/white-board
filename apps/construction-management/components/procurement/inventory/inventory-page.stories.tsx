import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  CEMENT_ID,
  IMPORT_WITH_ERRORS,
  INVENTORY_API,
  mockInventoryApi,
  SAND_ID,
  SITE,
  STEEL_ID,
  type InventoryApiOptions,
} from "./inventory-fixtures";
import { InventoryPage } from "./inventory-page";

let api: ReturnType<typeof mockInventoryApi>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) => call.method === method && call.path.split("?")[0] === path,
    );
}

function inventoryApi(options: InventoryApiOptions = {}) {
  return () => {
    api = mockInventoryApi(options);
    return api.restore;
  };
}

const LOCATION = { kind: "project" as const, id: SITE.id };

const meta = {
  title: "Procurement/Current Inventory",
  component: InventoryPage,
  args: { location: LOCATION },
  beforeEach: inventoryApi(),
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${SITE.id}/materials/inventory` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <InventoryPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InventoryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

/**
 * The stock rows on screen: the table on wide screens, the cards on a
 * phone (the other is hidden).
 */
async function stockRows(canvas: PlayContext["canvas"]): Promise<HTMLElement[]> {
  await canvas.findAllByRole("checkbox", { name: /^Select / });
  const table = canvas.queryByRole("table", { name: "Stock" });
  if (table != null) return within(table).getAllByRole("row").slice(1);
  return within(canvas.getByRole("list", { name: "Stock" })).getAllByRole("listitem");
}

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** The one of `elements` on screen (getAllByRole skips hidden ones; this picks the first). */
function visible(elements: HTMLElement[]): HTMLElement {
  const [first] = elements;
  if (first == null) throw new Error("Nothing on screen");
  return first;
}

/** Opens a row's actions. */
async function rowMenu({ canvas, canvasElement, userEvent }: PlayContext, name: string) {
  const [button] = await canvas.findAllByRole("button", {
    name: `Actions for ${name}`,
  });
  if (button == null) throw new Error(`No actions for ${name}`);
  await userEvent.click(button);
  return within(await body(canvasElement).findByRole("menu"));
}

/** Stock per material from the ledger, with state, estimate, in transit and minimum. */
export const StockList: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Current Inventory" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("4 materials · 1 low · 1 out of stock"),
    ).toBeVisible();
    const rows = await stockRows(canvas);
    await expect(rows).toHaveLength(4);
    const names = [
      "Cement OPC 53 Grade",
      "Asian Paints Apex Exterior Emulsion",
      "M Sand",
      "TMT Steel Bar 12 mm",
    ];
    for (const [index, name] of names.entries())
      await expect(rows[index]).toHaveTextContent(name);
    const cement = within(rows[0] ?? canvasElement);
    await expect(cement.getByText("Low stock")).toBeVisible();
    await expect(cement.getByText("+100 in")).toBeVisible();
    await expect(cement.getByLabelText("Alert on")).toBeVisible();
    await expect(within(rows[2] ?? canvasElement).getByText("Out of stock")).toBeVisible();
    await expect(within(rows[3] ?? canvasElement).getByText("2,450.5")).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Nothing at the location yet: the way in is an import or a receipt. */
export const Empty: Story = {
  beforeEach: inventoryApi({ rows: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No stock here yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Import Inventory Stock" }),
    ).toBeVisible();
  },
};

/** Filters by state, category and name, with a no-match state. */
export const Filters: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await stockRows(canvas);
    await userEvent.click(canvas.getByRole("combobox", { name: "Stock state" }));
    await userEvent.click(await body(canvasElement).findByRole("option", { name: "Low stock" }));
    await waitFor(async () => {
      await expect(await stockRows(canvas)).toHaveLength(1);
    });
    await expect((await stockRows(canvas))[0]).toHaveTextContent("Cement OPC 53 Grade");
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search materials" }), "sand");
    await expect(await canvas.findByText("No materials match")).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Stock state" }));
    await userEvent.click(await body(canvasElement).findByRole("option", { name: "Any state" }));
    await expect(await canvas.findByText("Showing 1 of 4")).toBeVisible();
  },
};

/** Consume Material: lines with date, material, quantity and remark. */
export const Consume: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Consume" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Consume Material" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save consumption" }));
    await expect(await dialog.findByText("Choose a material.")).toBeVisible();
    await expect(calls("POST", `${INVENTORY_API}/movements`)).toHaveLength(0);

    await userEvent.selectOptions(dialog.getByLabelText("Material"), CEMENT_ID);
    await expect(dialog.getByText("In stock: 42 Bag")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Quantity"), "12.5");
    await userEvent.type(dialog.getByLabelText("Remarks"), "Plastering");
    await userEvent.click(dialog.getByRole("button", { name: "Add line" }));
    await expect(dialog.getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(dialog.getByRole("button", { name: "Remove line 2" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save consumption" }));
    await waitFor(async () => {
      await expect(body(canvasElement).queryByRole("dialog")).toBeNull();
    });
    const [sent] = calls("POST", `${INVENTORY_API}/movements`);
    await expect(sent?.body).toMatchObject({
      location: LOCATION,
      kind: "consumed",
      lines: [{ materialId: CEMENT_ID, quantity: "12.5", remark: "Plastering", siteLocation: null }],
    });
  },
};

/** A refusal for stock names the material, how much is short and the date. */
export const ConsumeRefusedForStock: Story = {
  beforeEach: inventoryApi({
    shortfall: {
      materialId: CEMENT_ID,
      materialName: "Cement OPC 53 Grade",
      shortBy: "8.000",
      onDate: "2026-10-08",
    },
  }),
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const menu = await rowMenu(context, "Cement OPC 53 Grade");
    await userEvent.click(menu.getByRole("menuitem", { name: "Consume Material" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Consume Material" }));
    await expect(dialog.getByLabelText("Material")).toHaveValue(CEMENT_ID);
    await userEvent.type(dialog.getByLabelText("Quantity"), "50");
    await userEvent.click(dialog.getByRole("button", { name: "Save consumption" }));
    const alert = within(await dialog.findByRole("alert"));
    await expect(alert.getByText("Not enough stock")).toBeVisible();
    await expect(alert.getByText(/8 short on 8 Oct 2026/)).toBeVisible();
    await expect(alert.getByText("Cement OPC 53 Grade")).toBeVisible();
  },
};

/** Missing Materials from several chosen rows at once. */
export const MissingForChosen: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await stockRows(canvas);
    await userEvent.click(visible(canvas.getAllByRole("checkbox", { name: "Select M Sand" })));
    await userEvent.click(visible(canvas.getAllByRole("checkbox", { name: "Select TMT Steel Bar 12 mm" })));
    await userEvent.click(canvas.getByRole("button", { name: "Missing" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Missing Materials" }));
    const pickers = dialog.getAllByLabelText("Material");
    await expect(pickers.map((picker) => (picker as HTMLSelectElement).value)).toEqual([SAND_ID, STEEL_ID]);
  },
};

/** Chosen materials go on to a Purchase Request, Purchase Order or Transfer. */
export const RaiseFromSelection: Story = {
  play: async ({ canvas, userEvent }) => {
    await stockRows(canvas);
    await userEvent.click(visible(canvas.getAllByRole("checkbox", { name: "Select Cement OPC 53 Grade" })));
    await userEvent.click(visible(canvas.getAllByRole("checkbox", { name: "Select M Sand" })));
    const region = within(canvas.getByRole("region", { name: "Selected materials" }));
    await expect(region.getByText("2 selected")).toBeVisible();
    const base = `/app/projects/${SITE.id}/materials`;
    await expect(region.getByRole("link", { name: "Purchase Request" })).toHaveAttribute(
      "href",
      `${base}/purchase-requests/new?materials=${CEMENT_ID},${SAND_ID}`,
    );
    await expect(region.getByRole("link", { name: "Purchase Order" })).toHaveAttribute(
      "href",
      `${base}/purchase-orders/new?materials=${CEMENT_ID},${SAND_ID}`,
    );
    await expect(region.getByRole("link", { name: "Transfer" })).toHaveAttribute(
      "href",
      `${base}/transfers/new?materials=${CEMENT_ID},${SAND_ID}`,
    );
  },
};

/** Adjust stock: counted quantity and a reason; the difference is shown. */
export const AdjustStock: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const menu = await rowMenu(context, "Cement OPC 53 Grade");
    await userEvent.click(menu.getByRole("menuitem", { name: "Adjust stock" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Adjust stock" }));
    await userEvent.type(dialog.getByLabelText("Counted quantity (Bag)"), "40");
    await expect(dialog.getByRole("status")).toHaveTextContent("Adjustment: −2 Bag");
    await userEvent.click(dialog.getByRole("button", { name: "Adjust stock" }));
    await expect(await dialog.findByText("Say why the stock is adjusted.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Two bags hardened");
    await userEvent.click(dialog.getByRole("button", { name: "Adjust stock" }));
    await waitFor(async () => {
      await expect(body(canvasElement).queryByRole("dialog")).toBeNull();
    });
    await expect(calls("POST", `${INVENTORY_API}/adjustments`)[0]?.body).toMatchObject({
      location: LOCATION,
      materialId: CEMENT_ID,
      countedQty: "40",
      reason: "Two bags hardened",
    });
  },
};

/** Minimum stock here and the alert toggle. */
export const MinimumAndAlert: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const menu = await rowMenu(context, "M Sand");
    await userEvent.click(menu.getByRole("menuitem", { name: "Minimum stock and alert" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Minimum stock" }));
    await userEvent.type(dialog.getByLabelText("Minimum stock here (cum)"), "25");
    await userEvent.click(dialog.getByRole("switch", { name: "Minimum stock alert" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(body(canvasElement).queryByRole("dialog")).toBeNull();
    });
    await expect(calls("POST", `${INVENTORY_API}/settings`)[0]?.body).toEqual({
      location: LOCATION,
      materialId: SAND_ID,
      minStockQty: "25",
      minAlertEnabled: true,
    });
  },
};

/** Update Estimation Qty. */
export const EstimationQty: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const menu = await rowMenu(context, "Cement OPC 53 Grade");
    await userEvent.click(menu.getByRole("menuitem", { name: "Update Estimation Qty" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Estimation Qty" }));
    const input = dialog.getByLabelText("Estimated Qty (Bag)");
    await expect(input).toHaveValue("1200");
    await userEvent.clear(input);
    await userEvent.type(input, "1500");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(calls("POST", `${INVENTORY_API}/settings`)[0]?.body).toEqual({
        location: LOCATION,
        materialId: CEMENT_ID,
        estimatedQty: "1500",
      });
    });
  },
};

/** History: every entry with its source, counterparty, who and balance. */
export const History: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await stockRows(canvas);
    await userEvent.click(visible(canvas.getAllByRole("button", { name: "Cement OPC 53 Grade" })));
    const sheet = within(await body(canvasElement).findByRole("dialog", { name: "History" }));
    const entries = within(await sheet.findByRole("list", { name: "Stock entries" }));
    const items = entries.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    await expect(within(items[0] ?? canvasElement).getByText("−18 Bag")).toBeVisible();
    await expect(within(items[0] ?? canvasElement).getByText("Plastering, 3rd floor")).toBeVisible();
    await expect(within(items[1] ?? canvasElement).getByText(/To Villa Phase 2/)).toBeVisible();
    await expect(sheet.getByRole("link", { name: "GRN/26-27/00012" })).toHaveAttribute(
      "href",
      `/app/projects/${SITE.id}/materials/goods-received/0199c4a0-0000-7000-8000-0000000b0001`,
    );
    await expect(sheet.getAllByRole("button", { name: /^Actions for / })).toHaveLength(1);
    await userEvent.click(sheet.getByRole("button", { name: "Actions for Consumed on 8 Oct 2026" }));
    await userEvent.click(await body(canvasElement).findByRole("menuitem", { name: "Delete" }));
    const confirm = within(await body(canvasElement).findByRole("alertdialog"));
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(calls("POST", `${INVENTORY_API}/movements/0199c4a0-0000-7000-8000-0000000e1001/delete`)).toHaveLength(1);
    });
  },
};

/** Import Inventory Stock: the rows are checked, then posted. */
export const ImportStock: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "More" }));
    await userEvent.click(await body(canvasElement).findByRole("menuitem", { name: "Import Inventory Stock" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Import Inventory Stock" }));
    await expect(dialog.getByRole("link", { name: "Export Sample Excel" })).toHaveAttribute(
      "href",
      `${INVENTORY_API}/sample?locationKind=project&locationId=${SITE.id}`,
    );
    const file = new File(["xlsx"], "opening-stock.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), file);
    await expect(await dialog.findByText("2 ready · 0 with errors")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Import 2 rows" }));
    await expect(
      await dialog.findByText("Imported: 1 opening entry, 2 estimated quantities."),
    ).toBeVisible();
    await expect(calls("POST", `${INVENTORY_API}/import`)).toHaveLength(2);
  },
};

/** A row in error blocks the whole import. */
export const ImportWithErrors: Story = {
  beforeEach: inventoryApi({ importResult: IMPORT_WITH_ERRORS }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "More" }));
    await userEvent.click(await body(canvasElement).findByRole("menuitem", { name: "Import Inventory Stock" }));
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Import Inventory Stock" }));
    await userEvent.upload(
      dialog.getByLabelText("Choose Excel file"),
      new File(["xlsx"], "opening-stock.xlsx"),
    );
    await expect(await dialog.findByText("2 ready · 1 with errors")).toBeVisible();
    await expect(dialog.getByText("No material named “Granite slab” in Masters.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Import 2 rows" })).toBeDisabled();
  },
};

/** Read only: no Consume, Missing or Import; history still opens. */
export const ReadOnly: Story = {
  beforeEach: inventoryApi({
    flags: {
      "procurement.current_inventory": ["read"],
      "procurement.purchase_requests": [],
      "procurement.purchase_orders": [],
      "procurement.material_transfers": [],
      "procurement.material_received": [],
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await stockRows(canvas);
    await expect(canvas.queryByRole("button", { name: "Consume" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Missing" })).toBeNull();
    const [actions] = canvas.getAllByRole("button", { name: "Actions for M Sand" });
    if (actions == null) throw new Error("no actions");
    await userEvent.click(actions);
    const menu = within(await body(canvasElement).findByRole("menu"));
    await expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["History"]);
  },
};
