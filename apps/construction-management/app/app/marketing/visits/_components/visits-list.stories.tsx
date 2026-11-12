import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  KAVERI_ID,
  MARKETING_VISITS_API,
  MISSED_ID,
  RAVI_MEMBER_ID,
  mockVisitApi,
  type VisitApiOptions,
} from "./visit-fixtures";
import { VisitsList } from "./visits-list";

let api: ReturnType<typeof mockVisitApi>;

function listCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" &&
        call.path.startsWith(`${MARKETING_VISITS_API}?`),
    );
}

function serve(options: VisitApiOptions = {}) {
  return () => {
    api = mockVisitApi(options);
    return api.restore;
  };
}

const BASE = "/app/marketing/visits";

const meta = {
  title: "Marketing/Visits/List",
  component: VisitsList,
  args: { canCreate: true },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <VisitsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VisitsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The rows of whichever layout shows: the table, or cards on a phone. */
function rows(root: HTMLElement) {
  const canvas = within(root);
  const layout =
    canvas.queryByRole("table", { name: "Visits" }) ??
    canvas.getByRole("list", { name: "Visits" });
  return within(layout)
    .getAllByRole(layout.tagName === "TABLE" ? "row" : "listitem")
    .filter((row) => within(row).queryAllByRole("link").length > 0);
}

/**
 * A table at desktop width; story tests run at phone width, where the same
 * rows are cards, so the play checks whichever layout shows. Missed stands
 * out; a company the viewer cannot open is plain text.
 */
export const WithData: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText("4 Visits");
    const [planned, completed, missed, cancelled] = rows(canvasElement);
    if (
      planned == null ||
      completed == null ||
      missed == null ||
      cancelled == null
    )
      throw new Error("four Visits");
    await expect(
      within(missed).getByRole("link", { name: "MV-0002" }),
    ).toHaveAttribute("href", `${BASE}/${MISSED_ID}`);
    await expect(within(missed).getByText("Missed")).toBeVisible();
    await expect(
      within(missed).getByRole("link", { name: "Kaveri Cement Works" }),
    ).toHaveAttribute("href", `/app/marketing/companies/${KAVERI_ID}`);
    await expect(missed).toHaveTextContent("8 Nov 2026, 10:00 am");
    await expect(missed).toHaveTextContent("Murugan P");

    await expect(completed).toHaveTextContent("Ravi Shankar, Priya Raman");
    await expect(completed).toHaveTextContent("Requirement discussion");
    await expect(within(completed).getByText("Hot")).toBeVisible();
    await expect(within(completed).getByText("Completed")).toBeVisible();

    await expect(cancelled).toHaveTextContent("Coimbatore Textiles Ltd");
    await expect(
      within(cancelled).queryByRole("link", {
        name: "Coimbatore Textiles Ltd",
      }),
    ).toBeNull();

    await expect(
      canvas.getByRole("link", { name: "Plan Visit" }),
    ).toHaveAttribute("href", `${BASE}/new?status=planned`);
    await expect(
      canvas.getByRole("link", { name: "Log Visit" }),
    ).toHaveAttribute("href", `${BASE}/new?status=completed`);
  },
};

/** At phone width each Visit is a card. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Visits" }));
    const cards = list.getAllByRole("listitem");
    await expect(cards).toHaveLength(4);
    const missed = cards[2];
    if (missed == null) throw new Error("four Visits");
    await expect(within(missed).getByText("Missed")).toBeVisible();
    await expect(
      within(missed).getByText("8 Nov 2026, 10:00 am · Introduction"),
    ).toBeVisible();
    await expect(
      within(missed).getByText("By Ravi Shankar · Met Murugan P"),
    ).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();
  },
};

/** Status (Missed), Marketing Person and dates go to the server. */
export const Filtered: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText("4 Visits");
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await body.findByRole("option", { name: "Missed" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("status=missed"),
    );
    await expect(await canvas.findByText("1 Visit")).toBeVisible();

    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Completed" }),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("status=missed%2Ccompleted"),
    );
    await expect(await canvas.findByText("2 Visits")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Marketing Person" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain(`memberId=${RAVI_MEMBER_ID}`),
    );

    await userEvent.type(canvas.getByLabelText("From"), "2026-11-09");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("from=2026-11-09"),
    );
    await expect(await canvas.findByText("1 Visit")).toBeVisible();
  },
};

/** No Visits yet: what the page is for, and both ways to add one. */
export const Empty: Story = {
  beforeEach: serve({ visits: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Visits yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Plan Visit" }),
    ).toHaveLength(2);
    await expect(
      canvas.getAllByRole("link", { name: "Log Visit" }),
    ).toHaveLength(2);
  },
};

/** A filter that matches nothing says so, without the add buttons again. */
export const NoMatch: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText("4 Visits");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Interest" }));
    await userEvent.click(await body.findByRole("option", { name: "Cold" }));
    await userEvent.keyboard("{Escape}");
    await expect(await canvas.findByText("No Visits match")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Plan Visit" }),
    ).toHaveLength(1);
  },
};

/** A Role that only reads Visits: no add buttons, no person or company filter. */
export const ReadOnly: Story = {
  args: { canCreate: false },
  play: async ({ canvas }) => {
    await canvas.findByText("4 Visits");
    await expect(canvas.queryByRole("link", { name: "Plan Visit" })).toBeNull();
    // Visits read is enough for the person and company filters.
    await expect(
      await canvas.findByRole("combobox", { name: "Marketing Person" }),
    ).toBeVisible();
  },
};
