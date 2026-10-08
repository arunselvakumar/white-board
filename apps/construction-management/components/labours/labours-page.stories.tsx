import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import {
  CATEGORY_LIST,
  MOHAN,
  PROJECT_OPTIONS,
  RAJU,
  SEEMA,
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

function serve(items: (typeof RAJU)[]) {
  return () => {
    api = mockFetch([
      ...LOOKUPS,
      { path: LABOURS, respond: () => Response.json(listOf(items)) },
      {
        path: `${LABOURS}/${RAJU.id}/transfers`,
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a1b2-0000-7000-8000-00000000e001",
                fromProject: null,
                toProject: VILLA,
                transferDate: "2026-09-01",
                remark: null,
                createdAt: RAJU.createdAt,
              },
              {
                id: "0199a1b2-0000-7000-8000-00000000e002",
                fromProject: VILLA,
                toProject: TOWER,
                transferDate: "2026-10-04",
                remark: "Slab work",
                createdAt: RAJU.createdAt,
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
  beforeEach: serve([RAJU, SEEMA, MOHAN]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const table = await canvas.findByRole("table", { name: "Labours" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(3);
    const [raju, seema, mohan] = rows;
    if (raju == null || seema == null || mohan == null)
      throw new Error("Rows missing");
    await expect(within(raju).getByText("₹700.00 / day")).toBeVisible();
    await expect(within(raju).getByText("₹2,450.00")).toBeVisible();
    await expect(within(seema).getByText("₹18,000.00 / month")).toBeVisible();
    await expect(within(seema).getByText("Villa Phase 2")).toBeVisible();
    await expect(within(mohan).getByText("Inactive")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Raju Pawar" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Transfer history" }),
    );
    const history = await body.findByRole("list", { name: "Transfers" });
    const items = within(history).getAllByRole("listitem");
    await expect(items[0]).toHaveTextContent("Villa Phase 2");
    await expect(items[0]).toHaveTextContent("Slab work");
    await expect(items[1]).toHaveTextContent("Joined Villa Phase 2");
  },
};

export const WithoutFinancial: Story = {
  beforeEach: serve([withoutAmounts(RAJU), withoutAmounts(SEEMA)]),
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
    await expect(await canvas.findByText("No labourers yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Labour" }).at(-1),
    ).toHaveAttribute("href", "/app/masters/labours/new");
    await expect(
      canvas.getByRole("button", { name: "Import from Excel" }),
    ).toBeVisible();
  },
};

export const Filters: Story = {
  beforeEach: serve([RAJU]),
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
      within(canvas.getByRole("group", { name: "Status" })).getByRole(
        "button",
        {
          name: "Inactive",
        },
      ),
    );
    await waitFor(() =>
      expect(listUrls().some((url) => url.includes("active=false"))).toBe(true),
    );

    await userEvent.type(canvas.getByLabelText("Search Labours"), "raju");
    await waitFor(() =>
      expect(listUrls().some((url) => url.includes("q=raju"))).toBe(true),
    );
    await expect(
      canvas.getByRole("link", { name: "Export" }).getAttribute("href"),
    ).toContain(`projectId=${VILLA.id}`);
  },
};

export const TransferSelected: Story = {
  beforeEach: serve([RAJU, SEEMA]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("table", { name: "Labours" });
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Raju Pawar" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Seema Kale" }),
    );
    await expect(canvas.getByText(/2 selected/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Transfer selected" }),
    );
    const dialog = await body.findByRole("dialog", {
      name: "Transfer 2 labourers",
    });
    await expect(dialog).toHaveTextContent("From 2 Projects");
  },
};
