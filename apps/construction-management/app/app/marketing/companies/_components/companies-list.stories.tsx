import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import { CompaniesList } from "./companies-list";
import {
  BALAJI_ID,
  MARKETING_COMPANIES_API,
  NEEDS_REASSIGNING,
  RAVI_MEMBER_ID,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";

let api: ReturnType<typeof mockCompanyApi>;

function listCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" &&
        call.path.startsWith(`${MARKETING_COMPANIES_API}?`),
    );
}

function serve(options: CompanyApiOptions = {}) {
  return () => {
    api = mockCompanyApi(options);
    return api.restore;
  };
}

const BASE = "/app/marketing/companies";

const meta = {
  title: "Marketing/Prospect Companies/List",
  component: CompaniesList,
  args: { canCreate: true },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <CompaniesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CompaniesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A table at desktop width: name, city, Stage, Marketing Person, Primary
 * Contact. Story tests run at phone width, where the same rows are cards,
 * so the play checks whichever layout shows.
 */
export const WithData: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas }) => {
    await canvas.findByText("4 Prospect Companies");
    const layout =
      canvas.queryByRole("table", { name: "Prospect Companies" }) ??
      canvas.getByRole("list", { name: "Prospect Companies" });
    const rows = within(layout)
      .getAllByRole(layout.tagName === "TABLE" ? "row" : "listitem")
      .filter((row) => within(row).queryByRole("link") != null);
    await expect(rows).toHaveLength(4);
    const balaji = rows[3];
    if (balaji == null) throw new Error("four companies");
    await expect(
      within(balaji).getByRole("link", { name: "Sri Balaji Infra Projects" }),
    ).toHaveAttribute("href", `${BASE}/${BALAJI_ID}`);
    await expect(within(balaji).getByText("Quotation sent")).toBeVisible();
    await expect(balaji).toHaveTextContent("Ravi Shankar");
    await expect(balaji).toHaveTextContent("Senthil Kumar");
    await expect(balaji).toHaveTextContent("+91 98450 12345");
    await expect(balaji).toHaveTextContent("10 Nov 2026");
    await expect(rows[0]).toHaveTextContent("—");
    await expect(within(layout).getByText("Lost")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Prospect Company" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** At phone width each company is a card. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Prospect Companies" }),
    );
    const cards = list.getAllByRole("listitem");
    await expect(cards).toHaveLength(4);
    const balaji = cards[3];
    if (balaji == null) throw new Error("four companies");
    await expect(
      within(balaji).getByRole("link", { name: "Sri Balaji Infra Projects" }),
    ).toBeVisible();
    await expect(within(balaji).getByText("Quotation sent")).toBeVisible();
    await expect(
      within(balaji).getByText("Chennai · Ravi Shankar"),
    ).toBeVisible();
    await expect(within(balaji).getByText(/\+91 98450 12345/)).toBeVisible();
    await expect(
      within(balaji).getByText("Last visit: 10 Nov 2026"),
    ).toBeVisible();
    await expect(balaji).toHaveTextContent(/Next follow-up: 12 Nov 2026/);
    await expect(canvas.queryByRole("table")).toBeNull();
  },
};

/** Search, Stages (several), Marketing Person and industry go to the server. */
export const Filtered: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText("4 Prospect Companies");
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox", { name: "Stage" }));
    await userEvent.click(await body.findByRole("option", { name: "Won" }));
    await userEvent.click(await body.findByRole("option", { name: "Lost" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain("stage=won%2Clost"),
    );
    await expect(await canvas.findByText("2 Prospect Companies")).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Stage" }),
    ).toHaveTextContent("2 Stages");

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Assigned to" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain(
        `assignedMemberId=${RAVI_MEMBER_ID}`,
      ),
    );
    await expect(await canvas.findByText("1 Prospect Company")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Search"), "nothing like it");
    await expect(
      await canvas.findByText("No Prospect Companies match"),
    ).toBeVisible();
    await expect(listCalls().at(-1)?.path).toContain("search=nothing");
    await expect(
      canvas.getAllByRole("link", { name: "Add Prospect Company" }),
    ).toHaveLength(1);
  },
};

/** A search finds a company by its Contact's mobile. */
export const SearchByMobile: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("4 Prospect Companies");
    await userEvent.type(canvas.getByLabelText("Search"), "94430");
    await expect(await canvas.findByText("1 Prospect Company")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Kaveri Cement Works" }).length,
    ).toBeGreaterThan(0);
  },
};

