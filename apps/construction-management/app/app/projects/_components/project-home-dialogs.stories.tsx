import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ProjectHome } from "@/src/queries/project-home";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI } from "./project-fixtures";
import { storyHome } from "./project-home-fixtures";
import { HideModulesDialog } from "./project-home-dialogs";

const BASE = "/api/construction/projects/projects";
const HOME = `${BASE}/${KUMARI.id}/home`;

let api: ReturnType<typeof mockApi>;

/** The Project's home (its modules) and Hide / show modules. */
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
  title: "Projects/HideModulesDialog",
  component: HideModulesDialog,
  args: { projectId: KUMARI.id, onClose: () => undefined },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <HideModulesDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof HideModulesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The modules in the sidebar menu's order, not a stored tile order. */
export const MenuOrder: Story = {
  beforeEach: serve(
    storyHome({ keys: ["reports", "documents", "attendance", "dashboard"] }),
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await dialog.findByRole("checkbox", { name: "Reports" });
    await expect(
      dialog
        .getAllByRole("checkbox")
        .map((box) => box.closest("label")?.textContent),
    ).toEqual(["Dashboard", "Attendance", "Documents", "Reports"]);
  },
};

export const HideModules: Story = {
  beforeEach: serve(storyHome({ hidden: ["reports"] })),
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
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByText(/needs the Update permission on Projects/),
    ).toBeVisible();
    await expect(dialog.queryByRole("checkbox")).toBeNull();
  },
};
