import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import {
  OWNER_MEMBER_ID,
  RAVI_MEMBER_ID,
} from "@/app/app/marketing/companies/_components/company-fixtures";

import { TeamPage } from "./team-page";
import {
  MARKETING_ROLE_ID,
  MARKETING_TEAM_API,
  mockTeamApi,
  team,
  type TeamApiOptions,
} from "./team-fixtures";

let api: ReturnType<typeof mockTeamApi>;

function serve(options: TeamApiOptions = {}) {
  return () => {
    api = mockTeamApi(options);
    return api.restore;
  };
}

function targets(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Marketing/Team",
  component: TeamPage,
  args: { timeZone: "Asia/Kolkata" },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/marketing/team" } },
  },
  render: (args) => (
    <StoryQueries>
      <TeamPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TeamPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The table at desktop width, the cards on a phone: one row per person. */
async function rowOf(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  await canvas.findByText("Visits completed in Nov 2026");
  const layout =
    canvas.queryByRole("table", { name: "Marketing People" }) ??
    canvas.getByRole("list", { name: "Marketing People" });
  const rows = within(layout).getAllByRole(
    layout.tagName === "TABLE" ? "row" : "listitem",
  );
  const row = rows.find((item) => within(item).queryByText(name) != null);
  if (row == null) throw new Error(`No row for ${name}`);
  return row;
}

/**
 * Visits against target with a bar, Follow-ups overdue in red, the Owner
 * marked, and each row's links to that person's Visits and Follow-ups.
 */
export const Targets: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement }) => {
    const ravi = await rowOf(canvasElement, "Ravi Shankar");
    await expect(ravi).toHaveTextContent("12 / 20");
    await expect(
      within(ravi).getByRole("progressbar", {
        name: "Ravi Shankar: 12 of 20 Visits",
      }),
    ).toHaveAttribute("aria-valuenow", "60");
    await expect(within(ravi).getByText("2")).toHaveClass("text-red-700");
    await expect(ravi).toHaveTextContent("11 Nov 2026");
    await expect(
      within(ravi).getByRole("link", { name: "Visits of Ravi Shankar" }),
    ).toHaveAttribute(
      "href",
      `/app/marketing/visits?memberId=${RAVI_MEMBER_ID}`,
    );
    await expect(
      within(ravi).getByRole("link", { name: "Follow-ups of Ravi Shankar" }),
    ).toHaveAttribute(
      "href",
      `/app/marketing/follow-ups?owner=${RAVI_MEMBER_ID}`,
    );

    // Past the target, the bar stops full; nothing overdue is not red.
    const priya = await rowOf(canvasElement, "Priya Raman");
    await expect(priya).toHaveTextContent("22 / 20");
    await expect(within(priya).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    await expect(within(priya).getByText("0")).not.toHaveClass("text-red-700");
    // The last Visit is a day in the Company time zone.
    await expect(priya).toHaveTextContent("13 Nov 2026");

    const owner = await rowOf(canvasElement, "Arun Selva Kumar");
    await expect(within(owner).getByText("Owner")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Marketing Person" }),
    ).toHaveAttribute(
      "href",
      `/app/staff/office-staff/new?roleId=${MARKETING_ROLE_ID}`,
    );
  },
};

/** Without a target, only the count shows, and no bar. */
export const NoTarget: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvasElement }) => {
    const owner = await rowOf(canvasElement, "Arun Selva Kumar");
    await expect(owner).not.toHaveTextContent("/");
    await expect(within(owner).getByText("3")).toBeVisible();
    await expect(within(owner).queryByRole("progressbar")).toBeNull();
  },
};

/** A person who left stays on the list, marked Inactive, without a mobile. */
export const InactivePerson: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvasElement }) => {
    const mani = await rowOf(canvasElement, "Mani Kandan");
    await expect(within(mani).getByText("Inactive")).toBeVisible();
    await expect(mani).toHaveTextContent("0 / 15");
    await expect(within(mani).getByText("1")).toHaveClass("text-red-700");
    await expect(within(mani).getAllByText("—").length).toBeGreaterThan(0);
    const ravi = await rowOf(canvasElement, "Ravi Shankar");
    await expect(within(ravi).getByText("Active")).toBeVisible();
  },
};

/** At phone width each person is a card with the same figures and links. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Marketing People" }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(4);
    const ravi = list.getAllByRole("listitem")[2];
    if (ravi == null) throw new Error("Ravi's card");
    await expect(ravi).toHaveTextContent("12 / 20");
    await expect(ravi).toHaveTextContent("+91 98400 00002");
    await expect(
      within(ravi).getByRole("button", { name: "Set target for Ravi Shankar" }),
    ).toBeVisible();
  },
};

/**
 * Set target: a whole number or empty; it says it applies from this month,
 * and the row shows the new target.
 */
export const SetTarget: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Set target for Arun Selva Kumar",
      }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Visit target for Arun Selva Kumar",
      }),
    );
    await expect(
      dialog.getByText(/applies from Nov 2026 on; earlier months keep theirs/),
    ).toBeVisible();
    const field = dialog.getByLabelText("Visits a month");
    await expect(field).toHaveValue("");

    await userEvent.type(field, "2.5");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(/Enter a whole number of Visits from 0 to 1000/),
    ).toBeVisible();
    await expect(targets()).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.type(field, "10");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(targets()).toHaveLength(1));
    await expect(targets()[0]).toEqual({
      method: "POST",
      path: `${MARKETING_TEAM_API}/${OWNER_MEMBER_ID}/target`,
      body: { target: 10 },
    });
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    const list = within(canvas.getByRole("list", { name: "Marketing People" }));
    await expect(list.getAllByRole("listitem")[0]).toHaveTextContent("3 / 10");
  },
};

/** Emptying the box clears the target. */
export const ClearTarget: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Set target for Ravi Shankar",
      }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const field = dialog.getByLabelText("Visits a month");
    await expect(field).toHaveValue("20");
    await userEvent.clear(field);
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(targets()).toHaveLength(1));
    await expect(targets()[0]?.body).toEqual({ target: null });
  },
};

/** Without Team update or Add Staff: no Set target, no Add Marketing Person. */
export const ReadOnly: Story = {
  beforeEach: serve({
    team: team({
      canSetTargets: false,
      canAddPerson: false,
      addPersonRoleId: null,
    }),
  }),
  play: async ({ canvas }) => {
    await canvas.findByText("Visits completed in Nov 2026");
    await expect(
      canvas.queryByRole("button", { name: /^Set target/ }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Add Marketing Person" }),
    ).toBeNull();
  },
};

/** Add Marketing Person without a Marketing Role opens Add Staff plainly. */
export const NoMarketingRole: Story = {
  beforeEach: serve({ team: team({ addPersonRoleId: null }) }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Add Marketing Person" }),
    ).toHaveAttribute("href", "/app/staff/office-staff/new");
  },
};

/** No Marketing People yet. */
export const Empty: Story = {
  beforeEach: serve({ team: team({ people: [] }) }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Marketing People yet"),
    ).toBeVisible();
  },
};
