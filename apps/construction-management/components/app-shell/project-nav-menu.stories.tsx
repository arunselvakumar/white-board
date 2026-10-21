import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { PagePlaceholder } from "@/components/app-shell/page-placeholder";
import { financeAccess } from "@/components/finance/accounts/account-list-fixtures";
import { KUMARI, STORY_LOGO_URL } from "@/components/projects/project-fixtures";
import { storyHome } from "@/components/projects/project-home-fixtures";
import { ProjectShell } from "@/components/projects/project-shell";
import type { ProjectHome } from "@/src/queries/project-home";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { signInAs } from "../../.storybook/mocks/auth";

const BASE = "/api/construction/projects/projects";
const PATH = `/app/projects/${KUMARI.id}`;

/** Only Labour payments readable: Payments shows one tab. */
function labourOnlyAccess() {
  const access = financeAccess([], KUMARI.id);
  access.menus["labour.labour"] = ["read"];
  return access;
}

function serve(
  home: ProjectHome | null = storyHome(),
  subject: typeof KUMARI = KUMARI,
): () => () => void {
  return () => {
    signInAs("owner", { name: "Anugraha Engineers" });
    const api = mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${subject.id}`)
        return Response.json(subject);
      if (method === "GET" && path === `${BASE}/${subject.id}/home`)
        return home == null ? undefined : Response.json(home);
      if (
        method === "GET" &&
        path.startsWith("/api/construction/finance/access")
      )
        return Response.json(labourOnlyAccess());
      return undefined;
    });
    return api.restore;
  };
}

function at(pathname: string) {
  return { nextjs: { navigation: { pathname } } };
}

const meta = {
  title: "App/ProjectNavMenu",
  beforeEach: serve(),
  parameters: at(PATH),
  render: () => (
    <StoryQueries>
      <AppShell>
        <ProjectShell id={KUMARI.id}>
          <PagePlaceholder title="Page" description="The module's page." />
        </ProjectShell>
      </AppShell>
    </StoryQueries>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

/**
 * The sidebar to look in: docked on a wide screen; on a phone (where the
 * tests run) the Sidebar sheet, opened with Toggle Sidebar. The newest
 * sheet is this story's (the last story's may still be closing), and the
 * checks wait until it has finished opening.
 */
async function openSidebar({ canvas, canvasElement, userEvent }: PlayContext) {
  const view = canvasElement.ownerDocument.defaultView;
  if (view == null || view.innerWidth >= 768) return within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: "Toggle Sidebar" }),
  );
  const body = within(canvasElement.ownerDocument.body);
  const sheets = await body.findAllByRole("dialog", { name: "Sidebar" });
  const sheet = sheets[sheets.length - 1];
  if (sheet == null) throw new Error("The Sidebar sheet did not open");
  await waitFor(() => expect(sheet).toBeVisible());
  return within(sheet);
}

async function projectMenu(context: PlayContext) {
  const sidebar = await openSidebar(context);
  const nav = await sidebar.findByRole("navigation", { name: "Project" });
  return { sidebar, nav, menu: within(nav) };
}

function groupsOf(nav: HTMLElement): [string, string[]][] {
  return [...nav.querySelectorAll("[data-sidebar=group]")].map((group) => [
    group.querySelector("[data-sidebar=group-label]")?.textContent ?? "",
    [...group.querySelectorAll("[data-sidebar=menu-button]")].map(
      (link) => link.textContent,
    ),
  ]);
}

export const Home: Story = {
  play: async (context) => {
    const { sidebar, nav, menu } = await projectMenu(context);
    await expect(
      sidebar.getByRole("link", { name: "Back to projects" }),
    ).toHaveAttribute("href", "/app/projects");
    // The three areas give way to the Project's menu.
    await expect(
      sidebar.queryByRole("navigation", { name: "Main" }),
    ).toBeNull();
    await waitFor(() =>
      expect(groupsOf(nav)).toEqual([
        ["Overview", ["Home", "Dashboard"]],
        ["Setup", ["Wings", "Amenities", "Resources"]],
        [
          "Site work",
          [
            "Attendance",
            "Daily Worksheet",
            "Tasks",
            "Site Diary",
            "Hindrances",
            "Equipment",
          ],
        ],
        ["Materials & money", ["Materials", "Payments"]],
        ["Quality", ["Issues & Snags", "Inspections", "Testing Reports"]],
        ["Sales", ["Inquiries", "Bookings"]],
        ["Files", ["Drawings", "Documents", "Gallery"]],
        ["Reports", ["Progress Reports", "Reports"]],
      ]),
    );
    await expect(menu.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(menu.getByRole("link", { name: "Wings" })).toHaveAttribute(
      "href",
      `${PATH}/wings`,
    );
    await expect(
      menu.getByRole("link", { name: "Testing Reports" }),
    ).toHaveAttribute("href", `${PATH}/testing-reports`);
    // Account links stay at the foot.
    await expect(
      sidebar.getByRole("link", { name: "My Profile" }),
    ).toBeInTheDocument();
  },
};

export const ProjectNameAndLogo: Story = {
  beforeEach: serve(storyHome(), { ...KUMARI, logoUrl: STORY_LOGO_URL }),
  play: async (context) => {
    const { sidebar } = await projectMenu(context);
    const back = sidebar.getByRole("link", { name: "Back to projects" });
    const content = back.closest("[data-sidebar=content]");
    if (!(content instanceof HTMLElement))
      throw new Error("Back to projects is not in the sidebar");
    await expect(
      await within(content).findByText("Kumari Heights"),
    ).toBeVisible();
    await expect(within(content).getByText("Residential")).toBeVisible();
    await expect(
      content.querySelector("[data-slot=avatar-image]"),
    ).toHaveAttribute("src", STORY_LOGO_URL);
  },
};

export const MemberModules: Story = {
  beforeEach: serve(
    storyHome({ keys: ["payments", "documents", "attendance"] }),
  ),
  play: async (context) => {
    const { nav } = await projectMenu(context);
    // Fixed headings, not the member's tile order; empty headings go.
    await waitFor(() =>
      expect(groupsOf(nav)).toEqual([
        ["Overview", ["Home"]],
        ["Site work", ["Attendance"]],
        ["Materials & money", ["Payments"]],
        ["Files", ["Documents"]],
      ]),
    );
  },
};

export const HiddenModulesLeaveTheMenu: Story = {
  beforeEach: serve(storyHome({ hidden: ["gallery", "reports"] })),
  play: async (context) => {
    const { menu } = await projectMenu(context);
    await menu.findByRole("link", { name: "Documents" });
    await expect(menu.queryByRole("link", { name: "Gallery" })).toBeNull();
    await expect(menu.queryByRole("link", { name: "Reports" })).toBeNull();
    await expect(
      menu.getByRole("link", { name: "Progress Reports" }),
    ).toBeVisible();
  },
};

export const PaymentsSubmenu: Story = {
  parameters: at(`${PATH}/payments/wages`),
  play: async (context) => {
    const { menu } = await projectMenu(context);
    const submenu = within(await menu.findByRole("list", { name: "Payments" }));
    // Only the tabs the viewer may read, once their access loads.
    await waitFor(() =>
      expect(
        submenu.getAllByRole("link").map((link) => link.textContent),
      ).toEqual(["Labour & Vendor"]),
    );
    await expect(
      submenu.getByRole("link", { name: "Labour & Vendor" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      menu.getByRole("link", { name: "Payments" }),
    ).not.toHaveAttribute("aria-current");
    await expect(menu.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  },
};

export const AttendanceSubmenuFolds: Story = {
  parameters: at(`${PATH}/attendance/vendors`),
  play: async (context) => {
    const { menu } = await projectMenu(context);
    const submenu = within(
      await menu.findByRole("list", { name: "Attendance" }),
    );
    await expect(submenu.getByRole("link", { name: "Labour" })).toHaveAttribute(
      "href",
      `${PATH}/attendance/labour`,
    );
    await expect(submenu.getByRole("link", { name: "Vendor" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Other modules' submenus stay folded.
    await expect(menu.queryByRole("list", { name: "Materials" })).toBeNull();

    await context.userEvent.click(
      menu.getByRole("button", { name: "Hide Attendance list" }),
    );
    await waitFor(() =>
      expect(menu.queryByRole("list", { name: "Attendance" })).toBeNull(),
    );
    await context.userEvent.click(
      menu.getByRole("button", { name: "Show Materials list" }),
    );
    const materials = within(
      await menu.findByRole("list", { name: "Materials" }),
    );
    await expect(
      materials.getByRole("link", { name: "Purchase Orders" }),
    ).toHaveAttribute("href", `${PATH}/materials/purchase-orders`);
  },
};

export const EditBelongsToHome: Story = {
  parameters: at(`${PATH}/edit`),
  play: async (context) => {
    const { menu } = await projectMenu(context);
    await expect(
      await menu.findByRole("link", { name: "Home" }),
    ).toHaveAttribute("aria-current", "page");
  },
};

export const WithoutHomeFallsBack: Story = {
  beforeEach: serve(null),
  play: async (context) => {
    const { menu } = await projectMenu(context);
    // The home could not load: every module of the structure.
    await expect(
      await menu.findByRole("link", { name: "Wings" }),
    ).toBeVisible();
    await expect(menu.queryByRole("link", { name: "Locations" })).toBeNull();
  },
};

export const NewProjectKeepsTheAreas: Story = {
  parameters: at("/app/projects/new"),
  render: () => (
    <StoryQueries>
      <AppShell>
        <PagePlaceholder title="New Project" description="The form." />
      </AppShell>
    </StoryQueries>
  ),
  play: async (context) => {
    const sidebar = await openSidebar(context);
    await expect(
      await sidebar.findByRole("navigation", { name: "Main" }),
    ).toBeVisible();
    await expect(
      sidebar.queryByRole("link", { name: "Back to projects" }),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async (context) => {
    const { canvas, canvasElement } = context;
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    const { menu } = await projectMenu(context);
    await expect(
      await menu.findByRole("link", { name: "Daily Worksheet" }),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
