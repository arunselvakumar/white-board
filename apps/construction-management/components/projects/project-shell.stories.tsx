import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { SHANTI } from "./project-fixtures";
import { ProjectOverview } from "./project-overview";
import { ProjectShell } from "./project-shell";

const BASE = "/api/construction/projects/projects";
const PATH = `/app/projects/${SHANTI.id}`;

const meta = {
  title: "Projects/ProjectShell",
  component: ProjectShell,
  args: { id: SHANTI.id, children: null },
  beforeEach() {
    const api = mockApi((call) =>
      call.method === "GET" && call.path === `${BASE}/${SHANTI.id}`
        ? Response.json(SHANTI)
        : undefined,
    );
    return api.restore;
  },
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: () => (
    <StoryQueries>
      <ProjectShell id={SHANTI.id}>
        <ProjectOverview id={SHANTI.id} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Shanti Heights" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${PATH}/edit`,
    );
    const tabs = within(
      canvas.getByRole("navigation", { name: "Project sections" }),
    );
    const links = tabs.getAllByRole("link");
    await expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Attendance",
      "Payments",
      "Reports",
    ]);
    await expect(links.map((link) => link.getAttribute("href"))).toEqual([
      PATH,
      `${PATH}/attendance`,
      `${PATH}/payments`,
      `${PATH}/reports`,
    ]);
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("1 Apr 2026")).toBeVisible();
    await expect(details.getByText("31 Mar 2027")).toBeVisible();
    await expect(
      details.getByText("Plot 12, Survey No. 45, Baner, Pune 411045"),
    ).toBeVisible();
  },
};

export const AttendanceTab: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/attendance` } },
  },
  render: () => (
    <StoryQueries>
      <ProjectShell id={SHANTI.id}>
        <PagePlaceholder
          title="Attendance"
          description="Mark labour and vendor attendance for this Project. Arrives with CM-211."
        />
      </ProjectShell>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    const tabs = within(
      await canvas.findByRole("navigation", { name: "Project sections" }),
    );
    await expect(
      tabs.getByRole("link", { name: "Attendance" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      tabs.getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
    await expect(canvas.getByText(/Arrives with CM-211/)).toBeVisible();
  },
};

export const EditBelongsToOverview: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/edit` } },
  },
  play: async ({ canvas }) => {
    const tabs = within(
      await canvas.findByRole("navigation", { name: "Project sections" }),
    );
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas }) => {
    const nav = await canvas.findByRole("navigation", {
      name: "Project sections",
    });
    // The tab strip scrolls sideways instead of wrapping.
    await expect(getComputedStyle(nav).overflowX).toBe("auto");
    await expect(
      within(nav).getByRole("link", { name: "Reports" }),
    ).toBeInTheDocument();
  },
};
