import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { AppAreaPage } from "@/components/app-shell/app-area-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV, appPageByHref, type AppNavHref } from "@/lib/app-nav";
import { HRMS_SECTIONS } from "@/lib/hrms-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";

function shellAt(href: AppNavHref, canOpenDashboard = true) {
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    render: () => (
      <AppShell canOpenDashboard={canOpenDashboard}>
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

async function expectArea(
  canvasElement: HTMLElement,
  current: (typeof APP_NAV)[number],
) {
  const canvas = within(canvasElement);
  await expect(
    canvas.getByRole("heading", { name: current.title }),
  ).toBeVisible();
  await expect(canvas.getByText("Nothing here yet")).toBeVisible();
  await expect(canvas.getByText(current.description)).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: /Active Company: Anugraha Engineers/ }),
  ).toBeVisible();
  const view = canvasElement.ownerDocument.defaultView;
  if (view != null && view.innerWidth >= 768) {
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    for (const item of APP_NAV) {
      await expect(nav.getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
    await expect(
      nav.getByRole("link", { name: current.label }),
    ).toHaveAttribute("aria-current", "page");
  }
}

export const Projects: Story = {
  ...shellAt("/app/projects"),
  play: async ({ canvasElement }) => {
    await expectArea(canvasElement, appPageByHref("/app/projects"));
  },
};

export const Workspace: Story = {
  ...shellAt("/app/workspace"),
  play: async ({ canvasElement }) => {
    await expectArea(canvasElement, appPageByHref("/app/workspace"));
  },
};

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

/**
 * The main menu: docked on a wide screen; on a phone (where the tests run)
 * inside the Sidebar sheet, opened with Toggle Sidebar.
 */
async function mainMenu({ canvas, canvasElement, userEvent }: PlayContext) {
  const view = canvasElement.ownerDocument.defaultView;
  let sidebar = within(canvasElement);
  if (view != null && view.innerWidth < 768) {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Toggle Sidebar" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const sheets = await body.findAllByRole("dialog", { name: "Sidebar" });
    const sheet = sheets[sheets.length - 1];
    if (sheet == null) throw new Error("The Sidebar sheet did not open");
    await waitFor(() => expect(sheet).toBeVisible());
    sidebar = within(sheet);
  }
  return within(await sidebar.findByRole("navigation", { name: "Main" }));
}

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

export const MastersSubmenu: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/designations" } },
  },
  render: () => (
    <AppShell>
      <p>Designations</p>
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
      submenu.getByRole("link", { name: "Designations" }),
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

export const WorkspaceSubmenu: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: "/app/workspace/hrms/attendance/team" },
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
    const submenu = within(nav.getByRole("list", { name: "Workspace" }));
    const hrms = within(submenu.getByRole("list", { name: "HRMS" }));
    for (const section of HRMS_SECTIONS)
      await expect(
        hrms.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    await expect(
      hrms.getByRole("link", { name: "Attendance" }),
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
    nextjs: { navigation: { pathname: "/app/masters/designations" } },
  },
  render: () => (
    <AppShell>
      <p>Designations</p>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    let sidebar = canvas;
    const view = canvasElement.ownerDocument.defaultView;
    if (view != null && view.innerWidth < 768) {
      await userEvent.click(
        await canvas.findByRole("button", { name: "Toggle Sidebar" }),
      );
      const body = within(canvasElement.ownerDocument.body);
      const sheets = await body.findAllByRole("dialog", { name: "Sidebar" });
      const sheet = sheets[sheets.length - 1];
      if (sheet == null) throw new Error("The Sidebar sheet did not open");
      await waitFor(() => expect(sheet).toBeVisible());
      sidebar = within(sheet);
    }
    const nav = within(sidebar.getByRole("navigation", { name: "Main" }));
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
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /Active Company: none/ }),
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    const fetchMock = fn(() =>
      Promise.resolve(Response.json({ activeCompanyId: "company_sri" })),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await userEvent.click(
        canvas.getByRole("button", {
          name: /Active Company: Anugraha Engineers/,
        }),
      );
      const menu = within(
        await within(canvasElement.ownerDocument.body).findByRole("menu"),
      );
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

export const AccountMenuSignOut: Story = {
  ...shellAt("/app/projects"),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Arun Selva Kumar" }),
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
