import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { AppAreaPage } from "@/components/app-shell/app-area-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV, appPageByHref, type AppNavHref } from "@/lib/app-nav";
import { HRMS_PATH, HRMS_SECTIONS } from "@/lib/hrms-nav";
import { LABOUR_VENDORS_SECTIONS } from "@/lib/labour-vendors-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";
import { STAFF_ROLES_SECTIONS } from "@/lib/staff-roles-nav";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";

function shellAt(
  href: AppNavHref,
  canOpenDashboard = true,
  canOpenStaffRoles = true,
) {
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    render: () => (
      <AppShell
        canOpenDashboard={canOpenDashboard}
        canOpenStaffRoles={canOpenStaffRoles}
      >
        <AppAreaPage href={href} />
      </AppShell>
    ),
  };
}

const meta = {
  title: "App/AppShell",
  tags: ["autodocs"],
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

function isPhone(canvasElement: HTMLElement) {
  const view = canvasElement.ownerDocument.defaultView;
  return view != null && view.innerWidth < 768;
}

/**
 * The sidebar to look in (ADR-0050): docked on a wide screen; on a phone
 * the Sidebar sheet, opened with Toggle Sidebar in the phone bar. The
 * newest sheet is this story's (the last story's may still be closing).
 */
async function openSidebar({ canvas, canvasElement, userEvent }: PlayContext) {
  if (!isPhone(canvasElement)) return within(canvasElement);
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

/** The main menu, in the sidebar. */
async function mainMenu(context: PlayContext) {
  const sidebar = await openSidebar(context);
  return within(await sidebar.findByRole("navigation", { name: "Main" }));
}

/**
 * The area's page beside the sidebar, and the sidebar's Company switcher
 * and main menu (on a phone, inside the sheet, where the phone bar keeps
 * the notification bell).
 */
async function expectArea(
  context: PlayContext,
  current: (typeof APP_NAV)[number],
) {
  const { canvas, canvasElement } = context;
  await expect(
    canvas.getByRole("heading", { name: current.title }),
  ).toBeVisible();
  await expect(canvas.getByText("Nothing here yet")).toBeVisible();
  await expect(canvas.getByText(current.description)).toBeVisible();
  if (isPhone(canvasElement))
    await expect(
      canvas.getByRole("button", { name: /^Notifications/ }),
    ).toBeVisible();
  const sidebar = await openSidebar(context);
  await expect(
    sidebar.getByRole("button", {
      name: /Active Company: Anugraha Engineers/,
    }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /^Notifications/ }),
  ).toBeVisible();
  const nav = within(sidebar.getByRole("navigation", { name: "Main" }));
  for (const item of APP_NAV) {
    await expect(nav.getByRole("link", { name: item.label })).toHaveAttribute(
      "href",
      item.href,
    );
  }
  await expect(nav.getByRole("link", { name: current.label })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

export const Projects: Story = {
  ...shellAt("/app/projects"),
  play: async (context) => {
    await expectArea(context, appPageByHref("/app/projects"));
  },
};

export const Workspace: Story = {
  ...shellAt("/app/workspace"),
  play: async (context) => {
    await expectArea(context, appPageByHref("/app/workspace"));
  },
};

/** The Company Dashboard leads the main menu (CM-902). */
export const DashboardFirst: Story = {
  ...shellAt("/app/projects"),
  play: async (context) => {
    const nav = await mainMenu(context);
    const links = nav.getAllByRole("link");
    await expect(links[0]).toHaveAccessibleName("Dashboard");
    await expect(links[0]).toHaveAttribute("href", "/app/dashboard");
  },
};

/** Without the Dashboard menu's Read the Dashboard is not in the menu. */
export const WithoutDashboard: Story = {
  ...shellAt("/app/projects", false),
  play: async (context) => {
    const nav = await mainMenu(context);
    await expect(nav.queryByRole("link", { name: "Dashboard" })).toBeNull();
    await expect(nav.getAllByRole("link")[0]).toHaveAccessibleName("Projects");
  },
};

/**
 * Without Team Members or Role Management Read (a Site Supervisor, say),
 * Human Resources has no Staff group and its link opens HRMS (ADR CM-0030,
 * CM-0034).
 */
export const WithoutStaffRoles: Story = {
  ...shellAt("/app/projects", true, false),
  play: async (context) => {
    const nav = await mainMenu(context);
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).toHaveAttribute("href", HRMS_PATH);
    await context.userEvent.click(
      nav.getByRole("button", { name: "Show Human Resources list" }),
    );
    const submenu = within(
      await nav.findByRole("list", { name: "Human Resources" }),
    );
    await expect(submenu.queryByRole("list", { name: "Staff" })).toBeNull();
    await expect(submenu.queryByRole("link", { name: "Staff" })).toBeNull();
    await expect(submenu.getByRole("list", { name: "HRMS" })).toBeVisible();
    await expect(submenu.getByRole("list", { name: "Labour" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  },
};

/**
 * The menu search narrows the main menu by label (ADR-0049): an entry's
 * label or its group's heading keeps it, an area whose label matches
 * shows all of it, and an area with a match is held open.
 */
export const MenuSearch: Story = {
  ...shellAt("/app/projects"),
  play: async (context) => {
    const { userEvent } = context;
    const nav = await mainMenu(context);
    const sidebar = nav
      .getByRole("link", { name: "Projects" })
      .closest<HTMLElement>("[data-sidebar=sidebar]");
    if (sidebar == null) throw new Error("The sidebar is missing");
    const search = within(sidebar).getByRole("searchbox", {
      name: "Search menu",
    });

    await userEvent.type(search, "payment");
    const workspace = within(
      await nav.findByRole("list", { name: "Workspace" }),
    );
    await expect(
      workspace.getByRole("link", { name: "Central Payment" }),
    ).toBeVisible();
    await expect(
      workspace.queryByRole("link", { name: "Central Store" }),
    ).toBeNull();
    await expect(nav.queryByRole("link", { name: "Projects" })).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "Masters");
    const masters = within(await nav.findByRole("list", { name: "Masters" }));
    await expect(
      masters.getByRole("link", { name: "Contractors" }),
    ).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(
      await within(sidebar).findByText("No menu item matches “zzz”."),
    ).toBeVisible();

    await userEvent.clear(search);
    for (const item of APP_NAV)
      await expect(
        await nav.findByRole("link", { name: item.label }),
      ).toBeVisible();
  },
};

export const MastersSubmenu: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/contractors" } },
  },
  render: () => (
    <AppShell>
      <p>Contractors</p>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const view = canvasElement.ownerDocument.defaultView;
    if (view == null || view.innerWidth < 768) return;
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    const submenu = within(nav.getByRole("list", { name: "Masters" }));
    for (const group of MASTERS_GROUPS) {
      const list = within(submenu.getByRole("list", { name: group.label }));
      for (const section of group.sections)
        await expect(
          list.getByRole("link", { name: section.label }),
        ).toHaveAttribute("href", section.href);
    }
    await expect(
      submenu.getByRole("link", { name: "Contractors" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Masters" })).toHaveAttribute(
      "href",
      "/app/masters",
    );

    await userEvent.click(
      nav.getByRole("button", { name: "Hide Masters list" }),
    );
    await waitFor(() =>
      expect(nav.queryByRole("list", { name: "Masters" })).toBeNull(),
    );
    await userEvent.click(
      nav.getByRole("button", { name: "Show Masters list" }),
    );
    await expect(
      await nav.findByRole("list", { name: "Masters" }),
    ).toBeVisible();
  },
};

/**
 * Human Resources (ADR CM-0034) folds out like Masters, in three groups:
 * Staff (Staff, Role Management), HRMS (its five sections) and Labour
 * (Labours, Supervisors, Vendors; ADR CM-0035). On Role Management
 * the area is open and that entry is current; the area link itself opens
 * Staff.
 */
export const HumanResourcesSubmenu: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/roles/r1" } },
  },
  render: () => (
    <AppShell>
      <p>Edit Role</p>
    </AppShell>
  ),
  play: async (context) => {
    const nav = await mainMenu(context);
    const links = nav.getAllByRole("link").map((link) => link.textContent);
    // After Projects, before Workspace.
    await expect(links.indexOf("Human Resources")).toBeGreaterThan(
      links.indexOf("Projects"),
    );
    await expect(links.indexOf("Human Resources")).toBeLessThan(
      links.indexOf("Workspace"),
    );
    await expect(nav.queryByRole("link", { name: "HR" })).toBeNull();
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).toHaveAttribute("href", "/app/staff");
    const submenu = within(nav.getByRole("list", { name: "Human Resources" }));
    const groups = [
      { label: "Staff", sections: STAFF_ROLES_SECTIONS },
      { label: "HRMS", sections: HRMS_SECTIONS },
      { label: "Labour", sections: LABOUR_VENDORS_SECTIONS },
    ];
    for (const group of groups) {
      const list = within(submenu.getByRole("list", { name: group.label }));
      for (const section of group.sections)
        await expect(
          list.getByRole("link", { name: section.label }),
        ).toHaveAttribute("href", section.href);
    }
    await expect(
      submenu.getByRole("link", { name: "Role Management" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).not.toHaveAttribute("aria-current");
    // Team Members live under Human Resources, not Masters.
    await expect(nav.queryByRole("link", { name: "Team Members" })).toBeNull();
    // Staff & Roles and Labour & Vendors are gone from the main menu.
    await expect(nav.queryByRole("link", { name: "Staff & Roles" })).toBeNull();
    await expect(
      nav.queryByRole("link", { name: "Labour & Vendors" }),
    ).toBeNull();
  },
};

/** On a Vendor the Labour group's Vendors entry is current. */
export const VendorPage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/vendors/v1" } },
  },
  render: () => (
    <AppShell>
      <p>Edit Vendor</p>
    </AppShell>
  ),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(nav.getByRole("list", { name: "Human Resources" }));
    await expect(
      submenu.getByRole("link", { name: "Vendors" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).not.toHaveAttribute("aria-current");
  },
};

/** On Staff the submenu entry is current, not the area link too. */
export const StaffPage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/staff" } },
  },
  render: () => (
    <AppShell>
      <p>Staff</p>
    </AppShell>
  ),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(nav.getByRole("list", { name: "Human Resources" }));
    await expect(submenu.getByRole("link", { name: "Staff" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).not.toHaveAttribute("aria-current");
  },
};

/**
 * An HRMS page opens Human Resources, with the HRMS section current; the
 * Workspace item, where HRMS used to live, is not.
 */
export const HrmsPage: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: "/app/hrms/attendance/team" },
    },
  },
  render: () => (
    <AppShell>
      <p>Team Attendance</p>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView;
    if (view == null || view.innerWidth < 768) return;
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    const submenu = within(nav.getByRole("list", { name: "Human Resources" }));
    const hrms = within(submenu.getByRole("list", { name: "HRMS" }));
    for (const section of HRMS_SECTIONS)
      await expect(
        hrms.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    await expect(
      hrms.getByRole("link", { name: "Attendance" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).not.toHaveAttribute("aria-current");
    await expect(
      nav.getByRole("link", { name: "Workspace" }),
    ).not.toHaveAttribute("aria-current");
    await expect(nav.queryByRole("list", { name: "Workspace" })).toBeNull();
  },
};

/** Workspace keeps Materials, Payments and Reports; HRMS is not a group. */
export const WorkspaceSubmenu: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: "/app/workspace/central-store" },
    },
  },
  render: () => (
    <AppShell>
      <p>Central Store</p>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView;
    if (view == null || view.innerWidth < 768) return;
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    const submenu = within(nav.getByRole("list", { name: "Workspace" }));
    await expect(submenu.queryByRole("list", { name: "HRMS" })).toBeNull();
    const materials = within(submenu.getByRole("list", { name: "Materials" }));
    await expect(
      materials.getByRole("link", { name: "Central Store" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Workspace" }),
    ).not.toHaveAttribute("aria-current");
  },
};

/**
 * The Masters and Workspace fold-out arrows sit on their rows' centre line
 * (#99), open (Masters, on its page) and folded (Workspace). On a phone
 * the menu is in the Sidebar sheet.
 */
export const SubmenuArrowsCentred: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/contractors" } },
  },
  render: () => (
    <AppShell>
      <p>Contractors</p>
    </AppShell>
  ),
  play: async (context) => {
    const nav = await mainMenu(context);
    const arrows = [
      nav.getByRole("button", { name: "Hide Masters list" }),
      nav.getByRole("button", { name: "Show Workspace list" }),
    ];
    for (const arrow of arrows) {
      const row = arrow.parentElement?.querySelector(
        "[data-sidebar=menu-button]",
      );
      if (row == null) throw new Error(`${arrow.ariaLabel ?? ""} has no row`);
      const a = arrow.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      await expect(
        Math.abs(a.top + a.height / 2 - (r.top + r.height / 2)),
      ).toBeLessThan(0.5);
    }
  },
};

