import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { ProjectsStep, TeamMemberProjectsTab } from "./projects-step";
import { teamMember } from "./team-member-fixtures";

const OPTIONS = "/api/construction/projects/projects/options";
const SHANTI = "0199c4a0-0000-7000-8000-000000000001";
const AUNDH = "0199c4a0-0000-7000-8000-000000000002";

let options: { id: string; name: string; status: string }[] = [];
let calls: ApiCall[] = [];

function Controlled() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <div className="space-y-3 p-6">
      <ProjectsStep value={value} onChange={setValue} />
      <output aria-label="Chosen">{value.join(",")}</output>
    </div>
  );
}

const meta = {
  title: "Masters/TeamMembers/ProjectsStep",
  component: ProjectsStep,
  beforeEach() {
    options = [
      { id: AUNDH, name: "Aundh Tower", status: "ongoing" },
      { id: SHANTI, name: "Shanti Heights", status: "on_hold" },
    ];
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === OPTIONS)
        return Response.json({ items: options });
      if (call.method === "POST" && call.path.endsWith("/projects"))
        return Response.json(
          teamMember({
            projectIds: (call.body as { projectIds: string[] }).projectIds,
          }),
        );
      return undefined;
    });
    return api.restore;
  },
  render: () => (
    <StoryQueries>
      <Controlled />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectsStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChoosesProjects: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Shanti Heights/ }),
    );
    await expect(canvas.getByText("1 Project selected")).toBeVisible();
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(SHANTI);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Aundh Tower/ }),
    );
    // In the list's order.
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(
      `${AUNDH},${SHANTI}`,
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Shanti Heights/ }),
    );
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(AUNDH);
  },
};

export const NoProjectsYet: Story = {
  beforeEach() {
    options = [];
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Projects yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add a Project" }),
    ).toHaveAttribute("href", "/app/projects/new");
  },
};

export const EditTabSaves: Story = {
  render: () => (
    <StoryQueries>
      <div className="p-6">
        <TeamMemberProjectsTab member={teamMember({ projectIds: [AUNDH] })} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("checkbox", { name: /Aundh Tower/ }),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Shanti Heights/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Projects" }),
    );
    await expect(await canvas.findByText("Projects saved.")).toBeVisible();
    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        projectIds: [AUNDH, SHANTI],
      }),
    );
  },
};
