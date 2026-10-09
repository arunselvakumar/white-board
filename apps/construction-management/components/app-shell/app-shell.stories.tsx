import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { AppAreaPage } from "@/components/app-shell/app-area-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV, type AppNavHref } from "@/lib/app-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";

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
  await expect(
    canvas.getByRole("button", { name: /Active Company: Patil Builders/ }),
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
    await expectArea(canvasElement, APP_NAV[0]);
  },
};

export const Workspace: Story = {
  ...shellAt("/app/workspace"),
  play: async ({ canvasElement }) => {
    await expectArea(canvasElement, APP_NAV[1]);
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
    signInAs("owner", { name: "Patil Builders" });
    authMocks.companies = [
      ...authMocks.companies,
      { id: "company_shree", name: "Shree Infra", role: "member" },
    ];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const fetchMock = fn(() =>
      Promise.resolve(Response.json({ activeCompanyId: "company_shree" })),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: /Active Company: Patil Builders/ }),
      );
      const menu = within(
        await within(canvasElement.ownerDocument.body).findByRole("menu"),
      );
      await expect(
        menu.getByRole("menuitem", { name: /Create a Company/ }),
      ).toHaveAttribute("href", "/create-company");
      await userEvent.click(
        menu.getByRole("menuitem", { name: "Shree Infra" }),
      );
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
      await expect(fetchMock).toHaveBeenCalledWith(
        "/api/construction/organization/companies/company_shree/switch",
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
