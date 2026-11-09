import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppEmptyPage } from "@/components/app-shell/app-empty-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV } from "@/lib/app-nav";
import {
  expectAppShell,
  openSidebar,
  openSwitchWorkspace,
} from "../../.storybook/expect-app-shell";
import { authFailure, authMocks, signInAs } from "../../.storybook/mocks/auth";

const meta = {
  title: "Workspace/AppShell",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <AppEmptyPage href="/" />
    </AppShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const breadcrumb = within(
      canvas.getByRole("navigation", { name: "Breadcrumb" }),
    );
    await expect(
      breadcrumb.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("aria-current", "page");
    // No top bar from md up (ADR-0050): on a phone, only the slim bar.
    const isMobile =
      (canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768;
    await expect(canvas.queryAllByRole("banner")).toHaveLength(
      isMobile ? 1 : 0,
    );
    await expectAppShell(canvas, canvasElement, userEvent, APP_NAV[0]);
  },
};

/**
 * Switch Workspace opens even with one Workspace, and shows it as the
 * current one; picking it again closes the modal and switches nothing.
 */
export const OneWorkspace: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const modal = await openSwitchWorkspace(canvasElement, userEvent);
    await expect(
      within(modal).getByText("Pick the Workspace you want to work in."),
    ).toBeVisible();
    const row = within(modal).getByRole("button", {
      name: /^Riverside Centre/,
    });
    await expect(row).toHaveAccessibleName("Riverside Centre Owner Current");
    await expect(row).toHaveAttribute("aria-current", "true");
    await userEvent.click(row);
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Switch Workspace" }),
      ).not.toBeInTheDocument(),
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const AccountMenuSignOut: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    await userEvent.click(
      sidebar.getByRole("button", { name: "Account menu for Arun" }),
    );
    const menu = within(await body.findByRole("menu"));
    await waitFor(() =>
      expect(menu.getByText("arun@example.com")).toBeVisible(),
    );
    await userEvent.click(menu.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/login"),
    );
    await expect(authMocks.signOut).toHaveBeenCalledWith("/login");
  },
};

export const WithoutUser: Story = {
  beforeEach() {
    authMocks.user = null;
  },
  play: async ({ canvasElement, userEvent }) => {
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    await expect(sidebar.getByText("Whiteboard")).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("button", {
        name: /Account menu/,
      }),
    ).not.toBeInTheDocument();
  },
};

const HARBOR_ACADEMY = {
  id: "org_harbor",
  name: "Harbor Academy",
  role: "teacher",
  institutionType: "training_institute",
} as const;

export const MultipleWorkspaces: Story = {
  beforeEach() {
    authMocks.workspaces = [...authMocks.workspaces, HARBOR_ACADEMY];
  },
  play: async ({ canvasElement, userEvent }) => {
    const modal = within(await openSwitchWorkspace(canvasElement, userEvent));
    await expect(modal.getByRole("list")).toBeVisible();
    await expect(modal.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      modal.getByRole("button", { name: "Riverside Centre Owner Current" }),
    ).toBeVisible();
    await userEvent.click(
      modal.getByRole("button", { name: "Harbor Academy Teacher" }),
    );
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith("org_harbor", "/"),
    );
  },
};

/** A switch that fails says so in the modal, and the rows work again. */
export const SwitchWorkspaceFails: Story = {
  beforeEach() {
    authMocks.workspaces = [...authMocks.workspaces, HARBOR_ACADEMY];
    authMocks.setActive.mockImplementation(() => authFailure("FORBIDDEN", 403));
  },
  play: async ({ canvasElement, userEvent }) => {
    const modal = within(await openSwitchWorkspace(canvasElement, userEvent));
    const row = modal.getByRole("button", { name: "Harbor Academy Teacher" });
    await userEvent.click(row);
    await expect(await modal.findByRole("alert")).toHaveTextContent(
      "Could not switch to that Workspace. Please try again.",
    );
    await expect(row).toBeEnabled();
  },
};

/**
 * The switch answered but the reload never came (a leave-site warning kept
 * the User on the page): closing the modal and opening it again lets them
 * pick again.
 */
