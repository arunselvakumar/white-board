import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  CALENDAR_VISITS,
  CHECKED_IN_ID,
  MARKETING_VISITS_API,
  MISSED_ID,
  NOW,
  mockVisitApi,
  toListItem,
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
    api = mockVisitApi({ visits: CALENDAR_VISITS, ...options });
    return api.restore;
  };
}

const BASE = "/app/marketing/visits";

const meta = {
  title: "Marketing/Visits/Calendar",
  component: VisitsList,
  args: { canCreate: true, now: NOW },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: BASE } },
    searchParams: "view=calendar",
  },
  render: (args) => (
    <StoryQueries>
      <VisitsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VisitsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The chosen day's list under the month. */
function agenda(root: HTMLElement, day: string) {
  return within(within(root).getByRole("list", { name: `Visits on ${day}` }));
}

/**
 * November, Monday first, reading 26 Oct to 6 Dec in one call of up to 500.
 * Today is chosen: its two Visits, one checked in. Picking 8 November
 * shows its Missed Visit; Next and Today move the month.
 */
export const Month: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "November 2026" }),
    ).toBeVisible();
    await expect(listCalls().at(-1)?.path).toContain(
      "limit=500&from=2026-10-26&to=2026-12-06",
    );
    const grid = within(canvas.getByRole("list", { name: "November 2026" }));
    await expect(
      grid.getByRole("button", { name: "Thursday, 12 November, 2 Visits" }),
    ).toHaveAttribute("aria-pressed", "true");

    const today = agenda(canvasElement, "Thursday, 12 November");
    const [first, second] = today.getAllByRole("listitem");
    if (first == null || second == null) throw new Error("two Visits today");
    await expect(first).toHaveTextContent("12:30 pm");
    await expect(first).toHaveTextContent("MV-0007");
    await expect(within(first).getByText("Checked in")).toBeVisible();
    await expect(second).toHaveTextContent("3:00 pm");
    await expect(second).toHaveTextContent("MV-0006");

    await userEvent.click(
      grid.getByRole("button", { name: "Sunday, 8 November, 1 Visit" }),
    );
    const sunday = agenda(canvasElement, "Sunday, 8 November");
    await expect(sunday.getByRole("link", { name: "MV-0002" })).toHaveAttribute(
      "href",
      `${BASE}/${MISSED_ID}`,
    );
    await expect(sunday.getByText("Missed")).toBeVisible();
    await expect(sunday.getByText("Kaveri Cement Works")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(
      await canvas.findByRole("heading", { name: "December 2026" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toContain(
        "from=2026-11-30&to=2027-01-03",
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    await expect(
      await canvas.findByRole("heading", { name: "November 2026" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Today" })).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Thursday, 12 November, 2 Visits" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

/**
 * From the list to the calendar's week, Monday to Sunday: today's Visits,
 * the previous week's Missed one, and the status filter sent with the
 * week's dates; From and To leave with the list.
 */
export const Week: Story = {
  parameters: { searchParams: "" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText("6 Visits");
    await userEvent.click(canvas.getByRole("button", { name: "Calendar" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Week" }));
    await expect(
      await canvas.findByRole("heading", { name: "9 Nov – 15 Nov 2026" }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("From")).toBeNull();

    const week = within(
      canvas.getByRole("list", { name: "9 Nov – 15 Nov 2026" }),
    );
    const thursday = within(
      week.getByRole("listitem", { name: "Thursday, 12 November" }),
    );
    await expect(thursday.getByText("Today")).toBeVisible();
    const checkedIn = thursday.getByRole("link", { name: /MV-0007/ });
    await expect(checkedIn).toHaveAttribute("href", `${BASE}/${CHECKED_IN_ID}`);
    await expect(checkedIn).toHaveTextContent("Checked in");
    await expect(thursday.getByRole("link", { name: /MV-0006/ })).toBeVisible();
    await expect(
      week.getByRole("listitem", { name: "Monday, 9 November" }),
    ).toHaveTextContent("No Visits");

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous week" }),
    );
    const previous = within(
      await canvas.findByRole("list", { name: "2 Nov – 8 Nov 2026" }),
    );
    const sunday = previous.getByRole("listitem", {
      name: "Sunday, 8 November",
    });
    await expect(sunday).toHaveTextContent("Missed");
    await expect(
      previous.getByRole("listitem", { name: "Friday, 6 November" }),
    ).toHaveTextContent("MV-0001");

    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await body.findByRole("option", { name: "Missed" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(listCalls().at(-1)?.path).toBe(
        `${MARKETING_VISITS_API}?limit=500&from=2026-11-02&to=2026-11-08&status=missed`,
      ),
    );
    await waitFor(() =>
      expect(
        previous.getByRole("listitem", { name: "Friday, 6 November" }),
      ).toHaveTextContent("No Visits"),
    );
    await expect(
      previous.getByRole("listitem", { name: "Sunday, 8 November" }),
    ).toHaveTextContent("MV-0002");
  },
};

/**
 * On a phone the month is a grid of days with a dot per Visit (no names);
 * the chosen day's Visits are listed under it.
 */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(
      await canvas.findByRole("list", { name: "November 2026" }),
    );
    await expect(grid.queryAllByRole("link")).toHaveLength(0);
    await userEvent.click(
      grid.getByRole("button", { name: "Tuesday, 10 November, 1 Visit" }),
    );
    const tuesday = agenda(canvasElement, "Tuesday, 10 November");
    await expect(tuesday.getByRole("link", { name: "MV-0003" })).toBeVisible();
    await expect(tuesday.getByText("Completed")).toBeVisible();
    await userEvent.click(
      grid.getByRole("button", { name: "Wednesday, 11 November, no Visits" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: /^Wednesday, 11 November/ }),
    ).toHaveTextContent("Wednesday, 11 November · no Visits");
  },
};

/** More than 500 Visits in the days shown: the calendar says some are missing. */
export const TooMany: Story = {
  beforeEach: serve({
    extra: (call) =>
      call.method === "GET" && call.path.startsWith(`${MARKETING_VISITS_API}?`)
        ? Response.json({
            items: CALENDAR_VISITS.map(toListItem),
            nextCursor: "more",
            total: 640,
            timeZone: "Asia/Kolkata",
          })
        : undefined,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("note")).toHaveTextContent(
      "Showing 6 of 640 Visits in these days. Narrow the filters to see the rest.",
    );
  },
};

/**
 * With Visits export, Export in the calendar takes the days on screen,
 * not the list's From and To, and follows the calendar as it moves.
 */
export const Export: Story = {
  args: { canExport: true },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "November 2026" });
    await waitFor(() =>
      expect(canvas.getByRole("link", { name: "Export" })).toHaveAttribute(
        "href",
        `${MARKETING_VISITS_API}/export?from=2026-10-26&to=2026-12-06`,
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Week" }));
    await canvas.findByRole("heading", { name: "9 Nov – 15 Nov 2026" });
    await waitFor(() =>
      expect(canvas.getByRole("link", { name: "Export" })).toHaveAttribute(
        "href",
        `${MARKETING_VISITS_API}/export?from=2026-11-09&to=2026-11-15`,
      ),
    );
  },
};
