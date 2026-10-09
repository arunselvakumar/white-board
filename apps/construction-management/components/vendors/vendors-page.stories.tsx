import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { PROJECT_OPTIONS, VENDOR_SUMMARIES } from "./vendor-fixtures";
import { VendorsPage } from "./vendors-page";

const VENDORS = "/api/construction/labour/vendors";
const PROJECTS = "/api/construction/projects/projects/options";

let api: ReturnType<typeof mockFetch>;

function listedQueries(): URLSearchParams[] {
  return api.spy.mock.calls
    .map(([input]) => (typeof input === "string" ? input : ""))
    .filter((url) => url.startsWith(`${VENDORS}?`))
    .map((url) => new URL(url, "http://storybook.local").searchParams);
}

const meta = {
  title: "Masters/Vendors/List",
  component: VendorsPage,
  render: () => (
    <StoryQueryClient>
      <VendorsPage />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof VendorsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithVendors: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: PROJECTS,
        respond: () => Response.json({ items: PROJECT_OPTIONS }),
      },
      {
        path: VENDORS,
        respond: () =>
          Response.json({
            items: VENDOR_SUMMARIES,
            nextCursor: null,
            prevCursor: null,
            total: VENDOR_SUMMARIES.length,
          }),
      },
      {
        method: "POST",
        path: `${VENDORS}/${VENDOR_SUMMARIES[0]?.id ?? ""}/deactivate`,
        respond: () => Response.json({}),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const table = await canvas.findByRole("table", { name: "Vendors" });
    const rows = within(table);
    await expect(
      rows.getByRole("link", { name: "Muthu Gang" }),
    ).toHaveAttribute(
      "href",
      `/app/masters/vendors/${VENDOR_SUMMARIES[0]?.id ?? ""}`,
    );
    await expect(rows.getByText("No rate card")).toBeVisible();
    await expect(rows.getByText("Tower A +1")).toBeVisible();
    await expect(rows.getByText("₹25,000.00")).toBeVisible();
    await expect(rows.getByText("-₹5,000.00")).toBeVisible();
    await expect(rows.getByText("Inactive")).toBeVisible();
    await expect(canvas.getByText("2 Vendors")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Active" }));
    await waitFor(() =>
      expect(
        listedQueries().some((query) => query.get("active") === "true"),
      ).toBe(true),
    );

    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Muthu Gang" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Deactivate" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(dialog.getByText("Deactivate Muthu Gang?")).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(
        api.spy.mock.calls.some(
          ([input, init]) =>
            init?.method === "POST" &&
            typeof input === "string" &&
            input.endsWith("/deactivate"),
        ),
      ).toBe(true),
    );
  },
};

export const Empty: Story = {
  beforeEach: () => {
    api = mockFetch([
      { path: PROJECTS, respond: () => Response.json({ items: [] }) },
      {
        path: VENDORS,
        respond: () =>
          Response.json({
            items: [],
            nextCursor: null,
            prevCursor: null,
            total: 0,
          }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Vendors yet")).toBeVisible();
    const links = canvas.getAllByRole("link", { name: "Add Vendor" });
    for (const link of links)
      await expect(link).toHaveAttribute("href", "/app/masters/vendors/new");
  },
};
