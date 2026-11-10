import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { LeaveBalancesPage } from "./leave-balances-page";
import {
  COMP_OFF_ID,
  PRIYA,
  RAVI,
  serveLeave,
  storyOptions,
  nth,
  type LeaveApiState,
} from "./leave-story-support";

let api: ReturnType<typeof serveLeave>;

function serve(state: LeaveApiState = {}) {
  return () => {
    api = serveLeave({
      options: storyOptions({
        viewTeam: true,
        configure: true,
        manageBalances: true,
      }),
      ...state,
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Leave/Leave Balances",
  component: LeaveBalancesPage,
  render: () => (
    <StoryQueries>
      <LeaveBalancesPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof LeaveBalancesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsEachMembersBalances: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Team balances" });
    const cards = within(list).getAllByRole("listitem");
    await expect(cards).toHaveLength(3);
    const priya = within(nth(cards, 1));
    await expect(priya.getByText("Priya Raman")).toBeVisible();
    await expect(priya.getByText("9 days (1 day pending)")).toBeVisible();
    await expect(priya.getByText("1 day taken")).toBeVisible();
    await expect(
      within(nth(cards, 2)).getByText("Not initialised for 2026."),
    ).toBeVisible();
  },
};

export const AccruesNow: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Accrue now" }),
    );
    await expect(
      await canvas.findByText("Posted 6 monthly credits."),
    ).toBeVisible();
    await expect(api.posted("/leave-balances/accrue")).toEqual([
      { leaveYear: "2026" },
    ]);
  },
};

export const ShowsAccrualSwitchedOff: Story = {
  beforeEach: serve({
    write: (call) =>
      call.path === "/api/construction/hrms/leave-balances/accrue"
        ? Response.json(
            {
              code: "LEAVE_ACCRUAL_DISABLED",
              message:
                "Monthly leave credit is off. Turn on “Credit leave every month” in HRMS Settings first.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Accrue now" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Monthly leave credit is off",
    );
  },
};

export const InitialisesChosenMembers: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Initialise" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByRole("heading", { name: "Initialise balances for 2026" }),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Initialise" }));
    await expect(
      await dialog.findByText("Choose at least one Team Member"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Priya Raman/ }),
    );
    await userEvent.click(dialog.getByRole("checkbox", { name: /Ravi Kumar/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Initialise" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      canvas.getByText(
        "Opened 8 balances for 2 Team Members, 1 carried forward.",
      ),
    ).toBeVisible();
    await expect(api.posted("/leave-balances/initialize")).toEqual([
      { memberIds: [PRIYA, RAVI], leaveYear: "2026" },
    ]);
  },
};

export const CreditsCompOff: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const list = await canvas.findByRole("list", { name: "Team balances" });
    const priya = within(nth(within(list).getAllByRole("listitem"), 1));
    await userEvent.click(priya.getByRole("button", { name: "Adjust" }));
    const dialog = within(await body.findByRole("dialog"));
    // Compensatory Off and the member are chosen already.
    await expect(
      dialog.getByRole("combobox", { name: "Leave type" }),
    ).toHaveTextContent("Compensatory Off");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save adjustment" }),
    );
    await expect(
      await dialog.findByText("Say why the balance is adjusted"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Worked on Sunday 4 Oct",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save adjustment" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leave-balances/adjust")).toEqual([
      {
        memberId: PRIYA,
        leaveTypeId: COMP_OFF_ID,
        leaveYear: "2026",
        days: 1,
        reason: "Worked on Sunday 4 Oct",
      },
    ]);
    await expect(
      canvas.getByText("Credited 1 day of Compensatory Off for Priya Raman."),
    ).toBeVisible();
  },
};

export const ShowsCreditHistory: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const list = await canvas.findByRole("list", { name: "Team balances" });
    await userEvent.click(
      within(nth(within(list).getAllByRole("listitem"), 0)).getByRole(
        "button",
        { name: "History" },
      ),
    );
    const credits = await body.findByRole("list", { name: "Credits" });
    // The sheet slides in; wait until its rows are shown.
    await waitFor(() =>
      expect(
        within(credits).getByText(
          /Adjustment · 5 Oct 2026 · Worked on Sunday 4 Oct/,
        ),
      ).toBeVisible(),
    );
    await expect(within(credits).getByText("+12 days")).toBeVisible();
  },
};

export const ReadOnlyWithoutManageRights: Story = {
  beforeEach: serve({ options: storyOptions({ viewTeam: true }) }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("list", { name: "Team balances" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Accrue now" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Adjust" })).toBeNull();
  },
};

export const NotSharedWithoutViewAll: Story = {
  beforeEach: serve({ options: storyOptions() }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Team balances are not shared with you"),
    ).toBeVisible();
  },
};
