import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { HrmsDashboardModel } from "@/src/queries/hrms-dashboard";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  EMPTY_DASHBOARD,
  MEMBER_DASHBOARD,
  OWNER_DASHBOARD,
} from "./dashboard-fixtures";
import { HrmsDashboardPage } from "./hrms-dashboard-page";

const DASHBOARD = "/api/construction/hrms/dashboard";

function serve(body: HrmsDashboardModel | null) {
  return () => {
    const api = mockApi((call) =>
      call.method === "GET" && call.path === DASHBOARD
        ? body == null
          ? Response.json(
              { code: "PERMISSION_DENIED", message: "No access." },
              { status: 403 },
            )
          : Response.json(body)
        : undefined,
    );
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Dashboard",
  component: HrmsDashboardPage,
  parameters: { layout: "fullscreen" },
  render: () => (
    <StoryQueries>
      <HrmsDashboardPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof HrmsDashboardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TeamToday: Story = {
  beforeEach: serve(OWNER_DASHBOARD),
  play: async ({ canvas }) => {
    const snapshot = await canvas.findByRole("region", {
      name: "Today's snapshot",
    });
    const present = within(snapshot).getByRole("link", {
      name: /Present today/,
    });
    await expect(present).toHaveTextContent("8");
    await expect(present).toHaveTextContent("2 late");
    await expect(present).toHaveAttribute(
      "href",
      "/app/workspace/hrms/attendance/team",
    );
    await expect(
      within(snapshot).getByRole("link", { name: /Pending approvals/ }),
    ).toHaveTextContent("4");

    const breakdown = canvas.getByRole("region", {
      name: "Present / absent today",
    });
    await expect(breakdown).toHaveTextContent("Absent or not checked in3");

    const trend = canvas.getByRole("region", {
      name: "Day-wise trend, last 14 days",
    });
    await expect(within(trend).getAllByRole("row")).toHaveLength(15);
    await expect(
      within(trend).getByText("Sat, 10 Oct: 8 present, 3 absent, 1 on leave"),
    ).toBeVisible();

    const waiting = canvas.getByRole("list", {
      name: "Waiting for your decision",
    });
    const items = within(waiting).getAllByRole("link");
    await expect(items).toHaveLength(4);
    await expect(items[0]).toHaveTextContent("Divya Lakshmi · Missed checkout");
    await expect(items[0]).toHaveAttribute(
      "href",
      "/app/workspace/hrms/attendance/approvals",
    );
    await expect(items[1]).toHaveAttribute(
      "href",
      "/app/workspace/hrms/leave/approvals",
    );

    const leave = canvas.getByRole("list", { name: "Upcoming leave" });
    await expect(within(leave).getAllByRole("listitem")).toHaveLength(3);
    await expect(leave).toHaveTextContent("Pending");
    await expect(
      canvas.getByRole("list", { name: "Upcoming holidays" }),
    ).toHaveTextContent("Optional");
    await expect(canvas.getByText(/Checked in at 9:05/)).toBeVisible();

    const actions = canvas.getByRole("navigation", { name: "Quick actions" });
    await expect(
      within(actions).getByRole("link", { name: "Check out" }),
    ).toHaveAttribute("href", "/app/workspace/hrms/attendance/my");
    await expect(
      within(actions).getByRole("link", { name: "Apply leave" }),
    ).toHaveAttribute("href", "/app/workspace/hrms/leave/my");
    const approvals = within(actions).getByRole("link", { name: /Approvals/ });
    await expect(approvals).toHaveTextContent("4");
    await expect(approvals).toHaveAttribute(
      "href",
      "/app/workspace/hrms/attendance/approvals",
    );
  },
};

export const MemberWithoutViewAll: Story = {
  beforeEach: serve(MEMBER_DASHBOARD),
  play: async ({ canvas }) => {
    const day = await canvas.findByRole("region", { name: "Your day" });
    await expect(day).toHaveTextContent("Not checked in yet");
    await expect(
      within(day).getByRole("list", { name: "Leave balance" }),
    ).toHaveTextContent("Casual Leave9 days of 12");
    const mine = within(day).getAllByRole("link", {
      name: /Back-dated day|Casual Leave/,
    });
    await expect(mine).toHaveLength(2);
    await expect(mine[0]).toHaveAttribute(
      "href",
      "/app/workspace/hrms/attendance/my",
    );
    await expect(mine[1]).toHaveAttribute(
      "href",
      "/app/workspace/hrms/leave/my",
    );
    await expect(canvas.queryByText("Today's snapshot")).toBeNull();
    await expect(canvas.queryByText("Pending approvals")).toBeNull();
    const actions = canvas.getByRole("navigation", { name: "Quick actions" });
    await expect(within(actions).getAllByRole("link")).toHaveLength(2);
    await expect(
      within(actions).getByRole("link", { name: "Check in" }),
    ).toBeVisible();
  },
};

export const NoTeamMembersYet: Story = {
  beforeEach: serve(EMPTY_DASHBOARD),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Team Members yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Team Members" }),
    ).toHaveAttribute("href", "/app/masters/team-members");
    await expect(
      canvas.getByRole("link", { name: "Configuration" }),
    ).toHaveAttribute("href", "/app/workspace/hrms/configuration");
    await expect(
      canvas.getByText("Nothing is waiting for your decision."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Nobody is on leave in the next 14 days."),
    ).toBeVisible();
    await expect(canvas.getByText(/No holidays coming up/)).toBeVisible();
    await expect(canvas.getByText("No leave balances yet.")).toBeVisible();
  },
};

export const WithoutAccess: Story = {
  beforeEach: serve(null),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You don't have access to the HRMS Dashboard"),
    ).toBeVisible();
  },
};
