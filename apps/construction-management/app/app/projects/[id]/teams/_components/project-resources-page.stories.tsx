import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch } from "@/.storybook/mock-fetch";
import { ProjectResourcesPage } from "./project-resources-page";
import {
  BALAJI,
  DEVI,
  KAVERI,
  MUTHU,
  NO_RESOURCES,
  OWNER,
  PRABHU,
  PROJECT_ID,
  RAMCO,
  RESOURCES,
  RESOURCES_API,
  SURYA,
} from "./resource-fixtures";
import {
  ANAND,
  ARUMUGAM,
  FEW_LABOURS,
  LABOURS_API,
  labourPage,
} from "./staffing-fixtures";

let api: ReturnType<typeof mockFetch>;

function sent(path: string): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === path,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

/** The Labours section's list route over `items`. */
function laboursRoute(items: typeof FEW_LABOURS = []) {
  return {
    path: LABOURS_API,
    respond: ({ search }: { search: URLSearchParams }) =>
      Response.json(labourPage(items, search)),
  };
}

function region(
  canvas: {
    getByRole: (role: string, options: { name: string }) => HTMLElement;
  },
  name: string,
) {
  return within(canvas.getByRole("region", { name }));
}

const meta = {
  title: "Projects/Teams",
  component: ProjectResourcesPage,
  args: { projectId: PROJECT_ID, canEdit: true },
  render: (args) => (
    <StoryQueryClient>
      <ProjectResourcesPage {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof ProjectResourcesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditContractors: Story = {
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      { path: RESOURCES_API, respond: () => Response.json(RESOURCES) },
      {
        path: `${RESOURCES_API}/contractors/options`,
        respond: () => Response.json({ items: [BALAJI, SURYA] }),
      },
      {
        method: "POST",
        path: `${RESOURCES_API}/contractors`,
        respond: () =>
          Response.json({ ...RESOURCES, contractors: [BALAJI, SURYA] }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: /Team Members/ });
    const team = region(canvas, "Team Members 2");
    await expect(team.getByText(OWNER.name)).toBeVisible();
    await expect(
      team.getByText("Owner", { selector: "[data-slot=badge]" }),
    ).toBeVisible();
    await expect(team.getByText(PRABHU.name)).toBeVisible();
    const contractors = region(canvas, "Contractors 2");
    await expect(contractors.getByText("Inactive")).toBeVisible();
    await expect(contractors.getByText("Painting, RCC")).toBeVisible();
    await expect(
      region(canvas, "Suppliers 1").getByText(KAVERI.name),
    ).toBeVisible();
    await expect(
      region(canvas, "Vendors 1").getByText(MUTHU.name),
    ).toBeVisible();

    await userEvent.click(
      contractors.getByRole("button", { name: "Edit Contractors" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText("Contractors on this Project")).toBeVisible();
    // The inactive Contractor on the Project is listed (it may stay or go).
    await expect(
      await dialog.findByRole("checkbox", { name: /Ramco Builders/ }),
    ).toBeChecked();
    await expect(dialog.getByText("2 selected")).toBeVisible();

    await userEvent.type(
      dialog.getByRole("searchbox", { name: "Search Contractors" }),
      "plumb",
    );
    await expect(dialog.queryByText(BALAJI.name)).toBeNull();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Surya Plumbing Works/ }),
    );
    await userEvent.clear(
      dialog.getByRole("searchbox", { name: "Search Contractors" }),
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Ramco Builders/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(sent(`${RESOURCES_API}/contractors`)).toEqual({
      ids: [BALAJI.id, SURYA.id],
      expectedIds: [RAMCO.id, BALAJI.id],
    });
    await expect(
      await region(canvas, "Contractors 2").findByText(SURYA.name),
    ).toBeVisible();
  },
};

export const EditTeamMembersChangedElsewhere: Story = {
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      { path: RESOURCES_API, respond: () => Response.json(RESOURCES) },
      {
        path: `${RESOURCES_API}/team-members/options`,
        respond: () => Response.json({ items: [DEVI, PRABHU] }),
      },
      {
        method: "POST",
        path: `${RESOURCES_API}/team-members`,
        respond: () =>
          Response.json(
            {
              code: "PROJECT_RESOURCES_CHANGED",
              message:
                "Someone else changed this Project's Teams after you opened them. Reload to see their changes.",
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit Team Members" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    // The Owner is on every Project and is not offered.
    await expect(
      await dialog.findByRole("checkbox", { name: /Devi Lakshmi/ }),
    ).not.toBeChecked();
    await expect(
      dialog.getByText("Store Keeper · Joining Pending"),
    ).toBeVisible();
    await expect(dialog.queryByText(OWNER.name)).toBeNull();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Devi Lakshmi/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(/Someone else changed this Project's Teams/),
    ).toBeVisible();
    await expect(sent(`${RESOURCES_API}/team-members`)).toEqual({
      ids: [PRABHU.id, DEVI.id],
      expectedIds: [PRABHU.id],
    });
    // The page reloads the Resources so the next try starts from them.
    await waitFor(() =>
      expect(
        api.spy.mock.calls.filter(
          ([input, init]) => input === RESOURCES_API && init?.method == null,
        ).length,
      ).toBeGreaterThan(1),
    );
  },
};

export const EmptyStates: Story = {
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      { path: RESOURCES_API, respond: () => Response.json(NO_RESOURCES) },
      {
        path: `${RESOURCES_API}/vendors/options`,
        respond: () => Response.json({ items: [] }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("No Contractors on this Project"),
    ).toBeVisible();
    for (const [title, path] of [
      ["Contractor", "/app/masters/contractors/new"],
      ["Supplier", "/app/masters/suppliers/new"],
      ["Vendor", "/app/staff/vendors/new"],
    ] as const)
      await expect(
        canvas.getByRole("link", { name: `Add a ${title}` }),
      ).toHaveAttribute("href", path);
    // Only the Owner: the Team Members section lists them, nobody else.
    await expect(canvas.getByText(OWNER.name)).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Edit Vendors" }));
    const dialog = within(await body.findByRole("dialog"));
    await expect(await dialog.findByText("No Vendors yet")).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Add a Vendor" }),
    ).toHaveAttribute("href", "/app/staff/vendors/new");
  },
};

export const ReadOnly: Story = {
  args: { canEdit: false },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      {
        path: RESOURCES_API,
        respond: () => Response.json({ ...NO_RESOURCES, vendors: [MUTHU] }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(MUTHU.name)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /^Edit/ })).toBeNull();
    await expect(
      canvas.getByText("Nobody has put Suppliers on this Project yet."),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: /^Add a/ })).toBeNull();
  },
};

