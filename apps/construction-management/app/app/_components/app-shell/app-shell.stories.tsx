import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { AppAreaPage } from "@/app/app/_components/app-shell/app-area-page";
import { AppShell } from "@/app/app/_components/app-shell/app-shell";
import { APP_NAV, appPageByHref, type AppNavHref } from "@/lib/app-nav";
import { HUMAN_RESOURCES, MARKETING_DEPARTMENT } from "@/lib/departments-nav";
import {
  FULL_MARKETING_ACCESS,
  NO_MARKETING_ACCESS,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";
import { LABOURS_PAGE_PATH } from "@/lib/staff-nav";

import { authMocks, signInAs } from "@/.storybook/mocks/auth";

function shellAt(
  href: AppNavHref,
  canOpenDashboard = true,
  canOpenStaffRoles = true,
  marketing: MarketingMenuAccess = FULL_MARKETING_ACCESS,
) {
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    render: () => (
      <AppShell
        canOpenDashboard={canOpenDashboard}
        canOpenStaffRoles={canOpenStaffRoles}
        marketing={marketing}
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

async function mainMenu(context: PlayContext) {
  const sidebar = await openSidebar(context);
  return within(await sidebar.findByRole("navigation", { name: "Main" }));
}

/**
 * The Switch Company modal, opened from the foot of the sidebar. A modal
 * starts transparent, so checks wait until it has finished opening.
 */
async function openSwitchCompany(context: PlayContext) {
  const { canvasElement, userEvent } = context;
  const sidebar = await openSidebar(context);
  await userEvent.click(
    sidebar.getByRole("button", { name: /^Switch Company/ }),
  );
  const modal = await within(canvasElement.ownerDocument.body).findByRole(
    "dialog",
    { name: "Switch Company" },
  );
  await waitFor(() => expect(modal).toBeVisible());
  return within(modal);
}

/**
 * The area's page beside the sidebar, and the sidebar's Switch Company row
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
  // <main> hosts the page's watermark.
  const main = canvas.getByRole("main");
  await expect(getComputedStyle(main).isolation).toBe("isolate");
  await expect(getComputedStyle(main).overflowX).toBe("clip");
  if (isPhone(canvasElement))
    await expect(
      canvas.getByRole("button", { name: /^Notifications/ }),
    ).toBeVisible();
  const sidebar = await openSidebar(context);
  await expect(
    sidebar.getByRole("button", {
      name: "Switch Company. Active Company: Anugraha Engineers",
    }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /^Notifications/ }),
  ).toBeVisible();
  const nav = within(sidebar.getByRole("navigation", { name: "Main" }));
  for (const item of APP_NAV)
    await expect(nav.getByRole("link", { name: item.label })).toHaveAttribute(
      "href",
      item.href,
    );
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

/** The Company Dashboard leads the main menu. */
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

/** The top level of the main menu, in order: no submenu rows. */
function topLevelLinks(nav: Awaited<ReturnType<typeof mainMenu>>) {
  return nav
    .getAllByRole("link")
    .filter((link) => link.closest("[data-sidebar=menu-sub]") == null)
    .map((link) => link.textContent);
}

function shellOn(
  pathname: string,
  marketing: MarketingMenuAccess = FULL_MARKETING_ACCESS,
) {
  return {
    parameters: { nextjs: { navigation: { pathname } } },
    render: () => (
      <AppShell canOpenDashboard marketing={marketing}>
        <p>A screen</p>
      </AppShell>
    ),
  };
}

/**
 * Departments (ADR CM-0046) sits after Projects and folds out into Human
 * Resources and Marketing, each a link to its page of cards. Their screens
 * (Labour, HRMS, Visits) are not rows in the sidebar.
 */
export const Departments: Story = {
  ...shellOn("/app/departments"),
  play: async (context) => {
    const nav = await mainMenu(context);
    await expect(topLevelLinks(nav)).toEqual([
      "Dashboard",
      "Projects",
      "Departments",
      "Workspace",
      "Masters",
      "Settings",
    ]);
    await expect(
      nav.getByRole("link", { name: "Departments" }),
    ).toHaveAttribute("aria-current", "page");
    const submenu = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      submenu.getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Human Resources", "Marketing"]);
    for (const department of [HUMAN_RESOURCES, MARKETING_DEPARTMENT])
      await expect(
        submenu.getByRole("link", { name: department.label }),
      ).toHaveAttribute("href", department.href);
    for (const name of ["Labour", "Office Staff", "Attendance", "Visits"])
      await expect(nav.queryByRole("link", { name })).toBeNull();
  },
};

/**
 * Every screen of a department lights its row and keeps Departments open:
 * the department's own page, Staff and HRMS screens for Human Resources,
 * Marketing's pages for Marketing.
 */
export const DepartmentRowLitOnItsScreens: Story = {
  ...shellOn("/app/staff/roles/r1"),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      submenu.getByRole("link", { name: "Human Resources" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      submenu.getByRole("link", { name: "Marketing" }),
    ).not.toHaveAttribute("aria-current");
    await expect(
      nav.getByRole("link", { name: "Departments" }),
    ).not.toHaveAttribute("aria-current");
  },
};

export const HrmsScreenLightsHumanResources: Story = {
  ...shellOn("/app/hrms/attendance/team"),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      submenu.getByRole("link", { name: "Human Resources" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Workspace" }),
    ).not.toHaveAttribute("aria-current");
  },
};

export const MarketingScreenLightsMarketing: Story = {
  ...shellOn("/app/marketing/visits/v1"),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      submenu.getByRole("link", { name: "Marketing" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      submenu.getByRole("link", { name: "Human Resources" }),
    ).not.toHaveAttribute("aria-current");
  },
};

/**
 * A Role with no Marketing menu has only Human Resources under
 * Departments (ADR CM-0040, CM-0046).
 */
export const WithoutMarketing: Story = {
  ...shellOn("/app/departments", NO_MARKETING_ACCESS),
  play: async (context) => {
    const nav = await mainMenu(context);
    const submenu = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      submenu.getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Human Resources"]);
  },
};

/**
 * The menu search still finds a department's screens (ADR CM-0046): they
 * show under Departments, headed by their department; a department whose
 * name matches shows as its row.
 */
export const DepartmentsSearch: Story = {
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

    await userEvent.type(search, "labour");
    const departments = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    const humanResources = within(
      departments.getByRole("list", { name: "Human Resources" }),
    );
    await expect(
      humanResources.getByRole("link", { name: "Labour" }),
    ).toHaveAttribute("href", LABOURS_PAGE_PATH);

    await userEvent.clear(search);
    await userEvent.type(search, "hrms");
    const hrms = within(
      within(await nav.findByRole("list", { name: "Departments" })).getByRole(
        "list",
        { name: "Human Resources" },
      ),
    );
    await expect(
      hrms.getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Dashboard", "Attendance", "Leave", "Salary", "Configuration"]);

    await userEvent.clear(search);
    await userEvent.type(search, "market");
    const marketing = within(
      await nav.findByRole("list", { name: "Departments" }),
    );
    await expect(
      marketing.getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Marketing"]);
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
 * The Masters and Workspace fold-out arrows sit on their rows' centre line,
 * open (Masters, on its page) and folded (Workspace). On a phone the menu
 * is in the Sidebar sheet.
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
      sidebar.getByRole("button", {
        name: "Switch Company. Active Company: none",
      }),
    ).toHaveTextContent("Switch Company");
  },
};

const SRI_INFRA = {
  id: "company_sri",
  name: "Sri Infra",
  role: "member",
} as const;

export const SwitchCompany: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
    authMocks.companies = [...authMocks.companies, SRI_INFRA];
  },
  play: async (context) => {
    const { userEvent } = context;
    const fetchMock = fn(() =>
      Promise.resolve(Response.json({ activeCompanyId: "company_sri" })),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const modal = await openSwitchCompany(context);
      await expect(
        modal.getByText("Pick the Company you want to work in."),
      ).toBeVisible();
      await expect(
        modal.getByRole("button", {
          name: "Anugraha Engineers Owner Current",
        }),
      ).toHaveAttribute("aria-current", "true");
      await expect(
        modal.getByRole("link", { name: "Create a Company" }),
      ).toHaveAttribute("href", "/create-company");
      await userEvent.click(
        modal.getByRole("button", { name: "Sri Infra Team Member" }),
      );
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

/** Picking the current Company closes the modal and switches nothing. */
export const SwitchCompanyCurrent: Story = {
  ...shellAt("/app/projects"),
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const modal = await openSwitchCompany(context);
    await userEvent.click(
      modal.getByRole("button", { name: /^Anugraha Engineers/ }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog", {
          name: "Switch Company",
        }),
      ).not.toBeInTheDocument(),
    );
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

/** A switch that fails says so in the modal, and the rows work again. */
export const SwitchCompanyFails: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
    authMocks.companies = [...authMocks.companies, SRI_INFRA];
  },
  play: async (context) => {
    const { userEvent } = context;
    const original = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ code: "FORBIDDEN" }, { status: 403 }));
    try {
      const modal = await openSwitchCompany(context);
      const row = modal.getByRole("button", { name: "Sri Infra Team Member" });
      await userEvent.click(row);
      await expect(await modal.findByRole("alert")).toHaveTextContent(
        "Could not switch to that Company. Please try again.",
      );
      await expect(row).toBeEnabled();
      await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  },
};

/**
 * The switch answered but the reload never came (a leave-site warning kept
 * the User on the page): closing the modal and opening it again lets them
 * pick again.
 */
export const SwitchCompanyReloadCancelled: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
    authMocks.companies = [...authMocks.companies, SRI_INFRA];
  },
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const original = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ activeCompanyId: "company_sri" }));
    try {
      let modal = await openSwitchCompany(context);
      await userEvent.click(
        modal.getByRole("button", { name: "Sri Infra Team Member" }),
      );
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
      await expect(
        modal.getByRole("button", { name: /^Sri Infra/ }),
      ).toBeDisabled();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          within(canvasElement.ownerDocument.body).queryByRole("dialog", {
            name: "Switch Company",
          }),
        ).not.toBeInTheDocument(),
      );
      // The sidebar (on a phone, its sheet) is still open behind the modal.
      const body = within(canvasElement.ownerDocument.body);
      await userEvent.click(
        body.getByRole("button", { name: /^Switch Company/ }),
      );
      const again = await body.findByRole("dialog", { name: "Switch Company" });
      await waitFor(() => expect(again).toBeVisible());
      modal = within(again);
      await expect(
        modal.getByRole("button", { name: "Sri Infra Team Member" }),
      ).toBeEnabled();
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
