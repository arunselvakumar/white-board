import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import {
  CATEGORY_LIST,
  MURUGAN,
  RAVI,
  PROJECT_OPTIONS,
  DHURESH,
  MEENA,
  SUPERVISOR_LIST,
  TOWER,
  VILLA,
  listOf,
  withoutAmounts,
} from "./labour-fixtures";
import { LaboursPage } from "./labours-page";

const LABOURS = "/api/construction/labour/labours";

let api: ReturnType<typeof mockFetch>;

const LOOKUPS = [
  {
    path: "/api/construction/projects/projects/options",
    respond: () => Response.json({ items: PROJECT_OPTIONS }),
  },
  {
    path: "/api/construction/masters/labour-categories",
    respond: () => Response.json(CATEGORY_LIST),
  },
  {
    path: "/api/construction/masters/supervisors",
    respond: () => Response.json(SUPERVISOR_LIST),
  },
];

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function listUrls(): string[] {
  return api.spy.mock.calls
    .map(([input]) => urlOf(input))
    .filter((url) => url.startsWith(`${LABOURS}?`));
}

function posts(): number {
  return api.spy.mock.calls.filter(([, init]) => init?.method === "POST")
    .length;
}

function serve(items: (typeof DHURESH)[]) {
  return () => {
    api = mockFetch([
      ...LOOKUPS,
      { path: LABOURS, respond: () => Response.json(listOf(items)) },
      {
        path: `${LABOURS}/${DHURESH.id}/transfers`,
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a1b2-0000-7000-8000-00000000e001",
                fromProject: null,
                toProject: VILLA,
                transferDate: "2026-09-01",
                remark: null,
                createdAt: DHURESH.createdAt,
              },
              {
                id: "0199a1b2-0000-7000-8000-00000000e002",
                fromProject: VILLA,
                toProject: TOWER,
                transferDate: "2026-10-04",
                remark: "Slab work",
                createdAt: DHURESH.createdAt,
              },
              {
                // Unticked on Edit Labour (ADR CM-0033).
                id: "0199a1b2-0000-7000-8000-00000000e003",
                fromProject: TOWER,
                toProject: null,
                transferDate: "2026-10-10",
                remark: null,
                createdAt: DHURESH.createdAt,
              },
            ],
          }),
      },
      {
        method: "POST",
        path: `${LABOURS}/transfer`,
        respond: () => Response.json({ items: [] }),
      },
    ]);
    return api.restore;
  };
}

const meta = {
  title: "Masters/Labours/List",
  component: LaboursPage,
  render: () => (
    <StoryQueryClient>
      <LaboursPage />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof LaboursPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLabours: Story = {
  beforeEach: serve([DHURESH, MEENA, MURUGAN, RAVI]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const table = await canvas.findByRole("table", { name: "Labours" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(4);
    const [dhuresh, meena, murugan, ravi] = rows;
    if (dhuresh == null || meena == null || murugan == null || ravi == null)
      throw new Error("Rows missing");
    await expect(within(dhuresh).getByText("₹700.00 / day")).toBeVisible();
    await expect(within(dhuresh).getByText("₹2,450.00")).toBeVisible();
    await expect(within(meena).getByText("₹18,000.00 / month")).toBeVisible();
    await expect(within(meena).getByText("Villa Phase 2")).toBeVisible();
    await expect(within(murugan).getByText("Inactive")).toBeVisible();
    // Many Projects read as a count; none as a dash (ADR CM-0033).
    await expect(within(dhuresh).getByText("Tower A")).toBeVisible();
    await expect(within(murugan).getByText("3 Projects")).toHaveAttribute(
      "title",
      "Tower A, Villa Phase 2, Mall Block C",
    );
    await expect(
      within(table).getByRole("columnheader", { name: "Projects" }),
    ).toBeVisible();
    await expect(within(ravi).getAllByText("—").length).toBeGreaterThan(0);

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Dhuresh Nawin" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Transfer history" }),
    );
    const history = await body.findByRole("list", { name: "Transfers" });
    const items = within(history).getAllByRole("listitem");
    await expect(items[0]).toHaveTextContent("Left Tower A");
    await expect(items[1]).toHaveTextContent("Villa Phase 2");
    await expect(items[1]).toHaveTextContent("Slab work");
    await expect(items[2]).toHaveTextContent("Joined Villa Phase 2");
  },
};

export const WithoutFinancial: Story = {
  beforeEach: serve([withoutAmounts(DHURESH), withoutAmounts(MEENA)]),
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Labours" });
    await expect(
      within(table).queryByRole("columnheader", { name: "Balance" }),
    ).toBeNull();
    await expect(within(table).getByText("Daily")).toBeVisible();
    await expect(within(table).getByText("Monthly")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Labours yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Labour" }).at(-1),
    ).toHaveAttribute("href", "/app/masters/labours/new");
    await expect(
      canvas.getByRole("button", { name: "Import from Excel" }),
    ).toBeVisible();
  },
};

export const Filters: Story = {
  beforeEach: serve([DHURESH]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("table", { name: "Labours" });

    await userEvent.click(canvas.getByRole("combobox", { name: "Project" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Villa Phase 2" }),
    );
    await waitFor(() =>
      expect(
        listUrls().some((url) => url.includes(`projectId=${VILLA.id}`)),
      ).toBe(true),
    );

    await userEvent.click(
      within(canvas.getByRole("tablist", { name: "Status" })).getByRole("tab", {
        name: /^Inactive/,
      }),
    );
    await waitFor(() =>
      expect(listUrls().some((url) => url.includes("active=false"))).toBe(true),
    );

    await userEvent.type(canvas.getByLabelText("Search Labours"), "dhuresh");
    await waitFor(() =>
      expect(listUrls().some((url) => url.includes("q=dhuresh"))).toBe(true),
    );
    await expect(
      canvas.getByRole("link", { name: "Export" }).getAttribute("href"),
    ).toContain(`projectId=${VILLA.id}`);
  },
};

export const TransferSelected: Story = {
  beforeEach: serve([DHURESH, MEENA]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("table", { name: "Labours" });
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Dhuresh Nawin" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Meena Selvi" }),
    );
    await expect(canvas.getByText(/2 selected/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Transfer selected" }),
    );
    const dialog = await body.findByRole("dialog", {
      name: "Transfer 2 Labours",
    });
    // Tower A and Villa Phase 2: nothing they can both move from.
    const inDialog = within(dialog);
    await userEvent.click(inDialog.getByRole("button", { name: "Transfer" }));
    await expect(
      await inDialog.findByText(/These Labours share no Project/),
    ).toBeVisible();
    await expect(posts()).toBe(0);
  },
};

/** With the list filtered to a Project, a transfer moves them from it. */
export const TransferFromFilteredProject: Story = {
  beforeEach: serve([MURUGAN]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("table", { name: "Labours" });
    await userEvent.click(canvas.getByRole("combobox", { name: "Project" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Villa Phase 2" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Mohan Raj" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Transfer" }),
    );
    const dialog = await body.findByRole("dialog", {
      name: "Transfer Mohan Raj",
    });
    const inDialog = within(dialog);
    await expect(
      inDialog.getByRole("combobox", { name: "From Project" }),
    ).toHaveTextContent("Villa Phase 2");
    // Mohan is on every Project, so none is left to move to.
    await userEvent.click(
      inDialog.getByRole("combobox", { name: "To Project" }),
    );
    await expect(body.queryByRole("option", { name: "Tower A" })).toBeNull();
  },
};
