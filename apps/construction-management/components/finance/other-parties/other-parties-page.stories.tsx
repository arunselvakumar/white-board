import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { OtherPartiesPage } from "./other-parties-page";
import { LAKSHMI, MURUGAN, otherPartyPage } from "./other-party-fixtures";

const API = "/api/construction/finance/other-parties";

let api: ReturnType<typeof mockApi>;

function listed(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET" && call.path.startsWith(API))
    .map((call) => call.path);
}

function serve(
  items = [LAKSHMI, MURUGAN],
  remove: () => Response = () => new Response(null, { status: 204 }),
) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === API) {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        return Response.json(
          otherPartyPage(
            items.filter((item) => item.name.toLowerCase().includes(q)),
          ),
        );
      }
      if (call.method === "POST" && url.pathname.endsWith("/delete"))
        return remove();
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Finance/Other Parties/List",
  component: OtherPartiesPage,
  render: () => (
    <StoryQueries>
      <OtherPartiesPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof OtherPartiesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Newest first with contact, GSTIN and Projects; the search goes to the server. */
export const ListAndSearch: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    // A table from md up, cards below; only the shown one is queried.
    await expect(
      await canvas.findByRole("link", { name: "Sri Lakshmi Traders" }),
    ).toBeVisible();
    await expect(canvas.getAllByText(/33AAPFA0939F1ZM/).length).toBeGreaterThan(
      0,
    );
    await expect(canvas.getAllByText(/^Tower A \+1/).length).toBeGreaterThan(0);
    await expect(canvas.getByText("2 Other Parties")).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search Other Parties" }),
      "murugan",
    );
    await waitFor(() => expect(listed().at(-1)).toBe(`${API}?q=murugan`));
    await expect(await canvas.findByText("1 Other Party")).toBeVisible();
  },
};

/** No Other Parties yet: an empty state with Add. */
export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Other Parties yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Other Party" }).length,
    ).toBeGreaterThan(1);
  },
};

/** A party with invoices cannot be deleted: the server's 409 shows in the dialog. */
export const DeleteRefused: Story = {
  beforeEach: serve([LAKSHMI], () =>
    Response.json(
      {
        code: "OTHER_PARTY_IN_USE",
        message:
          "This Other Party has invoices, payments or an opening balance, so it cannot be deleted.",
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Delete Sri Lakshmi Traders",
      }),
    );
    const dialog = await body.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(/cannot be deleted\.$/),
    ).toBeVisible();
    await expect(
      api.calls.mock.calls.some(
        ([call]) =>
          call.method === "POST" &&
          call.path === `${API}/${LAKSHMI.id}/delete` &&
          JSON.stringify(call.body) ===
            JSON.stringify({ expectedUpdatedAt: LAKSHMI.updatedAt }),
      ),
    ).toBe(true);
  },
};
