import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "@/.storybook/mocks/api";
import {
  BALAJI_VISIT_ID,
  RAVI_MEMBER_ID,
  STEEL_ID,
} from "@/app/app/marketing/companies/_components/company-fixtures";

import { MarketingDashboard } from "./marketing-dashboard";
import {
  CHECKED_IN_VISIT_ID,
  MARKETING_DASHBOARD_API,
  mockDashboardApi,
  noFollowUpsDashboard,
  ownDashboard,
} from "./marketing-dashboard-fixtures";
import { MarketingDashboardSkeleton } from "./marketing-dashboard-skeletons";

let api: ReturnType<typeof mockDashboardApi>;

function serve(answer?: Parameters<typeof mockDashboardApi>[0]) {
  return () => {
    api = mockDashboardApi(answer);
    return api.restore;
  };
}

/** The Dashboard reads asked for, as paths with their query. */
function reads(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET")
    .map((call) => call.path);
}

const meta = {
  title: "Marketing/Dashboard",
  component: MarketingDashboard,
  args: { timeZone: "Asia/Kolkata" },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/marketing" } },
  },
  render: (args) => (
    <StoryQueries>
      <MarketingDashboard {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MarketingDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

async function totals(canvasElement: HTMLElement) {
  return within(
    await within(canvasElement).findByRole("list", { name: "Totals" }),
  );
}

/** A total's card: its label and figure. */
async function card(canvasElement: HTMLElement, label: string) {
  const list = await totals(canvasElement);
  const item = list
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText(label) != null);
  if (item == null) throw new Error(`No card for ${label}`);
  return item;
}

async function choose(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  field: string,
  option: string,
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("combobox", { name: field }));
  await userEvent.click(await body.findByRole("option", { name: option }));
}

/**
 * The Owner sees the team this month: seven totals, Missed and Overdue in
 * red, the people's Visits against target, Stages with Won against Lost,
 * recent activity and Hot companies with no Follow-up. Last month asks for
 * it and shows October's zeros.
 */
export const Team: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText(/The team's figures · 1 Nov – 30 Nov 2026/);
    await expect(
      canvas.getByRole("heading", { name: "Marketing Dashboard", level: 1 }),
    ).toBeVisible();
    await expect(
      (await totals(canvasElement)).getAllByRole("listitem"),
    ).toHaveLength(7);
    await expect(
      within(await card(canvasElement, "Visits missed")).getByText("3"),
    ).toHaveClass("text-destructive");
    await expect(
      within(await card(canvasElement, "Visits completed")).getByText("37"),
    ).not.toHaveClass("text-destructive");
    // The team has no Follow-ups address, so the cards are not links.
    await expect(
      canvas.queryByRole("link", { name: "Follow-ups overdue" }),
    ).toBeNull();

    const people = within(
      canvas.getByRole("table", { name: "Visits per Marketing Person" }),
    );
    await expect(people.getByText("(inactive)")).toBeVisible();
    await expect(
      people.getByRole("progressbar", {
        name: "Ravi Shankar: 12 of 20 Visits",
      }),
    ).toHaveAttribute("aria-valuenow", "60");
    await expect(
      canvas.getByText("Won 1 · Lost 2 in this period"),
    ).toBeVisible();
    const stages = within(
      canvas.getByRole("list", { name: "Companies by Stage" }),
    );
    await expect(stages.getAllByRole("listitem")[0]).toHaveTextContent("New9");

    await expect(
      canvas.getByRole("link", { name: "Completed MV-0040" }),
    ).toHaveAttribute("href", `/app/marketing/visits/${BALAJI_VISIT_ID}`);
    const hot = within(
      canvas.getByRole("list", { name: "Hot companies with no Follow-up" }),
    );
    await expect(
      hot.getByRole("link", { name: "Madurai Steel Structures" }),
    ).toHaveAttribute("href", `/app/marketing/companies/${STEEL_ID}`);
    // The last Visit is a day in the Company time zone.
    await expect(hot.getByText("Last Visit 12 Nov")).toBeVisible();
    await expect(
      canvas.getByRole("table", { name: "Visits over time" }),
    ).toHaveTextContent("9 Nov112");

    await expect(reads()).toEqual([
      `${MARKETING_DASHBOARD_API}?period=this_month`,
    ]);
    await choose(canvasElement, userEvent, "Period", "Last month");
    await waitFor(() =>
      expect(reads().at(-1)).toBe(
        `${MARKETING_DASHBOARD_API}?period=last_month`,
      ),
    );
    await canvas.findByText(/The team's figures · 1 Oct – 31 Oct 2026/);
    await expect(
      within(await card(canvasElement, "Visits missed")).getByText("0"),
    ).not.toHaveClass("text-destructive");
  },
};

