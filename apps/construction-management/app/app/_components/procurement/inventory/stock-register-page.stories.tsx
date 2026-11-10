import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  INVENTORY_API,
  mockInventoryApi,
  SITE,
  type InventoryApiOptions,
} from "./inventory-fixtures";
import { StockRegisterPage } from "./stock-register-page";

let api: ReturnType<typeof mockInventoryApi>;

function registerCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.path.startsWith(`${INVENTORY_API}/register?`));
}

function inventoryApi(options: InventoryApiOptions = {}) {
  return () => {
    api = mockInventoryApi(options);
    return api.restore;
  };
}

const LOCATION = { kind: "project" as const, id: SITE.id };

const meta = {
  title: "Procurement/Stock Register",
  component: StockRegisterPage,
  args: { location: LOCATION, today: "2026-10-10" },
  beforeEach: inventoryApi(),
  render: (args) => (
    <StoryQueries>
      <StockRegisterPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof StockRegisterPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening, movements by type and closing per material, with the download. */
export const Register: Story = {
  play: async ({ canvas, canvasElement }) => {
    const table = within(
      await canvas.findByRole("table", { name: "Stock Register" }),
    );
    await expect(
      table.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual([
      "Material",
      "Opening",
      "Received",
      "Transferred in",
      "Transferred out",
      "Issued",
      "Received from store",
      "Consumed",
      "Missing",
      "Adjustment",
      "Closing",
    ]);
    const [cement] = table.getAllByRole("row").slice(1);
    await expect(cement).toHaveTextContent("Cement OPC 53 Grade");
    await expect(within(cement ?? canvasElement).getByText("42")).toBeVisible();
    await expect(registerCalls()[0]?.path).toContain(
      "from=2026-10-01&to=2026-10-10",
    );
    await expect(
      canvas.getByRole("link", { name: "Download Excel" }),
    ).toHaveAttribute(
      "href",
      `${INVENTORY_API}/register/export?locationKind=project&locationId=${SITE.id}&from=2026-10-01&to=2026-10-10`,
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** A new range reloads; a backwards range asks for a valid one. */
export const ChangeRange: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("table", { name: "Stock Register" });
    const from = canvas.getByLabelText("From");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-09-01");
    await waitFor(async () => {
      await expect(registerCalls().at(-1)?.path).toContain("from=2026-09-01");
    });
    await userEvent.clear(from);
    await userEvent.type(from, "2026-10-20");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Choose a start date on or before the end date.",
    );
  },
};

/** Nothing held or moved in the range. */
export const Empty: Story = {
  beforeEach: inventoryApi({
    register: {
      location: SITE,
      from: "2026-10-01",
      to: "2026-10-10",
      items: [],
    },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing in stock or moved"),
    ).toBeVisible();
  },
};
