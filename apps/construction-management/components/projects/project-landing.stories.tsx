import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import type { ProjectHome } from "@/src/queries/project-home";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI } from "./project-fixtures";
import { storyHome } from "./project-home-fixtures";
import { ProjectLanding } from "./project-landing";

const BASE = "/api/construction/projects/projects";
const PATH = `/app/projects/${KUMARI.id}`;

function serve(home: ProjectHome = storyHome()) {
  return () =>
    mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${KUMARI.id}/home`)
        return Response.json(home);
      return undefined;
    }).restore;
}

const meta = {
  title: "Projects/ProjectLanding",
  component: ProjectLanding,
  args: { id: KUMARI.id },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <ProjectLanding {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a Project lands on Dashboard, the first module in the menu. */
export const LandsOnDashboard: Story = {
  play: async () => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(`${PATH}/dashboard`),
    );
  },
};

/** Dashboard hidden on the Project: the next module in the menu. */
export const DashboardHidden: Story = {
  beforeEach: serve(storyHome({ hidden: ["dashboard"] })),
  play: async () => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(`${PATH}/wings`),
    );
  },
};

/** Without Dashboard access: the menu's order, not the stored tile order. */
export const WithoutDashboard: Story = {
  beforeEach: serve(
    storyHome({ keys: ["reports", "documents", "attendance"] }),
  ),
  play: async () => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(`${PATH}/attendance`),
    );
  },
};

export const NoModules: Story = {
  beforeEach: serve(storyHome({ keys: [], canHideModules: false })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No modules to open")).toBeVisible();
    await expect(
      canvas.getByText(
        "Ask the Owner to grant you access to a module or show a hidden module on this Project.",
      ),
    ).toBeVisible();
    await expect(getRouter().replace).not.toHaveBeenCalled();
  },
};

/** Every module the member may open is hidden: they can show them again. */
export const EveryModuleHidden: Story = {
  beforeEach: serve(
    storyHome({
      keys: ["dashboard", "documents"],
      hidden: ["dashboard", "documents"],
    }),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Show them from Project options/),
    ).toBeVisible();
    await expect(getRouter().replace).not.toHaveBeenCalled();
  },
};
