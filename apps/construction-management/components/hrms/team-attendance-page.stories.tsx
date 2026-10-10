import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { HrmsTeamToday } from "@/src/queries/hrms-attendance";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { TEAM_TODAY } from "./attendance-fixtures";
import { TeamAttendancePage } from "./team-attendance-page";

const TEAM = "/api/construction/hrms/attendance/team-today";

function serve(body: HrmsTeamToday | null) {
  return () => {
    const api = mockApi((call) =>
      call.method === "GET" && call.path === TEAM
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
  title: "HRMS/Attendance/Team Today",
  component: TeamAttendancePage,
  render: () => (
    <StoryQueries>
      <TeamAttendancePage />
    </StoryQueries>
  ),
} satisfies Meta<typeof TeamAttendancePage>;

export default meta;
type Story = StoryObj<typeof meta>;

function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p.font-medium")?.textContent ?? "");
}

export const FiltersTheTeam: Story = {
  beforeEach: serve(TEAM_TODAY),
  play: async ({ canvas, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Team Members today",
    });
    await expect(names(list)).toHaveLength(5);
    await expect(canvas.getByText("3 of 5 checked in today")).toBeVisible();
    const row = within(list).getAllByRole("listitem")[1];
    await expect(row).toHaveTextContent("Late");
    await expect(row).toHaveTextContent("Outside fence");

    await userEvent.click(canvas.getByRole("button", { name: /Checked in 2/ }));
    await expect(names(canvas.getByRole("list"))).toEqual([
      "Prabhu Saravanan",
      "Meena Rajan",
    ]);
    await userEvent.click(
      canvas.getByRole("button", { name: /Not checked in 1/ }),
    );
    const missing = canvas.getByRole("list");
    await expect(names(missing)).toEqual(["Divya Lakshmi"]);
    await expect(missing).toHaveTextContent("Open from earlier");
    await userEvent.click(canvas.getByRole("button", { name: /Day off 0/ }));
    await expect(canvas.getByText("Nobody matches this filter.")).toBeVisible();
  },
};

export const NoTeamMembers: Story = {
  beforeEach: serve({
    ...TEAM_TODAY,
    items: [],
    counts: { ...TEAM_TODAY.counts, all: 0 },
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Team Members yet")).toBeVisible();
  },
};

export const WithoutViewAll: Story = {
  beforeEach: serve(null),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/^You don't have access to /),
    ).toBeVisible();
  },
};
