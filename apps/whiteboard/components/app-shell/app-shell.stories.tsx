import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

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
    await expect(canvas.getByRole("link", { name: "Switch Workspace" })).toHaveAttribute(
      "href",
      "/select-workspace",
    );
  },
};

export const StudentNavigation: Story = {
  beforeEach() {
    clerkMocks.orgRole = "org:student";
  },
  render: () => <AppShell><main className="p-6">Hello world</main></AppShell>,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(body.getByRole("button", { name: "Toggle Sidebar" }));
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(nav.getAllByRole("link")).toHaveLength(1);
    await expect(nav.getByRole("link", { name: "Student" })).toHaveAttribute("href", "/student");
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};

export const ParentNavigation: Story = {
  beforeEach() {
    clerkMocks.orgRole = "org:parent";
  },
  render: () => <AppShell><main className="p-6">Hello world</main></AppShell>,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    if ((canvasElement.ownerDocument.defaultView?.innerWidth ?? 1280) < 768) {
      await userEvent.click(body.getByRole("button", { name: "Toggle Sidebar" }));
    }
    const nav = within(body.getByRole("navigation", { name: "Main" }));
    await expect(nav.getAllByRole("link")).toHaveLength(1);
    await expect(nav.getByRole("link", { name: "Parent" })).toHaveAttribute("href", "/parent");
    await expect(canvas.getByText("Hello world")).toBeVisible();
  },
};
