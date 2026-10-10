import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { Quotation } from "@/src/queries/quotations";

import { StoryQueries, mockApi } from "../../.storybook/mocks/api";
import {
  BALAJI,
  BALAJI_QUOTATIONS,
  KAVERI,
  KAVERI_QUOTATION,
} from "./party-fixtures";
import { QuotationsPage } from "./quotations-page";

const LIST = "/api/construction/masters/quotations";

let api: ReturnType<typeof mockApi>;

function listed(): URLSearchParams[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET" && call.path.startsWith(`${LIST}?`))
    .map((call) => new URL(call.path, "http://storybook.local").searchParams);
}

/** The list API, filtered the way the server does. */
function quotationsApi(
  items: Quotation[],
  cursors: { nextCursor: string | null; total?: number } = {
    nextCursor: null,
  },
) {
  return () => {
    api = mockApi((call) => {
      if (call.method !== "GET" || !call.path.startsWith(`${LIST}?`))
        return undefined;
      const query = new URL(call.path, "http://storybook.local").searchParams;
      const q = query.get("q")?.toLowerCase() ?? "";
      const kind = query.get("partyKind");
      const shown = items.filter(
        (item) =>
          (kind == null || item.partyKind === kind) &&
          (q === "" ||
            item.partyName.toLowerCase().includes(q) ||
            item.fileName.toLowerCase().includes(q)),
      );
      return Response.json({
        items: shown,
        nextCursor: query.has("after") ? null : cursors.nextCursor,
        prevCursor: query.has("after") ? "cursor-back" : null,
        total: cursors.total ?? shown.length,
      });
    });
    return api.restore;
  };
}

const ALL = [...BALAJI_QUOTATIONS, KAVERI_QUOTATION];

const meta = {
  title: "Masters/Parties/View Quotations",
  component: QuotationsPage,
  beforeEach: quotationsApi(ALL),
  render: () => (
    <StoryQueries>
      <QuotationsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof QuotationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every party's files, newest first, each linking to its party. */
export const List: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "View Quotations" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Masters" }),
    ).toHaveAttribute("href", "/app/masters");
    const table = within(
      await canvas.findByRole("table", { name: "Quotations" }),
    );
    await expect(canvas.getByText("3 quotations")).toBeVisible();
    const rows = table.getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(3);
    await expect(rows[0]).toHaveTextContent("RCC labour rates Oct 2026.pdf");
    const first = within(
      table.getByRole("row", { name: /RCC labour rates Oct 2026/ }),
    );
    await expect(
      first.getByText("RCC labour rates Oct 2026.pdf"),
    ).toBeVisible();
    await expect(first.getByText("1.2 MB")).toBeVisible();
    await expect(
      first.getByRole("link", { name: BALAJI.name }),
    ).toHaveAttribute("href", `/app/masters/contractors/${BALAJI.id}`);
    await expect(first.getByText("Contractor")).toBeVisible();
    await expect(first.getByText("8 Oct 2026")).toBeVisible();
    await expect(first.getByText("Karthik R")).toBeVisible();
    const open = first.getByRole("link", {
      name: "Open RCC labour rates Oct 2026.pdf",
    });
    await expect(open).toHaveAttribute("href", BALAJI_QUOTATIONS[0]?.url);
    await expect(open).toHaveAttribute("target", "_blank");

    await expect(rows[2]).toHaveTextContent("Cement OPC 53 rates.pdf");
    const supplier = within(
      table.getByRole("row", { name: /Cement OPC 53 rates/ }),
    );
    await expect(
      supplier.getByRole("link", { name: KAVERI.name }),
    ).toHaveAttribute("href", `/app/masters/suppliers/${KAVERI.id}`);
    await expect(supplier.getByText("Supplier")).toBeVisible();
    // No uploader name.
    await expect(
      within(
        table.getByRole("row", { name: /Plastering quote photo/ }),
      ).getByText("—"),
    ).toBeVisible();
  },
};

/** Search and the party toggle go to the server; no match says so. */
export const Filter: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("table", { name: "Quotations" });
    await userEvent.click(canvas.getByRole("button", { name: "Suppliers" }));
    await waitFor(() =>
      expect(
        listed().some((query) => query.get("partyKind") === "supplier"),
      ).toBe(true),
    );
    await expect(await canvas.findByText("1 quotation")).toBeVisible();
    await expect(canvas.getByText("Cement OPC 53 rates.pdf")).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search quotations" }),
      "steel",
    );
    await waitFor(() =>
      expect(
        listed().some(
          (query) =>
            query.get("q") === "steel" && query.get("partyKind") === "supplier",
        ),
      ).toBe(true),
    );
    await expect(await canvas.findByText("No quotations match")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "All" }));
    await userEvent.clear(
      canvas.getByRole("searchbox", { name: "Search quotations" }),
    );
    await expect(await canvas.findByText("3 quotations")).toBeVisible();
  },
};

/** More than a page: Next asks for the page after the cursor. */
export const Pages: Story = {
  beforeEach: quotationsApi(ALL, { nextCursor: "cursor-next", total: 28 }),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("28 quotations")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(
        listed().some((query) => query.get("after") === "cursor-next"),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Previous" })).toBeEnabled(),
    );
  },
};

export const Empty: Story = {
  beforeEach: quotationsApi([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No quotations yet")).toBeVisible();
    await expect(
      canvas.getByText(
        "Upload a quotation on a Contractor's or Supplier's page, under Masters, and it shows here.",
      ),
    ).toBeVisible();
  },
};

/** Phones: the table scrolls inside its own box, never the page. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("table", { name: "Quotations" });
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};
