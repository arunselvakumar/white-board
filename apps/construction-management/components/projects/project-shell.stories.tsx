import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";
import type { ProjectHome } from "@/src/queries/project-home";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI, STORY_LOGO_URL } from "./project-fixtures";
import { storyHome } from "./project-home-fixtures";
import { ProjectOverview } from "./project-overview";
import { ProjectShell } from "./project-shell";

const BASE = "/api/construction/projects/projects";
const PATH = `/app/projects/${KUMARI.id}`;

let api: ReturnType<typeof mockApi>;

function serve(
  home: ProjectHome | null = storyHome(),
  subject = KUMARI,
): () => () => void {
  return () => {
    let current = home;
    api = mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${subject.id}`)
        return Response.json(subject);
      if (method === "GET" && path === `${BASE}/${subject.id}/home`)
        return current == null ? undefined : Response.json(current);
      if (method === "POST" && path === `${BASE}/${subject.id}/pin`) {
        if (current != null) current = { ...current, pinned: true };
        return Response.json({ pinned: true });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Projects/ProjectShell",
  component: ProjectShell,
  args: { id: KUMARI.id, children: null },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: () => (
    <StoryQueries>
      <ProjectShell id={KUMARI.id}>
        <ProjectOverview id={KUMARI.id} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectShell>;

export default meta;
type Story = StoryObj<typeof meta>;

async function sectionLinks(canvas: {
  findByRole: (
    role: "navigation",
    options: { name: string },
  ) => Promise<HTMLElement>;
}) {
  const nav = await canvas.findByRole("navigation", {
    name: "Project sections",
  });
  return within(nav);
}

export const Home: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${PATH}/edit`,
    );
    const tabs = await sectionLinks(canvas);
    const links = tabs.getAllByRole("link");
    await expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Dashboard",
      "Wings",
      "Amenities",
      "Drawings",
      "Testing Reports",
      "Gallery",
      "Documents",
      "Resources",
      "Attendance",
      "Payments",
      "Reports",
    ]);
    await expect(links[2]).toHaveAttribute("href", `${PATH}/wings`);
    await expect(links[5]).toHaveAttribute("href", `${PATH}/testing-reports`);
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("1 Apr 2026")).toBeVisible();
    await expect(
      details.getByText("Plot 12, Survey No. 45, Vadasery, Nagercoil 629001"),
    ).toBeVisible();
  },
};

export const MemberSections: Story = {
  beforeEach: serve(
    storyHome({
      keys: ["documents", "attendance", "payments"],
      canHideModules: false,
    }),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const tabs = await sectionLinks(canvas);
    await waitFor(() =>
      expect(tabs.getAllByRole("link").map((link) => link.textContent)).toEqual(
        ["Home", "Documents", "Attendance", "Payments"],
      ),
    );
    // Without the Update flag the options offer no Hide / show modules.
    await userEvent.click(
      canvas.getByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("menuitem", { name: "Arrange tiles" }),
    ).toBeVisible();
    await expect(
      body.queryByRole("menuitem", { name: "Hide / show modules" }),
    ).toBeNull();
  },
};

export const HiddenModulesLeaveTheBar: Story = {
  beforeEach: serve(storyHome({ hidden: ["gallery", "reports"] })),
  play: async ({ canvas }) => {
    const tabs = await sectionLinks(canvas);
    await waitFor(() =>
      expect(tabs.queryByRole("link", { name: "Gallery" })).toBeNull(),
    );
    await expect(tabs.queryByRole("link", { name: "Reports" })).toBeNull();
    await expect(
      await canvas.findByText(/2 modules are hidden on this Project/),
    ).toBeVisible();
  },
};

export const AttendanceSection: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/attendance/labour` } },
  },
  render: () => (
    <StoryQueries>
      <ProjectShell id={KUMARI.id}>
        <PagePlaceholder
          title="Attendance"
          description="Mark labour and vendor attendance for this Project."
        />
      </ProjectShell>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    const tabs = await sectionLinks(canvas);
    await waitFor(() =>
      expect(tabs.getByRole("link", { name: "Attendance" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    await expect(tabs.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  },
};

export const EditBelongsToHome: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/edit` } },
  },
  play: async ({ canvas }) => {
    const tabs = await sectionLinks(canvas);
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

export const PinFromOptions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Pin to top" }),
    );
    await expect(await canvas.findByText("Pinned")).toBeVisible();
    await expect(
      api.calls.mock.calls.some(
        ([call]) => call.method === "POST" && call.path.endsWith("/pin"),
      ),
    ).toBe(true);
  },
};

export const WithoutHomeFallsBack: Story = {
  beforeEach: serve(null),
  play: async ({ canvas }) => {
    const tabs = await sectionLinks(canvas);
    // The home could not load: every module of the structure, no options.
    await expect(tabs.getByRole("link", { name: "Wings" })).toBeVisible();
    await expect(tabs.queryByRole("link", { name: "Locations" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Project options" }),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    const nav = await canvas.findByRole("navigation", {
      name: "Project sections",
    });
    // The section bar scrolls sideways; the page does not.
    await expect(getComputedStyle(nav).overflowX).toBe("auto");
    await expect(
      within(nav).getByRole("link", { name: "Reports" }),
    ).toBeInTheDocument();
    await canvas.findByRole("list", { name: "Modules" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

export const WithLogoAndType: Story = {
  beforeEach() {
    const mock = mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${KUMARI.id}`)
        return Response.json({ ...KUMARI, logoUrl: STORY_LOGO_URL });
      if (method === "GET" && path === `${BASE}/${KUMARI.id}/home`)
        return Response.json(storyHome());
      return undefined;
    });
    return mock.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    const heading = await canvas.findByRole("heading", {
      level: 1,
      name: "Kumari Heights",
    });
    const header = heading.closest("header");
    if (header == null) throw new Error("The title is not in a header");
    await expect(await within(header).findByText("Residential")).toBeVisible();
    await expect(
      header.querySelector("[data-slot=avatar-image]"),
    ).toHaveAttribute("src", STORY_LOGO_URL);
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("Project Type")).toBeVisible();
    await expect(details.getByText("₹4,20,00,000")).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

export const WithoutLogo: Story = {
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole("heading", {
      level: 1,
      name: "Kumari Heights",
    });
    await expect(
      heading.closest("header")?.querySelector("[data-slot=avatar]"),
    ).toBeNull();
  },
};
