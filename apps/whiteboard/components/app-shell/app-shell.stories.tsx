import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppEmptyPage } from "@/components/app-shell/app-empty-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV } from "@/lib/app-nav";
import { expectAppShell } from "../../.storybook/expect-app-shell";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Workspace/AppShell",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      {
        organization: { id: "org_riverside", name: "Riverside Centre" },
      },
    ];
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
  },
};

export const MultipleWorkspaces: Story = {
  beforeEach() {
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside Centre" } },
      { organization: { id: "org_harbor", name: "Harbor Academy" } },
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
    clerkMocks.orgRole = "org:student";
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
    await expect(nav.getAllByRole("link")).toHaveLength(3);
    await expect(nav.getByRole("link", { name: "Student" })).toHaveAttribute(
      "href",
      "/student",
    );
    await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    await expect(nav.getByRole("link", { name: "Online Classes" })).toHaveAttribute(
      "href",
      "/online-classes",
    );
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};

export const ParentNavigation: Story = {
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
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
    await expect(nav.getAllByRole("link")).toHaveLength(3);
    await expect(nav.getByRole("link", { name: "Parent" })).toHaveAttribute(
      "href",
      "/parent",
    );
    await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    await expect(nav.getByRole("link", { name: "Online Classes" })).toHaveAttribute(
      "href",
      "/online-classes",
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
      expect(within(sidebar).getByText("SESSIONS")).toBeVisible(),
    );
    const activeNav = within(sidebar).getByRole("link", {
      name: "Dashboard",
    });
    await expect(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(activeNav)
        .backgroundColor,
    ).toBe("rgb(102, 90, 199)");
    await expect(
      canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
        .backgroundColor,
    ).toBe("rgb(32, 26, 62)");
    const toggle = body.getByRole("switch", { name: "Dark mode" });

    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await waitFor(() => expect(root).toHaveClass("dark"));
    await waitFor(() =>
      expect(
        canvasElement.ownerDocument.defaultView?.getComputedStyle(sidebar)
          .backgroundColor,
      ).toBe("rgb(22, 18, 43)"),
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
