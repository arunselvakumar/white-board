import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppEmptyPage } from "@/components/app-shell/app-empty-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV } from "@/lib/app-nav";
import { expectAppShell } from "../../.storybook/expect-app-shell";
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
      <main className="p-6">Hello world</main>
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
    await expect(nav.getAllByRole("link")).toHaveLength(5);
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
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};

export const ParentNavigation: Story = {
  beforeEach() {
    signInAs("parent", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <main className="p-6">Hello world</main>
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
    await expect(nav.getAllByRole("link")).toHaveLength(5);
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
    ).toBe("rgb(241, 242, 248)");
    await expect(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
        .backgroundColor,
    ).toBe("rgb(255, 255, 255)");
    const toggle = body.getByRole("switch", { name: "Dark mode" });

    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await waitFor(() => expect(root).toHaveClass("dark"));
    await waitFor(() =>
      expect(
        canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
          .backgroundColor,
      ).toBe("rgb(22, 24, 34)"),
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
