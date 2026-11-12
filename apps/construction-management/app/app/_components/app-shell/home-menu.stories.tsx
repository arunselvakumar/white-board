import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/app/app/_components/app-shell/app-shell";
import { HomeMenu } from "@/app/app/_components/app-shell/home-menu";
import {
  MENU_LAYOUT_KEY,
  setMenuLayout,
} from "@/app/app/_components/app-shell/menu-layout";
import { HRMS_PATH, HRMS_SECTIONS } from "@/lib/hrms-nav";
import {
  FULL_MARKETING_ACCESS,
  MARKETING_PATH,
  MARKETING_SECTIONS,
  NO_MARKETING_ACCESS,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";
import { MASTERS_SECTIONS } from "@/lib/masters-nav";
import { LABOURS_PAGE_PATH, staffSections } from "@/lib/staff-nav";

import { signInAs } from "@/.storybook/mocks/auth";

function homeWith(
  canOpenDashboard = true,
  canOpenStaffRoles = true,
  marketing: MarketingMenuAccess = FULL_MARKETING_ACCESS,
) {
  return {
    parameters: { nextjs: { navigation: { pathname: "/app" } } },
    render: () => (
      <AppShell
        canOpenDashboard={canOpenDashboard}
        canOpenStaffRoles={canOpenStaffRoles}
        marketing={marketing}
      >
        <HomeMenu
          canOpenDashboard={canOpenDashboard}
          canOpenStaffRoles={canOpenStaffRoles}
          marketing={marketing}
        />
      </AppShell>
    ),
  };
}

const meta = {
  title: "App/Home",
  tags: ["autodocs"],
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
    // The User picked the full-page menu on this device.
    setMenuLayout("full");
    return () => {
      setMenuLayout("sidebar");
    };
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The full-page menu layout (ADR CM-0039): the whole main menu on one page
 * under a top bar, with no sidebar. Every entry is a link to its page.
 */
export const Home: Story = {
  ...homeWith(),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { name: "Main menu", level: 1 }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Everything in Anugraha Engineers, on one page."),
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-sidebar=sidebar]"),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", {
        name: "Switch Company. Active Company: Anugraha Engineers",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /^Notifications/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /^Account menu for / }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Menu" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    for (const [name, href] of [
      [/^Dashboard/, "/app/dashboard"],
      [/^Projects/, "/app/projects"],
      [/^Settings/, "/app/settings"],
      ["Marketing", MARKETING_PATH],
      ["Human Resources", LABOURS_PAGE_PATH],
      ["Workspace", "/app/workspace"],
      ["Masters", "/app/masters"],
    ] as const)
      await expect(nav.getAllByRole("link", { name })[0]).toHaveAttribute(
        "href",
        href,
      );

    const marketing = within(nav.getByRole("region", { name: "Marketing" }));
    for (const section of MARKETING_SECTIONS)
      await expect(
        marketing.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    const staff = within(nav.getByRole("list", { name: "Staff" }));
    for (const section of staffSections(true))
      await expect(
        staff.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    const hrms = within(nav.getByRole("list", { name: "HRMS" }));
    for (const section of HRMS_SECTIONS)
      await expect(
        hrms.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    const masters = within(nav.getByRole("region", { name: "Masters" }));
    for (const section of MASTERS_SECTIONS)
      await expect(
        masters.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    await expect(
      nav.getByRole("link", { name: "Central Payment" }),
    ).toHaveAttribute("href", "/app/workspace/central-payment");
  },
};

/** Without the Dashboard menu's Read there is no Dashboard card, as in the sidebar. */
export const WithoutDashboard: Story = {
  ...homeWith(false),
  play: async ({ canvas }) => {
    const main = canvas.getByRole("navigation", { name: "Main" });
    const nav = within(main);
    // HRMS has a Dashboard of its own, so look for the Company's by address.
    await expect(main.querySelector('a[href="/app/dashboard"]')).toBeNull();
    await expect(nav.getByRole("link", { name: /^Projects/ })).toBeVisible();
  },
};

/**
 * Without Team Members or Role Management Read, Office Staff and Role
 * Management are left out and Human Resources opens on HRMS (ADR CM-0030,
 * ADR CM-0034).
 */
export const WithoutStaffRoles: Story = {
  ...homeWith(true, false),
  play: async ({ canvas }) => {
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    await expect(
      nav.getByRole("link", { name: "Human Resources" }),
    ).toHaveAttribute("href", HRMS_PATH);
    const staff = within(nav.getByRole("list", { name: "Staff" }));
    await expect(staff.getByRole("link", { name: "Labour" })).toBeVisible();
    await expect(
      staff.queryByRole("link", { name: "Office Staff" }),
    ).toBeNull();
    await expect(
      staff.queryByRole("link", { name: "Role Management" }),
    ).toBeNull();
  },
};

/** A Role with no Marketing menu has no Marketing block (ADR CM-0040 §1). */
export const WithoutMarketing: Story = {
  ...homeWith(true, true, NO_MARKETING_ACCESS),
  play: async ({ canvas }) => {
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    await expect(nav.queryByRole("region", { name: "Marketing" })).toBeNull();
    await expect(nav.queryByRole("link", { name: "Marketing" })).toBeNull();
  },
};

/** The search narrows Home by the sidebar's rule (ADR-0049). */
export const Search: Story = {
  ...homeWith(),
  play: async ({ canvas, userEvent }) => {
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    const search = canvas.getByRole("searchbox", { name: "Search menu" });

    await userEvent.type(search, "payment");
    await expect(
      nav.getByRole("link", { name: "Central Payment" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Payment Categories" }),
    ).toBeVisible();
    await expect(nav.queryByRole("link", { name: /^Projects/ })).toBeNull();
    await expect(nav.queryByRole("link", { name: "Contractors" })).toBeNull();
    await expect(
      nav.queryByRole("link", { name: "Human Resources" }),
    ).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "Masters");
    await expect(nav.getByRole("link", { name: "Contractors" })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(nav.getByText("No menu item matches “zzz”.")).toBeVisible();
    await expect(nav.queryAllByRole("link")).toHaveLength(0);

    await userEvent.clear(search);
    await expect(nav.getByRole("link", { name: /^Projects/ })).toBeVisible();
  },
};

/**
 * Sidebar in the top bar goes back to the sidebar layout and keeps the
 * choice; the main menu stays on the page beside it.
 */
export const BackToSidebar: Story = {
  ...homeWith(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show the menu in the sidebar" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "Menu" })).toBeNull(),
    );
    await expect(window.localStorage.getItem(MENU_LAYOUT_KEY)).toBe("sidebar");
    await expect(
      canvas.getByRole("heading", { name: "Main menu", level: 1 }),
    ).toBeVisible();
  },
};

/**
 * In the sidebar layout (the default), the button beside the menu search
 * switches to the full-page menu, keeps the choice and opens the menu.
 */
export const FromSidebar: Story = {
  ...homeWith(),
  parameters: { nextjs: { navigation: { pathname: "/app/projects" } } },
  beforeEach() {
    setMenuLayout("sidebar");
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const view = canvasElement.ownerDocument.defaultView;
    // On a phone the button is inside the sidebar sheet.
    if (view != null && view.innerWidth < 768)
      await userEvent.click(
        await canvas.findByRole("button", { name: "Toggle Sidebar" }),
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Show the menu on a full page" }),
    );
    await expect(window.localStorage.getItem(MENU_LAYOUT_KEY)).toBe("full");
    await expect(getRouter().push).toHaveBeenCalledWith("/app");
    await waitFor(() =>
      expect(canvas.getByRole("link", { name: "Menu" })).toBeVisible(),
    );
  },
};