/** Fifty at a time: Load more brings the next page. */
export const LoadMore: Story = {
  beforeEach: serve({ pageSize: 2 }),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("Showing 2 of 4 Prospect Companies"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(await canvas.findByText("4 Prospect Companies")).toBeVisible();
    await expect(listCalls().at(-1)?.path).toContain("after=2");
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

/** A failed Load more says so, and the button tries again. */
export const LoadMoreFailed: Story = {
  beforeEach: () => {
    let failures = 0;
    api = mockCompanyApi({
      pageSize: 2,
      extra: (call) => {
        if (
          call.method !== "GET" ||
          !call.path.includes("after=2") ||
          failures > 0
        )
          return undefined;
        failures += 1;
        return Response.json(
          { code: "INTERNAL", message: "Something went wrong." },
          { status: 500 },
        );
      },
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("Showing 2 of 4 Prospect Companies");
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(
      await canvas.findByText("Couldn't load more. Please try again."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Showing 2 of 4 Prospect Companies"),
    ).toBeVisible();
    const retry = canvas.getByRole("button", { name: "Load more" });
    await expect(retry).toBeEnabled();
    await userEvent.click(retry);
    await expect(await canvas.findByText("4 Prospect Companies")).toBeVisible();
    await expect(
      canvas.queryByText("Couldn't load more. Please try again."),
    ).toBeNull();
  },
};

/** No companies yet: what the list is for, and Add Prospect Company. */
export const Empty: Story = {
  beforeEach: serve({ companies: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Prospect Companies yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Prospect Company" }),
    ).toHaveLength(2);
  },
};

/** A Role without Companies create sees no Add, even on the empty list. */
export const EmptyReadOnly: Story = {
  args: { canCreate: false },
  beforeEach: serve({ companies: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Prospect Companies yet"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Add Prospect Company" }),
    ).toBeNull();
  },
};

/**
 * The Next follow-up column (a line on each phone card): each company's
 * earliest open Follow-up, red when it is before today in the Company
 * time zone. Story tests run at phone width, so the play checks whichever
 * layout shows.
 */
export const NextFollowUps: Story = {
  args: { now: new Date("2026-11-12T06:30:00.000Z") },
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas }) => {
    await canvas.findByText("4 Prospect Companies");
    const table = canvas.queryByRole("table", { name: "Prospect Companies" });
    if (table != null)
      await expect(
        within(table).getByRole("columnheader", { name: "Next follow-up" }),
      ).toBeVisible();
    const layout =
      table ?? canvas.getByRole("list", { name: "Prospect Companies" });
    const [textiles, kaveri, steel, balaji] = within(layout)
      .getAllByRole(table == null ? "listitem" : "row")
      .filter((row) => within(row).queryAllByRole("link").length > 0);
    if (textiles == null || kaveri == null || steel == null || balaji == null)
      throw new Error("four companies");
    await expect(within(kaveri).getByText("9 Nov 2026")).toHaveClass(
      "text-red-700",
    );
    await expect(kaveri).toHaveTextContent("9 Nov 2026 (overdue)");
    await expect(textiles).toHaveTextContent("10 Nov 2026 (overdue)");
    await expect(steel).not.toHaveTextContent("(overdue)");
    await expect(within(balaji).getByText("12 Nov 2026")).not.toHaveClass(
      "text-red-700",
    );
    await expect(balaji).not.toHaveTextContent("(overdue)");
  },
};

/**
 * With Companies transfer, a notice counts the companies and open
 * Follow-ups of people who left, linking to their list.
 */
export const NeedsReassigningNotice: Story = {
  args: { canTransfer: true },
  beforeEach: serve({ needsReassigning: NEEDS_REASSIGNING }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: /3 need reassigning/ }),
    ).toHaveAttribute("href", `${BASE}/needs-reassigning`);
  },
};

/**
 * The notice's read fails: no notice, and the list still shows. It is
 * optional, so it never takes the page down with it.
 */
export const NoticeFailed: Story = {
  args: { canTransfer: true },
  beforeEach: serve({
    extra: (call) =>
      call.method === "GET" && call.path.endsWith("/needs-reassigning")
        ? Response.json(
            { code: "INTERNAL", message: "Something went wrong." },
            { status: 500 },
          )
        : undefined,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText("4 Prospect Companies");
    await waitFor(() =>
      expect(
        api.calls.mock.calls.some(([call]) =>
          call.path.endsWith("/needs-reassigning"),
        ),
      ).toBe(true),
    );
    await expect(
      canvas.queryByRole("link", { name: /need reassigning/ }),
    ).toBeNull();
    await expect(canvas.getByText("4 Prospect Companies")).toBeVisible();
  },
};

/** Nothing to reassign, or no transfer: no notice, and no read without it. */
export const NoNotice: Story = {
  args: { canTransfer: true },
  play: async ({ canvas }) => {
    await canvas.findByText("4 Prospect Companies");
    await waitFor(() =>
      expect(
        api.calls.mock.calls.some(([call]) =>
          call.path.endsWith("/needs-reassigning"),
        ),
      ).toBe(true),
    );
    await expect(
      canvas.queryByRole("link", { name: /need reassigning/ }),
    ).toBeNull();
  },
};

export const WithoutTransfer: Story = {
  beforeEach: serve({ needsReassigning: NEEDS_REASSIGNING }),
  play: async ({ canvas }) => {
    await canvas.findByText("4 Prospect Companies");
    await expect(
      canvas.queryByRole("link", { name: /need reassigning/ }),
    ).toBeNull();
    await expect(
      api.calls.mock.calls.some(([call]) =>
        call.path.endsWith("/needs-reassigning"),
      ),
    ).toBe(false);
  },
};
