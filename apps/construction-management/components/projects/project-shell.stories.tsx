import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

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

export const Home: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${PATH}/edit`,
    );
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("1 Apr 2026")).toBeVisible();
    await expect(
      details.getByText("Plot 12, Survey No. 45, Vadasery, Nagercoil 629001"),
    ).toBeVisible();
  },
};

export const OptionsWithoutUpdateFlag: Story = {
  beforeEach: serve(
    storyHome({
      keys: ["documents", "attendance", "payments"],
      canHideModules: false,
    }),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Without the Update flag the options offer no Hide / show modules.
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
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

export const HiddenModulesNote: Story = {
  beforeEach: serve(storyHome({ hidden: ["gallery", "reports"] })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/2 modules are hidden on this Project/),
    ).toBeVisible();
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
    // The home could not load: no options (the sidebar falls back, see ProjectNavMenu).
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await expect(
      canvas.queryByRole("button", { name: "Project options" }),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    // The slim header wraps; the page never scrolls sideways.
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
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
