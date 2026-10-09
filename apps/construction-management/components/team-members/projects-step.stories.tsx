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
const KUMARI = "0199c4a0-0000-7000-8000-000000000001";
const ASARIPALLAM = "0199c4a0-0000-7000-8000-000000000002";

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
      { id: ASARIPALLAM, name: "Asaripallam Tower", status: "ongoing" },
      { id: KUMARI, name: "Kumari Heights", status: "on_hold" },
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
      await canvas.findByRole("checkbox", { name: /Kumari Heights/ }),
    );
    await expect(canvas.getByText("1 Project selected")).toBeVisible();
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(KUMARI);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Asaripallam Tower/ }),
    );
    // In the list's order.
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(
      `${ASARIPALLAM},${KUMARI}`,
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Kumari Heights/ }),
    );
    await expect(canvas.getByLabelText("Chosen")).toHaveTextContent(
      ASARIPALLAM,
    );
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
        <TeamMemberProjectsTab
          member={teamMember({ projectIds: [ASARIPALLAM] })}
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("checkbox", { name: /Asaripallam Tower/ }),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Kumari Heights/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Projects" }),
    );
    await expect(await canvas.findByText("Projects saved.")).toBeVisible();
    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        projectIds: [ASARIPALLAM, KUMARI],
      }),
    );
  },
};
