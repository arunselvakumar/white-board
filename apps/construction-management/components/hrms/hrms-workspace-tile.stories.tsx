import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { HrmsDashboardModel } from "@/src/queries/hrms-dashboard";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { MEMBER_DASHBOARD, OWNER_DASHBOARD } from "./dashboard-fixtures";
import { HrmsWorkspaceTile } from "./hrms-workspace-tile";

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
  title: "HRMS/Workspace tile",
  component: HrmsWorkspaceTile,
  render: () => (
    <StoryQueries>
      <div role="list" className="max-w-md">
        <div role="listitem" className="flex">
          <HrmsWorkspaceTile />
        </div>
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof HrmsWorkspaceTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TeamNumbers: Story = {
  beforeEach: serve(OWNER_DASHBOARD),
  play: async ({ canvas }) => {
    const today = await canvas.findByLabelText("HRMS today");
    await expect(today).toHaveTextContent("Present today8 of 12");
    await expect(today).toHaveTextContent("On leave1");
    await expect(today).toHaveTextContent("Pending approvals4");
    await expect(canvas.getByRole("link", { name: /HRMS/ })).toHaveAttribute(
      "href",
      "/app/workspace/hrms",
    );
  },
};

export const OwnDayOnly: Story = {
  beforeEach: serve(MEMBER_DASHBOARD),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Not checked in")).toBeVisible();
    const today = canvas.getByLabelText("HRMS today");
    await expect(within(today).getAllByRole("definition")).toHaveLength(1);
  },
};

export const WithoutHrmsAccess: Story = {
  beforeEach: serve(null),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: /HRMS/ }),
    ).toBeVisible();
    // The request fails quietly: the plain tile, no numbers.
    await waitFor(async () => {
      await expect(canvas.queryByLabelText("HRMS today")).toBeNull();
    });
  },
};
