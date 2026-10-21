import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { BALAJI, HIGHWAYS, clientPage } from "./client-fixtures";
import { ClientsPage } from "./clients-page";

const API = "/api/construction/masters/clients";

let api: ReturnType<typeof mockApi>;

function listed(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET" && call.path.startsWith(API))
    .map((call) => call.path);
}

function serve(
  items = [BALAJI, HIGHWAYS],
  remove: () => Response = () => new Response(null, { status: 204 }),
) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === API) {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        return Response.json(
          clientPage(
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
  title: "Masters/Clients/List",
  component: ClientsPage,
  render: () => (
    <StoryQueries>
      <ClientsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof ClientsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Newest first with contact, GSTIN and status; the search goes to the server. */
export const ListAndSearch: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    // A table from md up, cards below; only the shown one is queried.
    await expect(
      await canvas.findByRole("link", { name: "Sri Balaji Developers" }),
    ).toBeVisible();
    await expect(canvas.getAllByText(/33AAPFA0939F1ZM/).length).toBeGreaterThan(
      0,
    );
    await expect(canvas.getAllByText("Inactive").length).toBeGreaterThan(0);
    await expect(canvas.getByText("2 Clients")).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search Clients" }),
      "highways",
    );
    await waitFor(() => expect(listed().at(-1)).toBe(`${API}?q=highways`));
    await expect(await canvas.findByText("1 Client")).toBeVisible();
  },
};

/** At phone width the list is cards, each with its actions. */
export const PhoneCards: Story = {
  beforeEach: serve(),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const cards = await canvas.findByRole("list", { name: "Clients" });
    await expect(cards).toBeVisible();
    await expect(
      within(cards).getByRole("button", {
        name: "Delete Sri Balaji Developers",
      }),
    ).toBeVisible();
  },
};

/** No Clients yet: an empty state with Add. */
export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Clients yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Client" }).length,
    ).toBeGreaterThan(1);
  },
};

/** A Client a Project links cannot be deleted: the server's 409 shows in the dialog. */
export const DeleteRefused: Story = {
  beforeEach: serve([BALAJI], () =>
    Response.json(
      {
        code: "CLIENT_IN_USE",
        message:
          "A Project is linked to this Client, so it cannot be deleted. Change that Project's Client first, or make the Client inactive.",
        details: { projectCount: 1 },
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Delete Sri Balaji Developers",
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
          call.path === `${API}/${BALAJI.id}/delete` &&
          JSON.stringify(call.body) ===
            JSON.stringify({ expectedUpdatedAt: BALAJI.updatedAt }),
      ),
    ).toBe(true);
  },
};
