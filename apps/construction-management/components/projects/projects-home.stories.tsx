import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { projectList, STORY_PROJECTS } from "./project-fixtures";
import { ProjectsHome } from "./projects-home";

const BASE = "/api/construction/projects/projects";

let items = STORY_PROJECTS;

const meta = {
  title: "Projects/ProjectsHome",
  component: ProjectsHome,
  beforeEach() {
    items = STORY_PROJECTS;
    const api = mockApi((call) =>
      call.method === "GET" && call.path === BASE
        ? Response.json(projectList(items))
        : undefined,
    );
    return api.restore;
  },
  render: () => (
    <StoryQueries>
      <ProjectsHome />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectsHome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithProjects: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Projects" }),
    ).toBeVisible();
    const cards = within(canvas.getByRole("list", { name: "Projects" }));
    await expect(cards.getAllByRole("link")).toHaveLength(5);
    const shanti = cards.getByRole("link", { name: /Shanti Heights/ });
    await expect(shanti).toHaveAttribute(
      "href",
      "/app/projects/0199c4a0-0000-7000-8000-000000000001",
    );
    await expect(shanti).toHaveTextContent("1 Apr 2026 – 31 Mar 2027");
    await expect(shanti).toHaveTextContent("Baner, Pune 411045");
    await expect(
      cards.getByRole("link", { name: /Baner Plots/ }),
    ).toHaveTextContent("No address or dates yet.");
    await expect(
      canvas.getByRole("link", { name: "New Project" }),
    ).toHaveAttribute("href", "/app/projects/new");
    await expect(canvas.getByRole("button", { name: "All 5" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const FiltersByStatus: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Projects" });
    await expect(
      canvas.getByRole("button", { name: "Ongoing 2" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "On hold 1" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Completed 1" }));
    const cards = within(canvas.getByRole("list", { name: "Projects" }));
    await expect(cards.getAllByRole("link")).toHaveLength(1);
    await expect(cards.getByRole("link")).toHaveTextContent("Zen Villas");

    await userEvent.click(canvas.getByRole("button", { name: "Ongoing 2" }));
    await expect(
      within(canvas.getByRole("list", { name: "Projects" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining("Aundh Tower"),
      expect.stringContaining("Shanti Heights"),
    ]);
  },
};

export const FilterWithNoMatch: Story = {
  beforeEach() {
    items = STORY_PROJECTS.filter((item) => item.status !== "on_hold");
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Projects" });
    await userEvent.click(canvas.getByRole("button", { name: "On hold 0" }));
    await expect(
      await canvas.findByText("No Projects are on hold."),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach() {
    items = [];
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Projects yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add your first Project" }),
    ).toHaveAttribute("href", "/app/projects/new");
    await expect(canvas.queryByRole("button", { name: /^All/ })).toBeNull();
  },
};
