import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/app/app/_components/app-shell/app-shell";
import {
  FULL_MARKETING_ACCESS,
  NO_MARKETING_ACCESS,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";

import { signInAs } from "@/.storybook/mocks/auth";

function shellOn(
  pathname: string,
  {
    canOpenStaffRoles = true,
    marketing = FULL_MARKETING_ACCESS,
  }: { canOpenStaffRoles?: boolean; marketing?: MarketingMenuAccess } = {},
) {
  return {
    parameters: { nextjs: { navigation: { pathname } } },
    render: () => (
      <AppShell
        canOpenDashboard
        canOpenStaffRoles={canOpenStaffRoles}
        marketing={marketing}
      >
        <p>A screen</p>
      </AppShell>
    ),
  };
}

const meta = {
  title: "App/DepartmentMenu",
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  ...shellOn("/app/departments/human-resources"),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

/**
 * The sidebar to look in: docked on a wide screen; on a phone (where the
 * tests run) the Sidebar sheet, opened with Toggle Sidebar. The newest
 * sheet is this story's (the last story's may still be closing).
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

async function departmentMenu(context: PlayContext, name: string) {
  const sidebar = await openSidebar(context);
  const nav = await sidebar.findByRole("navigation", { name });
  return { sidebar, nav: within(nav) };
}

function linkNames(list: HTMLElement): (string | null)[] {
  return within(list)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

/**
 * Human Resources (ADR CM-0047): the main menu gives way to Back to Main
 * Menu, the department, then Staff and HRMS, each folding out into its
 * screens.
 */
export const HumanResources: Story = {
  play: async (context) => {
    const { sidebar, nav } = await departmentMenu(context, "Human Resources");
    await expect(
      sidebar.getByRole("link", { name: "Back to Main Menu" }),
    ).toHaveAttribute("href", "/app/departments");
    await expect(
      sidebar.queryByRole("navigation", { name: "Main" }),
    ).toBeNull();
    await expect(sidebar.getByText("Department")).toBeVisible();
    for (const name of ["Staff", "HRMS"])
      await expect(nav.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    await expect(linkNames(nav.getByRole("list", { name: "Staff" }))).toEqual([
      "Labour",
      "Site Engineer",
      "Vendor",
      "Office Staff",
      "Role Management",
    ]);
    await expect(linkNames(nav.getByRole("list", { name: "HRMS" }))).toEqual([
      "Dashboard",
      "Attendance",
      "Leave",
      "Salary",
      "Configuration",
    ]);
    // The department's own page lights none of its screens.
    await expect(
      nav.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
    // Account links stay at the foot.
    await expect(
      sidebar.getByRole("link", { name: "My Profile" }),
    ).toBeInTheDocument();
  },
};

/** A Staff screen, and anything under it, lights its row. */
export const StaffScreenLit: Story = {
  ...shellOn("/app/staff/roles/r1"),
  play: async (context) => {
    const { nav } = await departmentMenu(context, "Human Resources");
    await expect(
      nav.getByRole("link", { name: "Role Management" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(nav.getAllByRole("link", { current: "page" })).toHaveLength(1);
  },
};

/** An HRMS page lights its area, not the HRMS Dashboard above it. */
export const HrmsScreenLit: Story = {
  ...shellOn("/app/hrms/attendance/team"),
  play: async (context) => {
    const { nav } = await departmentMenu(context, "Human Resources");
    const hrms = within(nav.getByRole("list", { name: "HRMS" }));
    await expect(
      hrms.getByRole("link", { name: "Attendance" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      hrms.getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current");
  },
};

/**
 * Without Team Members or Role Management Read, Office Staff and Role
 * Management are left out of Staff (ADR CM-0030).
 */
export const WithoutStaffRoles: Story = {
  ...shellOn("/app/staff/labours", { canOpenStaffRoles: false }),
  play: async (context) => {
    const { nav } = await departmentMenu(context, "Human Resources");
    await expect(linkNames(nav.getByRole("list", { name: "Staff" }))).toEqual([
      "Labour",
      "Site Engineer",
      "Vendor",
    ]);
  },
};

/**
 * Staff folds away by its row; folded, the row carries the highlight of
 * the screen inside it.
 */
export const FoldAGroup: Story = {
  ...shellOn("/app/staff/labours"),
  play: async (context) => {
    const { userEvent } = context;
    const { nav } = await departmentMenu(context, "Human Resources");
    const staff = nav.getByRole("button", { name: "Staff" });
    await userEvent.click(staff);
    await waitFor(() =>
      expect(nav.queryByRole("list", { name: "Staff" })).toBeNull(),
    );
    await expect(staff).toHaveAttribute("aria-expanded", "false");
    await expect(staff).toHaveAttribute("data-active");
    await expect(nav.getByRole("list", { name: "HRMS" })).toBeVisible();
  },
};

/** Marketing has no groups: its screens are plain rows. */
export const Marketing: Story = {
  ...shellOn("/app/marketing/visits/v1"),
  play: async (context) => {
    const { sidebar, nav } = await departmentMenu(context, "Marketing");
    await expect(
      sidebar.getByRole("link", { name: "Back to Main Menu" }),
    ).toBeVisible();
    await expect(
      nav.getAllByRole("link").map((link) => link.textContent),
    ).toEqual([
      "Dashboard",
      "Visits",
      "Follow-ups",
      "Companies",
      "Team",
      "Reports",
    ]);
    await expect(nav.getByRole("link", { name: "Visits" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

/** Only the Marketing entries the Role opens (ADR CM-0040 §1). */
export const MarketingForAMarketingRole: Story = {
  ...shellOn("/app/marketing", {
    marketing: {
      ...NO_MARKETING_ACCESS,
      dashboard: true,
      visits: true,
    },
  }),
  play: async (context) => {
    const { nav } = await departmentMenu(context, "Marketing");
    await expect(
      nav.getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Dashboard", "Visits"]);
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

/**
 * A Role with no Marketing entry keeps the main menu on Marketing's
 * addresses; the screen itself says there is no access.
 */
export const MarketingWithoutAccess: Story = {
  ...shellOn("/app/marketing", { marketing: NO_MARKETING_ACCESS }),
  play: async (context) => {
    const sidebar = await openSidebar(context);
    await expect(
      await sidebar.findByRole("navigation", { name: "Main" }),
    ).toBeVisible();
    await expect(
      sidebar.queryByRole("link", { name: "Back to Main Menu" }),
    ).toBeNull();
  },
};

/**
 * The menu search narrows the department's screens: a group's name keeps
 * all of it, a screen's name keeps that screen. Back to Main Menu stays.
 */
export const Search: Story = {
  play: async (context) => {
    const { userEvent } = context;
    const { sidebar, nav } = await departmentMenu(context, "Human Resources");
    const search = sidebar.getByRole("searchbox", { name: "Search menu" });

    await userEvent.type(search, "leave");
    await waitFor(() =>
      expect(nav.queryByRole("button", { name: "Staff" })).toBeNull(),
    );
    await expect(linkNames(nav.getByRole("list", { name: "HRMS" }))).toEqual([
      "Leave",
    ]);

    await userEvent.clear(search);
    await userEvent.type(search, "staff");
    await waitFor(() =>
      expect(linkNames(nav.getByRole("list", { name: "Staff" }))).toHaveLength(
        5,
      ),
    );
    await expect(nav.queryByRole("button", { name: "HRMS" })).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(await nav.findByText(/No menu/)).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Back to Main Menu" }),
    ).toBeVisible();
  },
};
