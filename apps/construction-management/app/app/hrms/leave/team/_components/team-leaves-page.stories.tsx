import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  CASUAL_ID,
  PRIYA,
  RAVI,
  serveLeave,
  storyLeave,
  storyOptions,
  type LeaveApiState,
} from "./leave-story-support";
import { TeamLeavesPage } from "./team-leaves-page";

let api: ReturnType<typeof serveLeave>;

const LEAVES = [
  storyLeave({ status: "approved", canDecide: false }),
  storyLeave({
    id: "0199c6a5-0000-7000-8000-0000000000c2",
    memberId: RAVI,
    memberName: "Ravi Kumar",
    fromDate: "2026-11-09",
    toDate: "2026-11-09",
    totalDays: 0.5,
    days: [{ date: "2026-11-09", session: "morning" }],
    canDecide: false,
  }),
];

function serve(state: LeaveApiState = {}) {
  return () => {
    api = serveLeave({
      options: storyOptions({ viewTeam: true, report: true }),
      teamLeaves: LEAVES,
      report: {
        from: "2026-11-01",
        to: "2026-11-30",
        rows: [
          {
            memberId: PRIYA,
            memberName: "Priya Raman",
            byType: [
              {
                leaveTypeId: CASUAL_ID,
                leaveTypeName: "Casual Leave",
                days: 2,
              },
            ],
            paidDays: 2,
            unpaidDays: 0,
            pendingDays: 0,
          },
          {
            memberId: RAVI,
            memberName: "Ravi Kumar",
            byType: [],
            paidDays: 0,
            unpaidDays: 0,
            pendingDays: 0.5,
          },
        ],
      },
      ...state,
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Leave/Team Leaves",
  component: TeamLeavesPage,
  render: () => (
    <StoryQueries>
      <TeamLeavesPage today="2026-11-10" />
    </StoryQueries>
  ),
} satisfies Meta<typeof TeamLeavesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsWhoIsAwayEachDay: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const days = await canvas.findByRole("list", { name: "Leave by day" });
    await expect(within(days).getByText("Fri, 6 Nov")).toBeVisible();
    const monday = within(days).getByText("Mon, 9 Nov").closest("li");
    if (monday == null) throw new Error("no Monday row");
    await expect(within(monday).getByText("Priya Raman")).toBeVisible();
    await expect(within(monday).getByText("Ravi Kumar")).toBeVisible();
    await expect(
      within(monday).getByText("Casual Leave · Morning"),
    ).toBeVisible();
  },
};

export const MovesBetweenMonths: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("November 2026")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(await canvas.findByText("December 2026")).toBeVisible();
    await waitFor(() =>
      expect(
        api.calls.some((call) =>
          call.path.includes("/leaves/team?from=2026-12-01&to=2026-12-31"),
        ),
      ).toBe(true),
    );
  },
};

export const ShowsTheReport: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("tab", { name: "Report" }));
    const report = await canvas.findByRole("list", {
      name: "Team leave report",
    });
    await expect(
      within(report).getByText("2 days paid · 0 days unpaid"),
    ).toBeVisible();
    await expect(within(report).getByText("0.5 days pending")).toBeVisible();
  },
};

export const NobodyOnLeave: Story = {
  beforeEach: serve({ teamLeaves: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nobody is on leave")).toBeVisible();
  },
};

export const NotShared: Story = {
  beforeEach: serve({ options: storyOptions() }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Team leave is not shared with you"),
    ).toBeVisible();
  },
};
