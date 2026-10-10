import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  projectList,
  STORY_LOGO_URL,
  STORY_PROJECTS,
} from "./project-fixtures";
import { ProjectsHome } from "./projects-home";

const BASE = "/api/construction/projects/projects";

let items = STORY_PROJECTS;
let pinned: string[] = [];
let api: ReturnType<typeof mockApi>;

const meta = {
  title: "Projects/ProjectsHome",
  component: ProjectsHome,
  beforeEach() {
    items = STORY_PROJECTS;
    pinned = [];
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === BASE)
        return Response.json(projectList(items, true, pinned));
      const [, id, verb] =
        /\/projects\/([^/]+)\/(pin|unpin)$/.exec(call.path) ?? [];
      if (call.method === "POST" && id != null) {
        pinned =
          verb === "pin"
            ? [...pinned.filter((item) => item !== id), id]
            : pinned.filter((item) => item !== id);
        return Response.json({ pinned: verb === "pin" });
      }
      return undefined;
    });
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
    const kumari = cards.getByRole("link", { name: /Kumari Heights/ });
    await expect(kumari).toHaveAttribute(
      "href",
      "/app/projects/0199c4a0-0000-7000-8000-000000000001",
    );
    await expect(kumari).toHaveTextContent("1 Apr 2026 – 31 Mar 2027");
    await expect(kumari).toHaveTextContent("Vadasery, Nagercoil 629001");
    await expect(
      cards.getByRole("link", { name: /Vadasery Plots/ }),
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
      expect.stringContaining("Asaripallam Tower"),
      expect.stringContaining("Kumari Heights"),
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

export const CardsWithAndWithoutLogo: Story = {
  play: async ({ canvas }) => {
    const cards = within(await canvas.findByRole("list", { name: "Projects" }));
    // A Project with a logo shows it…
    const asaripallam = cards.getByRole("link", { name: /Asaripallam Tower/ });
    await expect(asaripallam).toHaveTextContent("Commercial");
    const logo = await waitFor(() => {
      const image = asaripallam.querySelector("[data-slot=avatar-image]");
      if (image == null) throw new Error("The logo has not loaded yet");
      return image;
    });
    await expect(logo).toHaveAttribute("src", STORY_LOGO_URL);
    // …one without shows its initials.
    const kumari = cards.getByRole("link", { name: /Kumari Heights/ });
    await expect(kumari).toHaveTextContent("Residential");
    await expect(kumari.querySelector("[data-slot=avatar-image]")).toBeNull();
    await expect(
      kumari.querySelector("[data-slot=avatar-fallback]"),
    ).toHaveTextContent("KH");
    // A Project from before M4 says its type is not set.
    await expect(
      cards.getByRole("link", { name: /Parvathipuram Row Houses/ }),
    ).toHaveTextContent("Project Type not set");
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Projects" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const ZEN = "0199c4a0-0000-7000-8000-000000000005";
const VADASERY = "0199c4a0-0000-7000-8000-000000000003";

function rowNames(canvas: {
  getByRole: (role: "list", options: { name: string }) => HTMLElement;
}) {
  return within(canvas.getByRole("list", { name: "Projects" }))
    .getAllByRole("link")
    .map((link) => link.querySelector("p")?.textContent);
}

export const PinnedFirst: Story = {
  beforeEach() {
    pinned = [VADASERY, ZEN];
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Projects" });
    await expect(rowNames(canvas)).toEqual([
      "Vadasery Plots",
      "Zen Villas",
      "Asaripallam Tower",
      "Kumari Heights",
      "Parvathipuram Row Houses",
    ]);
    const cards = within(canvas.getByRole("list", { name: "Projects" }));
    await expect(
      within(cards.getByRole("link", { name: /Zen Villas/ })).getByRole("img", {
        name: "Pinned",
      }),
    ).toBeVisible();
    await expect(
      within(cards.getByRole("link", { name: /Kumari Heights/ })).queryByRole(
        "img",
        { name: "Pinned" },
      ),
    ).toBeNull();
  },
};

export const CardMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Projects" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Options for Zen Villas" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toBeVisible();
    await expect(
      body.getByRole("menuitem", { name: "Hide modules" }),
    ).toBeVisible();
    await userEvent.click(body.getByRole("menuitem", { name: "Pin to top" }));
    await waitFor(() => expect(rowNames(canvas)[0]).toBe("Zen Villas"));
    await expect(
      api.calls.mock.calls.some(
        ([call]) =>
          call.method === "POST" && call.path === `${BASE}/${ZEN}/pin`,
      ),
    ).toBe(true);

    // Unpin puts it back in status order.
    await userEvent.click(
      canvas.getByRole("button", { name: "Options for Zen Villas" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Unpin" }));
    await waitFor(() => expect(rowNames(canvas).at(-1)).toBe("Zen Villas"));
  },
};
