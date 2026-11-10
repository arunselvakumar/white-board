import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ReportJob } from "@/src/queries/reports";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { CentralReportsPage } from "./central-reports-page";
import {
  catalogueHandler,
  CENTRAL_CATALOGUE_PATH,
  CENTRAL_FILTER_OPTIONS_PATH,
  CENTRAL_REPORTS_LIST_PATH,
  DONE_CENTRAL_STOCK,
  FILTER_OPTIONS,
  STORE_ID,
  TODAY,
  VILLA_ID,
} from "./report-fixtures";

let api: ReturnType<typeof mockApi>;

function list(items: ReportJob[]): Response {
  return Response.json({ items });
}

/** Every central report, the pickers' choices and the recent list. */
function centralApi(
  recent: ReportJob[] = [DONE_CENTRAL_STOCK],
): (call: ApiCall) => Response | undefined {
  const catalogue = catalogueHandler();
  return (call) => {
    const answered = catalogue(call);
    if (answered != null) return answered;
    if (call.method === "GET" && call.path === CENTRAL_FILTER_OPTIONS_PATH)
      return Response.json(FILTER_OPTIONS);
    if (call.method === "GET" && call.path === CENTRAL_REPORTS_LIST_PATH)
      return list(recent);
    if (call.method === "POST" && call.path === CENTRAL_REPORTS_LIST_PATH)
      return Response.json(
        { ...DONE_CENTRAL_STOCK, id: "0190a000-0000-7000-8000-0000000000ba" },
        { status: 201 },
      );
    return undefined;
  };
}

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Reports/Central Reports",
  component: CentralReportsPage,
  args: { today: TODAY },
  render: (args) => (
    <StoryQueries>
      <CentralReportsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CentralReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every central report by group, with the recent central reports. */
export const List: Story = {
  beforeEach: () => {
    api = mockApi(centralApi());
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Central Reports" }),
    ).toBeVisible();
    for (const heading of [
      "Labour and vendors",
      "Materials",
      "Equipment",
      "Payments and accounts",
    ])
      await expect(
        await canvas.findByRole("heading", { name: heading }),
      ).toBeVisible();
    for (const name of [
      "Central Labour Attendance",
      "Vendor Attendance",
      "Purchase Requests",
      "Purchase Orders",
      "Material Received",
      "Material Transfers",
      "Stock Register",
      "Ledger",
    ])
      await expect(canvas.getByRole("form", { name })).toBeVisible();
    // Central wording.
    const orders = within(
      canvas.getByRole("form", { name: "Purchase Orders" }),
    );
    await expect(
      orders.getByText(/of the Projects you may see and the Central Stores/),
    ).toBeVisible();
    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getByText("Stock Register")).toBeVisible();
    await expect(recent.getAllByRole("link")).toHaveLength(2);
  },
};

/** No central report the member may request. */
export const Empty: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path === CENTRAL_CATALOGUE_PATH
        ? Response.json({ scope: "central", items: [] })
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No central reports you can generate"),
    ).toBeVisible();
    // The recent list needs a report the member may request.
    await expect(
      canvas.queryByRole("heading", { name: "Your recent central reports" }),
    ).toBeNull();
  },
};

/** While the catalogue loads, the cards are placeholders. */
export const Loading: Story = {
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Central Reports" }),
    ).toBeVisible();
    // The report cards are a skeleton until the catalogue arrives (ADR-0047).
    await expect(
      canvas.getByText("Loading central reports"),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("form")).toBeNull();
  },
};

/**
 * The Stock Register's filter sheet: a Store and a chosen Project go in
 * the request.
 */
export const StockFilters: Story = {
  beforeEach: () => {
    api = mockApi(centralApi([]));
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = within(
      await canvas.findByRole("form", { name: "Stock Register" }),
    );
    await waitFor(() =>
      expect(card.getByRole("combobox", { name: "Store" })).toBeVisible(),
    );
    await expect(
      card.getByRole("combobox", { name: "Material" }),
    ).toBeVisible();
    await expect(
      card.getByRole("combobox", { name: "Material Category" }),
    ).toBeVisible();
    await expect(card.getByText("Every Project you may see.")).toBeVisible();

    await userEvent.click(card.getByRole("combobox", { name: "Store" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Central Store Ambattur" }),
    );
    await userEvent.click(card.getByLabelText("Projects"));
    await userEvent.click(
      await body.findByRole("option", { name: "Villa Phase 2" }),
    );
    await userEvent.keyboard("{Escape}");
    await expect(card.getByText("Only these Projects.")).toBeVisible();
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "stock_register",
      projectId: null,
      params: {
        from: "2026-10-01",
        to: TODAY,
        storeId: STORE_ID,
        projectIds: [VILLA_ID],
      },
    });
    await expect(await card.findByText("Ready to download")).toBeVisible();
  },
};

/** Purchase Orders: Status, Supplier and every Project by default. */
export const OrderFilters: Story = {
  beforeEach: () => {
    api = mockApi(centralApi([]));
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = within(
      await canvas.findByRole("form", { name: "Purchase Orders" }),
    );
    await waitFor(() =>
      expect(card.getByRole("combobox", { name: "Supplier" })).toBeVisible(),
    );
    await userEvent.click(card.getByRole("combobox", { name: "Status" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Approved" }),
    );
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "purchase_orders",
      projectId: null,
      params: { from: "2026-10-01", to: TODAY, status: "approved" },
    });
    // The Tower is a choice for the Projects filter.
    await userEvent.click(card.getByLabelText("Projects"));
    await expect(
      await body.findByRole("option", { name: "Kumari Heights, Tower A" }),
    ).toBeVisible();
  },
};

/** Phones: one column of cards, nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    api = mockApi(centralApi());
    return api.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("form", { name: "Stock Register" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(canvas.getByRole("form", { name: "Stock Register" })).getByRole(
          "combobox",
          { name: "Store" },
        ),
      ).toBeVisible(),
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
