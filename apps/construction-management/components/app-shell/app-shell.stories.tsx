import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppAreaPage } from "@/components/app-shell/app-area-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV, type AppNavHref } from "@/lib/app-nav";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";

function shellAt(href: AppNavHref) {
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    render: () => (
      <AppShell>
        <AppAreaPage href={href} />
      </AppShell>
    ),
  };
}

const meta = {
  title: "App/AppShell",
  tags: ["autodocs"],
  beforeEach() {
    signInAs("owner", { name: "Patil Builders" });
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
  await expect(canvas.getByLabelText("Active Company")).toHaveTextContent(
    "Patil Builders",
  );
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
    await expectArea(canvasElement, APP_NAV[0]);
  },
};

export const Workspace: Story = {
  ...shellAt("/app/workspace"),
  play: async ({ canvasElement }) => {
    await expectArea(canvasElement, APP_NAV[1]);
  },
};

export const Masters: Story = {
  ...shellAt("/app/masters"),
  play: async ({ canvasElement }) => {
    await expectArea(canvasElement, APP_NAV[2]);
  },
};

export const NoActiveCompany: Story = {
  ...shellAt("/app/projects"),
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Active Company")).toHaveTextContent(
      "No Company",
    );
  },
};

export const AccountMenuSignOut: Story = {
  ...shellAt("/app/projects"),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Ramesh Patil" }),
    );
    const menu = within(await body.findByRole("menu"));
    await waitFor(() =>
      expect(menu.getByText("ramesh@patilbuilders.in")).toBeVisible(),
    );
    await userEvent.click(menu.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/sign-in"),
    );
    await expect(authMocks.signOut).toHaveBeenCalledWith("/sign-in");
  },
};
