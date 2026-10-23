import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  project,
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
    const cards = within(canvas.getByRole("group", { name: "Projects" }));
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

/**
 * Project Progress % on the card (CM-805): a bar with the figure and the
 * weighting; no bar for a Project without tasks.
 */
export const ProgressOnTheCard: Story = {
  play: async ({ canvas }) => {
    const cards = within(
      await canvas.findByRole("group", { name: "Projects" }),
    );
    const kumari = within(cards.getByRole("link", { name: /Kumari Heights/ }));
    await expect(
      kumari.getByRole("progressbar", { name: "Project Progress" }),
    ).toHaveAttribute("aria-valuetext", "42.5%, weighted by Total Price");
    await expect(kumari.getByText("42.5%")).toBeVisible();
    const tower = within(
      cards.getByRole("link", { name: /Asaripallam Tower/ }),
    );
    await expect(
      tower.getByRole("progressbar", { name: "Project Progress" }),
    ).toHaveAttribute("aria-valuetext", "8.33%, weighted by duration");
    const plots = within(cards.getByRole("link", { name: /Vadasery Plots/ }));
    await expect(plots.queryByRole("progressbar")).toBeNull();
  },
};

export const FiltersByStatus: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("group", { name: "Projects" });
    await expect(
      canvas.getByRole("button", { name: "Ongoing 2" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "On hold 1" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Completed 1" }));
    const cards = within(canvas.getByRole("group", { name: "Projects" }));
    await expect(cards.getAllByRole("link")).toHaveLength(1);
    await expect(cards.getByRole("link")).toHaveTextContent("Zen Villas");

    await userEvent.click(canvas.getByRole("button", { name: "Ongoing 2" }));
    await expect(
      within(canvas.getByRole("group", { name: "Projects" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      // Kumari Heights has a client; Asaripallam Tower is Uncategorised.
      expect.stringContaining("Kumari Heights"),
      expect.stringContaining("Asaripallam Tower"),
    ]);
  },
};

export const FilterWithNoMatch: Story = {
  beforeEach() {
    items = STORY_PROJECTS.filter((item) => item.status !== "on_hold");
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("group", { name: "Projects" });
    await userEvent.click(canvas.getByRole("button", { name: "On hold 0" }));
    await expect(
      await canvas.findByText("No Projects are on hold."),
    ).toBeVisible();
  },
};

/**
 * A Company with no Projects sees the same page as one with Projects, every
 * figure at 0, and the empty state where the list of Projects would be.
 */
export const Empty: Story = {
  beforeEach() {
    items = [];
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No Projects yet")).toBeVisible();
    for (const label of ["All Projects", "Ongoing", "On hold", "Completed"]) {
      await expect(
        canvas.getByRole("button", { name: new RegExp(`^${label} 0 `) }),
      ).toBeVisible();
    }
    const yourProjects = canvas
      .getByRole("heading", { name: "Your Projects" })
      .closest("section");
    if (yourProjects == null) throw new Error("Your Projects has no section");
    const section = within(yourProjects);
    for (const chip of [
      "All 0",
      "Ongoing 0",
      "Not started 0",
      "On hold 0",
      "Completed 0",
    ]) {
      await expect(section.getByRole("button", { name: chip })).toBeVisible();
    }
    await expect(section.getByText("No Projects yet")).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Add your first Project" }),
    ).toHaveAttribute("href", "/app/projects/new");
    // The empty state is the only way to add a Project.
    await expect(
      canvas.queryByRole("link", { name: "New Project" }),
    ).toBeNull();
    await expect(canvas.queryByRole("group", { name: "Projects" })).toBeNull();

    // A status chip keeps the empty state, not "No Projects are ongoing."
    await userEvent.click(section.getByRole("button", { name: "Ongoing 0" }));
    await expect(section.getByText("No Projects yet")).toBeVisible();
    await expect(canvas.queryByText("No Projects are ongoing.")).toBeNull();
  },
};

export const CardsWithAndWithoutLogo: Story = {
  play: async ({ canvas }) => {
    const cards = within(
      await canvas.findByRole("group", { name: "Projects" }),
    );
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
    await canvas.findByRole("group", { name: "Projects" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const ZEN = "0199c4a0-0000-7000-8000-000000000005";
const VADASERY = "0199c4a0-0000-7000-8000-000000000003";

function rowNames(canvas: {
  getByRole: (role: "group", options: { name: string }) => HTMLElement;
}) {
  return within(canvas.getByRole("group", { name: "Projects" }))
    .getAllByRole("link")
    .map((link) => link.querySelector("p")?.textContent);
}

export const PinnedFirst: Story = {
  beforeEach() {
    pinned = [VADASERY, ZEN];
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("group", { name: "Projects" });
    // Pinned first within each client's group (ADR CM-0027 §1).
    await expect(rowNames(canvas)).toEqual([
      "Kumari Heights",
      "Vadasery Plots",
      "Zen Villas",
      "Asaripallam Tower",
      "Parvathipuram Row Houses",
    ]);
    const cards = within(canvas.getByRole("group", { name: "Projects" }));
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
    await canvas.findByRole("group", { name: "Projects" });
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
    // First in its group, after Kumari Heights' client group.
    await waitFor(() => expect(rowNames(canvas)[1]).toBe("Zen Villas"));
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

/**
 * Every Project is a folder in its colour (ADR CM-0026 §3); a long name is
 * cut short on one line, and the kebab sits outside the link.
 */
export const FolderColours: Story = {
  beforeEach() {
    items = [
      ...STORY_PROJECTS,
      project({
        id: "0199c4a0-0000-7000-8000-000000000007",
        name: "Anugraha Residency Phase II — Saravanampatti Block C, Coimbatore",
        projectType: "mixed_use",
        color: "lemon",
      }),
      project({
        id: "0199c4a0-0000-7000-8000-000000000008",
        name: "NH-44 Culvert Repairs",
        projectType: "infrastructure",
        color: "slate",
        status: "not_started",
      }),
      project({
        id: "0199c4a0-0000-7000-8000-000000000009",
        name: "Meenakshi Clinic Interiors",
        projectType: "interiors",
        color: "sand",
        address: null,
      }),
    ];
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("group", { name: "Projects" });
    const folders = [...list.querySelectorAll("li[data-color]")];
    await expect(
      folders.map((folder) => folder.getAttribute("data-color")),
    ).toEqual([
      "lavender",
      "peach",
      "sky",
      "rose",
      "mint",
      "lemon",
      "slate",
      "sand",
    ]);
    const long = within(list).getByRole("link", { name: /Phase II/ });
    const name = long.querySelector("p span");
    if (name == null) throw new Error("The folder has no name");
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    await expect(
      long.contains(
        canvas.getByRole("button", { name: /^Options for Anugraha Residency/ }),
      ),
    ).toBe(false);
  },
};

export const FoldersDark: Story = {
  ...FolderColours,
  globals: { theme: "dark" },
};

export const FoldersOnAPhone: Story = {
  ...FolderColours,
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("group", { name: "Projects" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Every client a Project has, case and spacing aside; "SBD" stays apart. */
const CLIENT_PROJECTS = [
  project({
    id: "0199c4a0-0000-7000-8000-000000000011",
    name: "Kumari Heights",
    clientName: "Sri Balaji Developers",
    color: "lavender",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000012",
    name: "Anugraha Residency",
    clientName: "sri balaji  developers",
    color: "peach",
    status: "on_hold",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000013",
    name: "NH-44 Culvert Repairs",
    clientName: "NHAI Madurai",
    projectType: "infrastructure",
    color: "slate",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000014",
    name: "Zen Villas",
    clientName: null,
    color: "mint",
    status: "completed",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000015",
    name: "Meenakshi Clinic Interiors",
    clientName: "  ",
    color: "sand",
  }),
];

function groupHeadings(canvas: {
  getByRole: (role: "group", options: { name: string }) => HTMLElement;
}) {
  return within(canvas.getByRole("group", { name: "Projects" }))
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

/**
 * Folders grouped by client (ADR CM-0027 §1): by name, the same client
 * whatever its case or spacing, and Uncategorised last for Projects with
 * no client. A status filter hides groups left empty.
 */
export const GroupedByClient: Story = {
  beforeEach() {
    items = CLIENT_PROJECTS;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("group", { name: "Projects" });
    await expect(groupHeadings(canvas)).toEqual([
      "NHAI Madurai, 1 Project",
      "Sri Balaji Developers, 2 Projects",
      "Uncategorised, 2 Projects",
    ]);
    const balaji = within(
      canvas.getByRole("region", { name: /^Sri Balaji Developers\b/ }),
    );
    await expect(
      balaji
        .getAllByRole("link")
        .map((link) => link.querySelector("p")?.textContent),
    ).toEqual(["Kumari Heights", "Anugraha Residency"]);
    const none = within(
      canvas.getByRole("region", { name: /^Uncategorised\b/ }),
    );
    await expect(none.getAllByRole("link")).toHaveLength(2);

    await userEvent.click(canvas.getByRole("button", { name: "On hold 1" }));
    await expect(groupHeadings(canvas)).toEqual([
      "Sri Balaji Developers, 1 Project",
    ]);
  },
};

/** Grouped on a phone: headings and folders fit, no sideways scroll. */
export const GroupedOnAPhone: Story = {
  beforeEach() {
    items = CLIENT_PROJECTS;
  },
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("group", { name: "Projects" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
