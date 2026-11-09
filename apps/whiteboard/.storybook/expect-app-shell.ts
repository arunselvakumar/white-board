import { expect, waitFor, within } from "storybook/test";

import { APP_NAV, type AppNavItem } from "../lib/app-nav";

type UserEvent = {
  click: (element: HTMLElement) => Promise<void>;
};

type Canvas = {
  getByRole: (role: string, options?: { name: string | RegExp }) => HTMLElement;
  queryByRole: (
    role: string,
    options?: { name: string | RegExp },
  ) => HTMLElement | null;
  findByRole: (
    role: string,
    options?: { name: string | RegExp },
  ) => Promise<HTMLElement>;
  getByText: (text: string) => HTMLElement;
};

/**
 * Opens the sidebar where it is a sheet (below `md`) and returns it; from
 * `md` up it is already beside the page. The shell's chrome lives in it
 * (ADR-0050): the account row, the menu, Switch Workspace. The newest
 * sheet is this story's (the last story's may still be closing), and a sheet
 * starts transparent, so checks wait until it has finished opening.
 */
export async function openSidebar(
  canvasElement: HTMLElement,
  userEvent: UserEvent,
): Promise<HTMLElement> {
  const document = canvasElement.ownerDocument;
  const body = within(document.body);
  if ((document.defaultView?.innerWidth ?? 1280) < 768) {
    await userEvent.click(body.getByRole("button", { name: "Toggle Sidebar" }));
    const sheets = await body.findAllByRole("dialog", { name: "Sidebar" });
    const sheet = sheets[sheets.length - 1];
    if (sheet == null) throw new Error("The Sidebar sheet did not open");
    await waitFor(() => expect(sheet).toBeVisible());
    return sheet;
  }
  const sidebar = document.querySelector('[data-slot="sidebar-inner"]');
  if (!(sidebar instanceof HTMLElement)) throw new Error("Sidebar is missing");
  return sidebar;
}

/**
 * Opens the Switch Workspace modal from the foot of the sidebar and returns
 * it. A modal starts transparent, so checks wait until it has finished
 * opening.
 */
export async function openSwitchWorkspace(
  canvasElement: HTMLElement,
  userEvent: UserEvent,
): Promise<HTMLElement> {
  const sidebar = within(await openSidebar(canvasElement, userEvent));
  await userEvent.click(
    sidebar.getByRole("button", { name: /^Switch Workspace/ }),
  );
  const modal = await within(canvasElement.ownerDocument.body).findByRole(
    "dialog",
    { name: "Switch Workspace" },
  );
  await waitFor(() => expect(modal).toBeVisible());
  return modal;
}

export async function expectAppShell(
  canvas: Canvas,
  canvasElement: HTMLElement,
  userEvent: UserEvent,
  current: AppNavItem,
): Promise<void> {
  await expect(
    canvas.getByRole("heading", { name: current.title }),
  ).toBeVisible();
  await expect(canvas.getByText(current.description)).toBeVisible();

  const scope: Canvas = within(await openSidebar(canvasElement, userEvent));
  await expect(
    scope.getByRole("button", {
      name: "Switch Workspace. Active Workspace: Riverside Centre",
    }),
  ).toBeVisible();
  await expect(
    scope.getByRole("button", { name: "Account menu for Arun" }),
  ).toBeVisible();

  const mainNav = within(scope.getByRole("navigation", { name: "Main" }));
  for (const item of APP_NAV) {
    const link = mainNav.getByRole("link", { name: item.label });
    await expect(link).toHaveAttribute("href", item.href);
  }

  await expect(
    mainNav.getByRole("link", { name: current.label }),
  ).toHaveAttribute("aria-current", "page");
}
