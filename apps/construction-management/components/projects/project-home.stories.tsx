import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ProjectHome } from "@/src/queries/project-home";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI } from "./project-fixtures";
import { storyHome } from "./project-home-fixtures";
import { ArrangeTilesDialog, HideModulesDialog } from "./project-home-dialogs";
import { ProjectOverview } from "./project-overview";

const BASE = "/api/construction/projects/projects";
const HOME = `${BASE}/${KUMARI.id}/home`;

let api: ReturnType<typeof mockApi>;

/** The Project, its home, and the two home preferences. */
function serve(home: ProjectHome = storyHome()) {
  return () => {
    let current = home;
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === `${BASE}/${KUMARI.id}`)
        return Response.json(KUMARI);
      if (method === "GET" && path === HOME) return Response.json(current);
      if (
        method === "POST" &&
        path === `${BASE}/${KUMARI.id}/hidden-modules/update`
      ) {
        const hidden = (body as { hiddenModules: string[] }).hiddenModules;
        current = {
          ...current,
          modules: current.modules.map((module) => ({
            ...module,
            hidden: hidden.includes(module.key),
          })),
        };
        return Response.json(current);
      }
      if (
        method === "POST" &&
        path === "/api/construction/projects/tile-order/update"
      )
        return Response.json(body);
      return undefined;
    });
    return api.restore;
  };
}

function posted(path: string): unknown {
  return api.calls.mock.calls.find(
    ([call]) => call.method === "POST" && call.path === path,
  )?.[0].body;
}

const meta = {
  title: "Projects/ProjectHome",
  component: ProjectOverview,
  args: { id: KUMARI.id },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <ProjectOverview {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tiles: Story = {
  beforeEach: serve(
    storyHome({ keys: ["reports", "documents", "dashboard", "wings"] }),
  ),
  play: async ({ canvas }) => {
    const tiles = within(await canvas.findByRole("list", { name: "Modules" }));
    const links = tiles.getAllByRole("link");
    // In the member's order, each with its label and a short description.
    await expect(
      links.map((link) => link.querySelector(".font-semibold")?.textContent),
    ).toEqual(["Reports", "Documents", "Dashboard", "Wings"]);
    await expect(links[0]).toHaveAttribute(
      "href",
      `/app/projects/${KUMARI.id}/reports`,
    );
    await expect(
      tiles.getByRole("link", { name: /Documents/ }),
    ).toHaveTextContent("Tender, Quotation, LOA, PO / WO and Agreement files.");
    // The Project's details stay on the home.
    await expect(canvas.getByRole("region", { name: "Details" })).toBeVisible();
  },
};

export const NoModules: Story = {
  beforeEach: serve(storyHome({ keys: [] })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No modules to open on this Project. Ask the Owner for access.",
      ),
    ).toBeVisible();
  },
};

export const HideModules: Story = {
  beforeEach: serve(storyHome({ hidden: ["reports"] })),
  render: () => (
    <StoryQueries>
      <HideModulesDialog projectId={KUMARI.id} onClose={() => undefined} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByRole("heading", { name: "Hide / show modules" }),
    ).toBeVisible();
    const reports = await dialog.findByRole("checkbox", { name: "Reports" });
    await expect(reports).not.toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "Gallery" }),
    ).toBeChecked();
    await userEvent.click(dialog.getByRole("checkbox", { name: "Gallery" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Reports" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${BASE}/${KUMARI.id}/hidden-modules/update`)).toEqual({
        hiddenModules: ["gallery"],
      }),
    );
  },
};

export const HideModulesNeedsUpdate: Story = {
  beforeEach: serve(storyHome({ canHideModules: false })),
  render: () => (
    <StoryQueries>
      <HideModulesDialog projectId={KUMARI.id} onClose={() => undefined} />
    </StoryQueries>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByText(/needs the Update permission on Projects/),
    ).toBeVisible();
    await expect(dialog.queryByRole("checkbox")).toBeNull();
  },
};

export const ArrangeTiles: Story = {
  beforeEach: serve(
    storyHome({ keys: ["dashboard", "drawings", "documents", "reports"] }),
  ),
  render: () => (
    <StoryQueries>
      <ArrangeTilesDialog projectId={KUMARI.id} onClose={() => undefined} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    const order = () =>
      within(dialog.getByRole("list", { name: "Tiles in order" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent);
    await dialog.findByRole("list", { name: "Tiles in order" });
    await expect(order()).toEqual([
      "Dashboard",
      "Drawings",
      "Documents",
      "Reports",
    ]);
    await expect(
      dialog.getByRole("button", { name: "Move Dashboard up" }),
    ).toBeDisabled();

    // Keyboard: the moved tile keeps the focus, so Enter moves it again.
    dialog.getByRole("button", { name: "Move Reports up" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await expect(order()).toEqual([
      "Dashboard",
      "Reports",
      "Drawings",
      "Documents",
    ]);
    await expect(
      dialog.getByRole("button", { name: "Move Reports up" }),
    ).toHaveFocus();
    await userEvent.click(
      dialog.getByRole("button", { name: "Move Dashboard down" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted("/api/construction/projects/tile-order/update")).toEqual({
        tileOrder: ["reports", "dashboard", "drawings", "documents"],
      }),
    );
  },
};

export const ArrangeTilesReset: Story = {
  beforeEach: serve(storyHome({ keys: ["reports", "documents", "dashboard"] })),
  render: () => (
    <StoryQueries>
      <ArrangeTilesDialog projectId={KUMARI.id} onClose={() => undefined} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await dialog.findByRole("list", { name: "Tiles in order" });
    await userEvent.click(
      dialog.getByRole("button", { name: "Reset to default" }),
    );
    await expect(
      within(dialog.getByRole("list", { name: "Tiles in order" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Dashboard", "Documents", "Reports"]);
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    // An empty order goes back to the default everywhere.
    await waitFor(() =>
      expect(posted("/api/construction/projects/tile-order/update")).toEqual({
        tileOrder: [],
      }),
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Modules" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