export const AddProjectStepOnAPhone: Story = {
  args: { wizard: true },
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      { path: RESOURCES_API, respond: () => Response.json(NO_RESOURCES) },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("Step 2 of 2 · Teams")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Skip" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}`,
    );
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};

export const AddProjectStepDone: Story = {
  args: { wizard: true },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(),
      { path: RESOURCES_API, respond: () => Response.json(RESOURCES) },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Done" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT_ID}`);
  },
};

export const SiteEngineersAndLaboursFirst: Story = {
  args: { canReadLabours: true },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(FEW_LABOURS),
      {
        path: RESOURCES_API,
        respond: () =>
          Response.json({
            ...RESOURCES,
            siteEngineers: [ANAND],
            labours: { total: FEW_LABOURS.length },
          }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("region", { name: "Labours 3" });
    const headings = canvas
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    await expect(headings).toEqual([
      "Site Engineers 1",
      "Labours 3",
      "Team Members 2",
      "Contractors 2",
      "Suppliers 1",
      "Vendors 1",
    ]);
    await expect(
      region(canvas, "Site Engineers 1").getByText(ANAND.name),
    ).toBeVisible();
  },
};

const ALL_SECTIONS_OPEN = {
  teamMembers: true,
  contractors: true,
  suppliers: true,
  vendors: true,
};

/** Each row of a list, with the links inside it. */
function rowLinks(list: HTMLElement): HTMLAnchorElement[][] {
  return within(list)
    .getAllByRole("listitem")
    .map((row) => [...row.querySelectorAll("a")]);
}

export const RowsOpenEachPage: Story = {
  args: { canReadLabours: true, canOpenSections: ALL_SECTIONS_OPEN },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(FEW_LABOURS),
      {
        path: RESOURCES_API,
        respond: () =>
          Response.json({
            ...RESOURCES,
            siteEngineers: [ANAND],
            labours: { total: FEW_LABOURS.length },
          }),
      },
      {
        path: `/api/construction/projects/projects/${PROJECT_ID}`,
        respond: () => Response.json({ id: PROJECT_ID, name: "Sky Towers" }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: "Labours 3" });
    const expected: [string, string, string][] = [
      ["Site Engineers 1", ANAND.name, `/app/staff/site-engineers/${ANAND.id}`],
      ["Labours 3", ARUMUGAM.name, `/app/staff/labours/${ARUMUGAM.id}`],
      ["Team Members 2", PRABHU.name, `/app/staff/office-staff/${PRABHU.id}`],
      ["Contractors 2", BALAJI.name, `/app/masters/contractors/${BALAJI.id}`],
      ["Suppliers 1", KAVERI.name, `/app/masters/suppliers/${KAVERI.id}`],
      ["Vendors 1", MUTHU.name, `/app/staff/vendors/${MUTHU.id}`],
    ];
    for (const [section, name, href] of expected) {
      const link = region(canvas, section).getByRole("link", { name });
      await expect(link).toHaveAttribute("href", href);
    }
    // One link per row, named by the person alone; the Owner has no page.
    for (const list of canvas.getAllByRole("list")) {
      for (const links of rowLinks(list))
        await expect(links.length).toBeLessThanOrEqual(1);
    }
    const team = region(canvas, "Team Members 2");
    await expect(team.queryByRole("link", { name: OWNER.name })).toBeNull();
    await expect(team.getByText(OWNER.name)).toBeVisible();
    const inactive = region(canvas, "Contractors 2").getByRole("link", {
      name: RAMCO.name,
    });
    await expect(inactive).toHaveAttribute(
      "href",
      `/app/masters/contractors/${RAMCO.id}`,
    );

    // A row's own controls stay outside the link and still work.
    const labours = region(canvas, "Labours 3");
    const actions = labours.getByRole("button", {
      name: `Actions for ${ARUMUGAM.name}`,
    });
    const labourLink = labours.getByRole("link", { name: ARUMUGAM.name });
    await expect(labourLink.contains(actions)).toBe(false);
    await userEvent.click(actions);
    await expect(
      await body.findByRole("menuitem", { name: "Remove from Project" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    const remove = region(canvas, "Site Engineers 1").getByRole("button", {
      name: `Remove ${ANAND.name}`,
    });
    await userEvent.click(remove);
    await expect(
      await body.findByRole("alertdialog", {
        name: `Remove ${ANAND.name} from this Project?`,
      }),
    ).toBeVisible();
  },
};

export const RowsPlainWithoutAccess: Story = {
  args: { canEdit: false },
  beforeEach: () => {
    api = mockFetch([
      laboursRoute(FEW_LABOURS),
      {
        path: RESOURCES_API,
        respond: () =>
          Response.json({
            ...RESOURCES,
            siteEngineers: [ANAND],
            labours: { total: FEW_LABOURS.length },
          }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("region", { name: "Labours 3" });
    for (const section of [
      "Site Engineers 1",
      "Labours 3",
      "Team Members 2",
      "Contractors 2",
      "Suppliers 1",
      "Vendors 1",
    ])
      await expect(region(canvas, section).queryAllByRole("link")).toEqual([]);
    await expect(
      region(canvas, "Vendors 1").getByText(MUTHU.name),
    ).toBeVisible();
  },
};