export const NoActiveCompany: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
  },
  play: async (context) => {
    const sidebar = await openSidebar(context);
    await expect(
      sidebar.getByRole("button", { name: /Active Company: none/ }),
    ).toHaveTextContent("No Company");
  },
};

export const SwitchCompany: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
    authMocks.companies = [
      ...authMocks.companies,
      { id: "company_sri", name: "Sri Infra", role: "member" },
    ];
  },
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const sidebar = await openSidebar(context);
    const fetchMock = fn(() =>
      Promise.resolve(Response.json({ activeCompanyId: "company_sri" })),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const switcher = sidebar.getByRole("button", {
        name: /Active Company: Anugraha Engineers/,
      });
      await expect(switcher).toHaveTextContent("Construction Management");
      await userEvent.click(switcher);
      const menu = within(
        await within(canvasElement.ownerDocument.body).findByRole("menu"),
      );
      await expect(menu.getByText("Your Companies")).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: /Anugraha Engineers/ }),
      ).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: /Create a Company/ }),
      ).toHaveAttribute("href", "/create-company");
      await userEvent.click(menu.getByRole("menuitem", { name: "Sri Infra" }));
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
      await expect(fetchMock).toHaveBeenCalledWith(
        "/api/construction/organization/companies/company_sri/switch",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      globalThis.fetch = original;
    }
  },
};

/** The account menu is the sidebar's account row `…` (ADR-0049, ADR-0050). */
export const AccountMenuSignOut: Story = {
  ...shellAt("/app/projects"),
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const sidebar = await openSidebar(context);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      sidebar.getByRole("button", {
        name: "Account menu for Arun Selva Kumar",
      }),
    );
    const menu = within(await body.findByRole("menu"));
    await waitFor(() =>
      expect(menu.getByText("muthu@anugrahaengineers.in")).toBeVisible(),
    );
    await userEvent.click(menu.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/sign-in"),
    );
    await expect(authMocks.signOut).toHaveBeenCalledWith("/sign-in");
  },
};