export const SwitchWorkspaceReloadCancelled: Story = {
  beforeEach() {
    authMocks.workspaces = [...authMocks.workspaces, HARBOR_ACADEMY];
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    let modal = within(await openSwitchWorkspace(canvasElement, userEvent));
    await userEvent.click(
      modal.getByRole("button", { name: "Harbor Academy Teacher" }),
    );
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith("org_harbor", "/"),
    );
    await expect(
      modal.getByRole("button", { name: /^Harbor Academy/ }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Switch Workspace" }),
      ).not.toBeInTheDocument(),
    );
    // The sidebar (on a phone, its sheet) is still open behind the modal.
    await userEvent.click(
      body.getByRole("button", { name: /^Switch Workspace/ }),
    );
    const again = await body.findByRole("dialog", { name: "Switch Workspace" });
    await waitFor(() => expect(again).toBeVisible());
    modal = within(again);
    await expect(
      modal.getByRole("button", { name: "Harbor Academy Teacher" }),
    ).toBeEnabled();
  },
};

export const StudentNavigation: Story = {
  beforeEach() {
    signInAs("student", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <div className="p-6">Hello world</div>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(nav.getAllByRole("link")).toHaveLength(6);
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/student",
    );
    await expect(nav.getByRole("link", { name: "Homework" })).toHaveAttribute(
      "href",
      "/student/homework",
    );
    await expect(nav.getByRole("link", { name: "Results" })).toHaveAttribute(
      "href",
      "/student/results",
    );
    await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    await expect(
      nav.getByRole("link", { name: "Online Classes" }),
    ).toHaveAttribute("href", "/online-classes");
    await expect(nav.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/reports",
    );
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};

export const ParentNavigation: Story = {
  beforeEach() {
    signInAs("parent", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <div className="p-6">Hello world</div>
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(nav.getAllByRole("link")).toHaveLength(6);
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/parent",
    );
    await expect(nav.getByRole("link", { name: "Homework" })).toHaveAttribute(
      "href",
      "/parent/homework",
    );
    await expect(nav.getByRole("link", { name: "Results" })).toHaveAttribute(
      "href",
      "/parent/results",
    );
    await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    await expect(
      nav.getByRole("link", { name: "Online Classes" }),
    ).toHaveAttribute("href", "/online-classes");
    await expect(nav.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/reports",
    );
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};

export const ThemePreference: Story = {
  parameters: { dynamicTheme: true },
  play: async ({ canvasElement, userEvent }) => {
    const root = canvasElement.ownerDocument.documentElement;
    const body = within(canvasElement.ownerDocument.body);
    const sidebar = await openSidebar(canvasElement, userEvent);
    await waitFor(() =>
      expect(within(sidebar).getByText("Main menu")).toBeVisible(),
    );
    const activeNav = within(sidebar).getByRole("link", {
      name: "Dashboard",
    });
    await expect(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(activeNav)
        .backgroundColor,
    ).toBe("rgb(107, 114, 220)");
    await expect(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
        .backgroundColor,
    ).toBe("rgb(19, 20, 27)");
    const toggle = body.getByRole("switch", { name: "Dark mode" });

    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await waitFor(() => expect(root).toHaveClass("dark"));
    await waitFor(() =>
      expect(
        canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
          .backgroundColor,
      ).toBe("rgb(13, 14, 20)"),
    );
    await expect(
      canvasElement.ownerDocument.defaultView?.localStorage.getItem(
        "whiteboard-theme",
      ),
    ).toContain('"theme":"dark"');

    await userEvent.click(toggle);
    await expect(toggle).not.toBeChecked();
    await waitFor(() => expect(root).not.toHaveClass("dark"));
  },
};

/**
 * The menu search narrows the Main navigation by label (ADR-0049): a row
 * stays while its label contains the text, ignoring case; nothing matching
 * says so; clearing the box brings every row back.
 */
export const MenuSearch: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const search = body.getByRole("searchbox", { name: "Search menu" });
    const nav = within(body.getByRole("navigation", { name: "Main" }));

    await userEvent.type(search, "en");
    await expect(nav.getByRole("link", { name: "Students" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Enquiries" })).toBeVisible();
    await expect(nav.queryByRole("link", { name: "Dashboard" })).toBeNull();
    await expect(nav.queryByRole("link", { name: "Fees" })).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(nav.getByText("No menu item matches “zzz”.")).toBeVisible();

    await userEvent.clear(search);
    await expect(nav.getAllByRole("link")).toHaveLength(APP_NAV.length);
  },
};

/** The Owner Dashboard's answer that the sidebar reads its figures from. */
const DASHBOARD = {
  activeStudentCount: 21,
  outstandingDuesPaise: 4_400_000,
  feeFollowUpsDueCount: 3,
  todayBatches: [
    {
      id: "660e8400-e29b-41d4-a716-446655440002",
      name: "DCA Morning",
      courseId: "770e8400-e29b-41d4-a716-446655440000",
      classMode: "offline",
      capacity: 12,
      enrolledCount: 9,
      timings: [
        { daysOfWeek: [1, 2, 3], startTime: "09:00", endTime: "10:30" },
      ],
      todayClasses: [
        { startTime: "09:00", endTime: "10:30", rescheduled: false },
      ],
    },
    {
      id: "660e8400-e29b-41d4-a716-446655440003",
      name: "Tally Evening",
      courseId: "770e8400-e29b-41d4-a716-446655440001",
      classMode: "hybrid",
      capacity: 8,
      enrolledCount: 1,
      timings: [
        { daysOfWeek: [1, 3, 5], startTime: "18:00", endTime: "19:30" },
      ],
      todayClasses: [
        { startTime: "18:00", endTime: "19:30", rescheduled: false },
      ],
    },
  ],
  recentStudents: [],
};

/** Answers the Owner Dashboard read; everything else goes to the real fetch. */
function mockDashboardApi() {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const { pathname } = new URL(href, window.location.origin);
    if (pathname !== "/api/training-institute/dashboard")
      return original(input, init);
    return Promise.resolve(
      new Response(JSON.stringify(DASHBOARD), {
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * An Owner's sidebar carries real figures from the Owner Dashboard
 * (ADR-0049, "real numbers only"): active Students on Students, today's
 * Batches on Batches, Fee Follow-ups due as the red pill on Fees, and the
 * Today card with how full today's seats are. A screen reader hears each
 * figure with its meaning.
 */
export const OwnerCounts: Story = {
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
    return mockDashboardApi();
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(
      await nav.findByRole("link", { name: "Students 21 active Students" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Batches 2 Batches today" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Fees 3 Fee Follow-ups due" }),
    ).toBeVisible();
    await expect(body.getByText("Today's Batches")).toBeVisible();
    await expect(body.getByText("2 Batches · 10 of 20 seats")).toBeVisible();
    await expect(body.getByText("50%")).toBeVisible();
  },
};

/** A Teacher's sidebar never reads the Owner Dashboard, so it carries no figures. */
export const TeacherWithoutCounts: Story = {
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
    return mockDashboardApi();
  },
  render: () => (
    <AppShell>
      <div className="p-6">Hello world</div>
    </AppShell>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    await expect(body.queryByText("Today's Batches")).not.toBeInTheDocument();
    await expect(
      body.queryByRole("link", { name: /active Students/ }),
    ).not.toBeInTheDocument();
  },
};

/**
 * A Teacher's bell sits beside the account menu in the sidebar from `md`
 * up, and in the phone bar below it (ADR-0050).
 */
export const TeacherBell: Story = {
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      const phoneBar = within(canvas.getByRole("banner"));
      await expect(
        phoneBar.getByRole("button", { name: /^Notifications/ }),
      ).toBeVisible();
      await expect(
        phoneBar.queryByRole("button", { name: /Account menu/ }),
      ).toBeNull();
      return;
    }
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    const bell = sidebar.getByRole("button", { name: /^Notifications/ });
    const account = sidebar.getByRole("button", {
      name: "Account menu for Arun",
    });
    await expect(bell).toBeVisible();
    await expect(bell.parentElement).toBe(account.parentElement);
  },
};
