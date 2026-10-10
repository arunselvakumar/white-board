import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  IDS,
  mockCentralStoreApi,
} from "@/components/procurement/stores/central-store-fixtures";

import { ProjectMaterialRequestsPage } from "./project-material-requests-page";

const meta = {
  title: "Procurement/Central Store/Project Material Requests",
  component: ProjectMaterialRequestsPage,
  args: { projectId: IDS.tower, canCreate: true },
  beforeEach: () => mockCentralStoreApi().restore,
  render: (args) => (
    <StoryQueries>
      <ProjectMaterialRequestsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectMaterialRequestsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Project's requests with their status; Raise request. */
export const Requests: Story = {
  play: async ({ canvas }) => {
    const link = await canvas.findByRole("link", { name: /MR\/26-27\/00007/ });
    await expect(link).toHaveAttribute(
      "href",
      `/app/projects/${IDS.tower}/materials/material-requests/${IDS.request}`,
    );
    await expect(link).toHaveTextContent("To Ambattur Central Store · 2 materials");
    await expect(canvas.getByText("Partially delivered")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Raise request" })).toBeVisible();
  },
};

/** No requests yet. */
export const Empty: Story = {
  beforeEach: () => mockCentralStoreApi({ requests: [] }).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Material Requests")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Raise request" })).toHaveAttribute(
      "href",
      `/app/projects/${IDS.tower}/materials/material-requests/new`,
    );
  },
};