/**
 * A member's own figures: no person to pick and no per-person table;
 * Follow-ups cards open the Follow-ups list; today's Visits and Follow-ups
 * are links.
 */
export const OwnFigures: Story = {
  beforeEach: serve(() => ownDashboard()),
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText(/Your figures · 1 Nov – 30 Nov 2026/);
    await expect(
      canvas.queryByRole("combobox", { name: "Marketing Person" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("table", { name: "Visits per Marketing Person" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Follow-ups due today" }),
    ).toHaveAttribute("href", "/app/marketing/follow-ups");
    await expect(
      canvas.getByRole("link", { name: "Follow-ups overdue" }),
    ).toHaveAttribute("href", "/app/marketing/follow-ups");
    await expect(
      within(await card(canvasElement, "Follow-ups overdue")).getByText("0"),
    ).not.toHaveClass("text-destructive");

    const visits = within(
      canvas.getByRole("list", { name: "My Visits today" }),
    );
    const first = visits.getAllByRole("link")[0];
    if (first == null) throw new Error("No Visit today");
    await expect(first).toHaveAttribute(
      "href",
      `/app/marketing/visits/${CHECKED_IN_VISIT_ID}`,
    );
    await expect(first).toHaveTextContent("10:00 am");
    await expect(first).toHaveTextContent("Sri Balaji Infra Projects");
    await expect(first).toHaveTextContent("Checked in");
    const followUps = within(
      canvas.getByRole("list", { name: "My Follow-ups due today" }),
    );
    await expect(followUps.getByRole("link")).toHaveTextContent(
      "CallCoimbatore Textiles Ltd",
    );
  },
};

/** The Owner picks Ravi: the read asks for him and the line names him. */
export const OnePerson: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText(/The team's figures/);
    await choose(canvasElement, userEvent, "Marketing Person", "Ravi Shankar");
    await waitFor(() =>
      expect(reads().at(-1)).toBe(
        `${MARKETING_DASHBOARD_API}?period=this_month&memberId=${RAVI_MEMBER_ID}`,
      ),
    );
    await canvas.findByText(/Ravi Shankar's figures · 1 Nov – 30 Nov 2026/);
    await expect(
      canvas.getByRole("link", { name: "Follow-ups overdue" }),
    ).toHaveAttribute(
      "href",
      `/app/marketing/follow-ups?owner=${RAVI_MEMBER_ID}`,
    );
    await expect(
      canvas.getByRole("combobox", { name: "Marketing Person" }),
    ).toHaveTextContent("Ravi Shankar");
  },
};

/** Opened from an address that names a person and a period. */
export const PersonFromAddress: Story = {
  parameters: { searchParams: `?memberId=${RAVI_MEMBER_ID}&period=this_week` },
  play: async ({ canvas }) => {
    await canvas.findByText(/Ravi Shankar's figures/);
    await expect(reads()).toEqual([
      `${MARKETING_DASHBOARD_API}?period=this_week&memberId=${RAVI_MEMBER_ID}`,
    ]);
    await expect(
      canvas.getByRole("combobox", { name: "Period" }),
    ).toHaveTextContent("This week");
  },
};

/** This week is drawn day by day. */
export const ThisWeek: Story = {
  parameters: { searchParams: "?period=this_week" },
  play: async ({ canvas }) => {
    await canvas.findByText(/9 Nov – 15 Nov 2026/);
    const table = canvas.getByRole("table", { name: "Visits over time" });
    await expect(table).toHaveTextContent("Mon 920");
    await expect(table).toHaveTextContent("Fri 1310");
    await expect(canvas.getByText("Per day")).toBeVisible();
  },
};

/**
 * Custom asks for the dates on screen; a From after To says so and asks
 * for nothing.
 */
export const Custom: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText(/The team's figures/);
    await choose(canvasElement, userEvent, "Period", "Custom");
    await waitFor(() =>
      expect(reads().at(-1)).toBe(
        `${MARKETING_DASHBOARD_API}?period=custom&from=2026-11-01&to=2026-11-30`,
      ),
    );
    const from = canvas.getByLabelText("From");
    await expect(from).toHaveValue("2026-11-01");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-12-05");
    await expect(
      await canvas.findByText("Choose a From date on or before the To date."),
    ).toBeVisible();
    await expect(reads().at(-1)).toBe(
      `${MARKETING_DASHBOARD_API}?period=custom&from=2026-11-01&to=2026-11-30`,
    );
  },
};

/**
 * A Role without Follow-ups read: no Follow-up totals, no Follow-ups due
 * today and no Hot companies list, rather than zeros.
 */
export const WithoutFollowUps: Story = {
  beforeEach: serve(() => noFollowUpsDashboard()),
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText(/Your figures/);
    const list = await totals(canvasElement);
    await expect(list.getAllByRole("listitem")).toHaveLength(5);
    await expect(list.queryByText("Follow-ups due today")).toBeNull();
    await expect(list.queryByText("Follow-ups overdue")).toBeNull();
    await expect(canvas.queryByText("My Follow-ups due")).toBeNull();
    await expect(
      canvas.queryByRole("heading", {
        name: "Hot companies with no Follow-up",
      }),
    ).toBeNull();
    await expect(
      canvas.getByRole("list", { name: "My Visits today" }),
    ).toBeVisible();
  },
};

/** A month with nothing in it: zeros and a quiet line per section. */
export const EmptyMonth: Story = {
  parameters: { searchParams: "?period=last_month" },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText(/1 Oct – 31 Oct 2026/);
    await expect(
      within(await card(canvasElement, "Visits completed")).getByText("0"),
    ).toBeVisible();
    await expect(canvas.getByText("No Visits for you today.")).toBeVisible();
    await expect(canvas.getByText("Nothing due today.")).toBeVisible();
    await expect(
      canvas.getByText("No Visits completed or missed in this period."),
    ).toBeVisible();
    await expect(canvas.getByText(/^Nothing yet\./)).toBeVisible();
    await expect(
      canvas.getByText("Every Hot company has a Follow-up."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Won 0 · Lost 0 in this period"),
    ).toBeVisible();
  },
};

/** At phone width everything stacks and the page never scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText(/The team's figures/);
    await expect(
      canvas.getByRole("combobox", { name: "Marketing Person" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("table", { name: "Visits per Marketing Person" }),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** The dark theme: the same figures on dark cards. */
export const Dark: Story = {
  globals: { theme: "dark", viewport: { value: "desktop" } },
  play: async ({ canvas }) => {
    await canvas.findByText(/The team's figures/);
    await expect(
      canvas.getByRole("heading", { name: "Visits over time" }),
    ).toBeVisible();
  },
};

/** While the figures load: the real labels and section titles. */
export const Loading: Story = {
  render: () => <MarketingDashboardSkeleton />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading the Marketing Dashboard",
    );
    await expect(canvas.getByText("Follow-ups overdue")).toBeVisible();
    await expect(canvas.getByText("Companies by Stage")).toBeVisible();
  },
};
