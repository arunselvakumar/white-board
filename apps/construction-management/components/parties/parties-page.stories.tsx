import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { PartiesPage } from "./parties-page";
import { BALAJI, KAVERI, RAMCO, page } from "./party-fixtures";

const CONTRACTORS = "/api/construction/masters/contractors";
const SUPPLIERS = "/api/construction/masters/suppliers";

let api: ReturnType<typeof mockFetch>;

function listedQueries(path: string): URLSearchParams[] {
  return api.spy.mock.calls
    .map(([input]) => (typeof input === "string" ? input : ""))
    .filter((url) => url.startsWith(`${path}?`))
    .map((url) => new URL(url, "http://storybook.local").searchParams);
}

const meta = {
  title: "Masters/Parties/List",
  component: PartiesPage,
  args: { list: "contractors" },
  render: (args) => (
    <StoryQueryClient>
      <PartiesPage {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof PartiesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contractors: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: CONTRACTORS,
        respond: () => Response.json(page([BALAJI, RAMCO])),
      },
      {
        method: "POST",
        path: `${CONTRACTORS}/${BALAJI.id}/delete`,
        respond: () =>
          Response.json(
            {
              code: "CONTRACTOR_ON_PROJECTS",
              message:
                "This Contractor is on Tower A, Villa Phase 2. Take them off their Projects first, or make them inactive.",
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const table = await canvas.findByRole("table", { name: "Contractors" });
    const rows = within(table);
    await expect(
      rows.getByRole("link", { name: "Sri Balaji Constructions" }),
    ).toHaveAttribute("href", `/app/masters/contractors/${BALAJI.id}`);
    await expect(rows.getByText("Murugan · +91 77081 65767")).toBeVisible();
    // The GST state column shows from md up; story tests run phone-wide.
    await expect(rows.getByText("Tamil Nadu")).toBeInTheDocument();
    await expect(rows.getByText("Painting +1")).toBeVisible();
    await expect(rows.getByText("Tower A +1")).toBeVisible();
    await expect(rows.getByText("Inactive")).toBeVisible();
    await expect(canvas.getByText("2 Contractors")).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search Contractors" }),
      "balaji",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Inactive" }));
    await waitFor(() =>
      expect(
        listedQueries(CONTRACTORS).some(
          (query) =>
            query.get("q") === "balaji" && query.get("active") === "false",
        ),
      ).toBe(true),
    );

    // On Projects, a Contractor cannot be deleted; the dialog says why.
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Sri Balaji Constructions",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(
        dialog.getByText("Delete Sri Balaji Constructions?"),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "This Contractor is on Tower A, Villa Phase 2.",
    );
  },
};

export const SuppliersOnAPhone: Story = {
  args: { list: "suppliers" },
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    api = mockFetch([
      { path: SUPPLIERS, respond: () => Response.json(page([KAVERI])) },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    const table = await canvas.findByRole("table", { name: "Suppliers" });
    await expect(within(table).getByText("Kaveri Cements")).toBeVisible();
    // Suppliers have no Departments column.
    await expect(
      within(table).queryByRole("columnheader", { name: "Departments" }),
    ).toBeNull();
    await expect(canvas.getByText("1 Supplier")).toBeVisible();
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};

export const Empty: Story = {
  args: { list: "suppliers" },
  beforeEach: () => {
    api = mockFetch([
      { path: SUPPLIERS, respond: () => Response.json(page([])) },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Suppliers yet")).toBeVisible();
    const links = canvas.getAllByRole("link", { name: "Add Supplier" });
    await expect(links).toHaveLength(2);
    for (const link of links)
      await expect(link).toHaveAttribute("href", "/app/masters/suppliers/new");
  },
};

/** A Supplier on Purchase Orders or Goods Receipts cannot be deleted; the dialog says why. */
export const SupplierInUse: Story = {
  args: { list: "suppliers" },
  beforeEach: () => {
    api = mockFetch([
      { path: SUPPLIERS, respond: () => Response.json(page([KAVERI])) },
      {
        method: "POST",
        path: `${SUPPLIERS}/${KAVERI.id}/delete`,
        respond: () =>
          Response.json(
            {
              code: "SUPPLIER_IN_USE",
              message:
                "Purchase Orders or Goods Receipts name this Supplier, so it cannot be deleted. Make them inactive instead.",
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Kaveri Cements" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Purchase Orders or Goods Receipts name this Supplier, so it cannot be deleted.",
    );
    // The dialog stays open with the reason.
    await expect(
      dialog.getByText("Delete Kaveri Cements?"),
    ).toBeInTheDocument();
  },
};
