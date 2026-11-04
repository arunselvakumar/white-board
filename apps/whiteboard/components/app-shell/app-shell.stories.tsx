import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppEmptyPage } from "@/components/app-shell/app-empty-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV } from "@/lib/app-nav";
import { expectAppShell } from "../../.storybook/expect-app-shell";
import { expectNavIconMotion } from "../../.storybook/expect-nav-icon-motion";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";

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
    await expectAppShell(canvas, canvasElement, userEvent, APP_NAV[0]);
    await expect(
      canvas.queryByRole("link", { name: "Switch Workspace" }),
    ).not.toBeInTheDocument();
  },
};

/**
 * Hover a nav item, or tab to it: its icon plays a short animation (the
 * clock hand ticks round, the bars grow, the cap tosses). The motion lives
 * in `@repo/ui` (sidebar-icon-motion.css, #114); story tests run without
 * motion, so the play checks every nav icon has a motion of its own.
 */
export const NavIconMotion: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(
        body.getByRole("button", { name: "Toggle Sidebar" }),
      );
    }
    const nav = body.getByRole("navigation", { name: "Main" });
    await expect(within(nav).getAllByRole("link")).toHaveLength(APP_NAV.length);
    await expectNavIconMotion(nav);
  },
};

export const AccountMenuSignOut: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Arun" }),
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
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Riverside Centre")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Account menu/ }),
    ).not.toBeInTheDocument();
  },
};

export const MultipleWorkspaces: Story = {
  beforeEach() {
    authMocks.workspaces = [
      ...authMocks.workspaces,
      {
        id: "org_harbor",
        name: "Harbor Academy",
        role: "teacher",
        institutionType: "training_institute",
      },
    ];
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "Switch Workspace" }),
    ).toHaveAttribute("href", "/select-workspace");
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
    const mainNav = body.getByRole("navigation", { name: "Main" });
    const nav = within(mainNav);
    await expect(nav.getAllByRole("link")).toHaveLength(6);
    await expectNavIconMotion(mainNav);
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
    const sidebarTrigger = body.getByRole("button", { name: "Toggle Sidebar" });
    const isMobile =
      (canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768;
    if (isMobile) {
      await userEvent.click(sidebarTrigger);
    }
    const sidebar = isMobile
      ? await body.findByRole("dialog")
      : canvasElement.ownerDocument.querySelector(
          '[data-slot="sidebar-inner"]',
        );
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error("Sidebar is missing");
    }
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
