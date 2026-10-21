import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { PCC, PLASTER, itemPage } from "./item-fixtures";
import { ItemsPage } from "./items-page";
import type { Flag } from "@/src/shared-kernel/access";
import type { Item } from "@/src/queries/contracts-items";

const API = "/api/construction/contracts/items";

let api: ReturnType<typeof mockApi>;

function listed(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET" && call.path.startsWith(`${API}?`))
    .map((call) => call.path);
}

function serve(
  items: Item[] = [PLASTER, PCC],
  options: { flags?: Flag[]; remove?: () => Response } = {},
) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === `${API}/schedules`)
        return Response.json({
          items: ["CPWD DSR 2023", "TN PWD SoR 2025-26"],
        });
      if (call.method === "GET" && url.pathname === API) {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        const schedule = url.searchParams.get("schedule");
        return Response.json(
          itemPage(
            items.filter(
              (item) =>
                (item.code.toLowerCase().includes(q) ||
                  item.shortDescription.toLowerCase().includes(q)) &&
                (schedule == null || item.schedule === schedule),
            ),
            options.flags,
          ),
        );
      }
      if (call.method === "POST" && url.pathname.endsWith("/delete"))
        return options.remove?.() ?? new Response(null, { status: 204 });
      return undefined;
    });
    return api.restore;
  };
}

/** The table from md up or the cards below it: whichever is shown. */
async function shownItems(canvas: {
  findAllByLabelText: (text: string) => Promise<HTMLElement[]>;
}): Promise<HTMLElement> {
  const found = (await canvas.findAllByLabelText("Items")).find((element) =>
    element.checkVisibility(),
  );
  if (found == null) throw new Error("No Items shown");
  return found;
}

const meta = {
  title: "Masters/Item Library/List",
  component: ItemsPage,
  render: () => (
    <StoryQueries>
      <ItemsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof ItemsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Code order with the adopted and analysed rates; the search and the
 * schedule filter go to the server, and Export follows the filter.
 */
export const ListAndFilter: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const items = within(await shownItems(canvas));
    await expect(items.getByRole("link", { name: "5.1.1" })).toBeVisible();
    await expect(items.getByText("₹650.00")).toBeVisible();
    await expect(items.getByText(/adopted \+4\.29 %/)).toBeVisible();
    await expect(canvas.getByText("2 Items")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Add Item" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sample" })).toHaveAttribute(
      "href",
      `${API}/sample`,
    );
    await expect(canvas.getByRole("button", { name: "Import" })).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search Items" }),
      "pcc",
    );
    await waitFor(() => expect(listed().at(-1)).toBe(`${API}?q=pcc`));
    await expect(await canvas.findByText("1 Item")).toBeVisible();
    await userEvent.clear(
      canvas.getByRole("searchbox", { name: "Search Items" }),
    );

    await userEvent.click(canvas.getByRole("combobox", { name: "Schedule" }));
    await userEvent.click(
      await body.findByRole("option", { name: "TN PWD SoR 2025-26" }),
    );
    await waitFor(() =>
      expect(listed().at(-1)).toBe(`${API}?schedule=TN+PWD+SoR+2025-26`),
    );
    await waitFor(async () =>
      expect(
        within(await shownItems(canvas)).queryByText(
          "PCC 1:4:8 in foundations",
        ),
      ).toBeNull(),
    );
    await expect(
      within(await shownItems(canvas)).getByText("12 mm cement plaster 1:6"),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Export" })).toHaveAttribute(
      "href",
      `${API}/export?schedule=TN+PWD+SoR+2025-26`,
    );
  },
};

/** At phone width the list is cards, each with its rates and actions. */
export const PhoneCards: Story = {
  beforeEach: serve(),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const cards = await canvas.findByRole("list", { name: "Items" });
    await expect(cards).toBeVisible();
    await expect(within(cards).getByText("per cum")).toBeVisible();
    await expect(
      within(cards).getByRole("button", { name: "Delete 5.1.1" }),
    ).toBeVisible();
  },
};

/** No Items yet: an empty state with Add and Import. */
export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Items yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Item" }).length,
    ).toBeGreaterThan(1);
    await expect(
      canvas.getAllByRole("button", { name: "Import" }).length,
    ).toBeGreaterThan(1);
  },
};

/** With only View: no Add, Import, Export, Edit or Delete. */
export const ReadOnly: Story = {
  beforeEach: serve([PLASTER, PCC], { flags: ["read"] }),
  play: async ({ canvas }) => {
    const items = within(await shownItems(canvas));
    await expect(items.getByText("5.1.1")).toBeVisible();
    await expect(items.queryByRole("link", { name: "5.1.1" })).toBeNull();
    for (const name of ["Add Item", "Export", "Sample"])
      await expect(canvas.queryByRole("link", { name })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Import" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Delete 5.1.1" }),
    ).toBeNull();
  },
};

/** An Item a BOQ uses cannot be deleted: the server's 409 shows in the dialog. */
export const DeleteInUse: Story = {
  beforeEach: serve([PCC], {
    remove: () =>
      Response.json(
        {
          code: "ITEM_IN_USE",
          message: "2 BOQ items use this Item, so it cannot be deleted.",
          details: { count: 2 },
        },
        { status: 409 },
      ),
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(await shownItems(canvas)).getByRole("button", {
        name: "Delete 5.1.1",
      }),
    );
    const dialog = await body.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(/so it cannot be deleted/),
    ).toBeVisible();
    await expect(
      api.calls.mock.calls.some(
        ([call]) =>
          call.method === "POST" &&
          call.path === `${API}/${PCC.id}/delete` &&
          JSON.stringify(call.body) ===
            JSON.stringify({ expectedUpdatedAt: PCC.updatedAt }),
      ),
    ).toBe(true);
  },
};
