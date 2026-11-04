import { expect, within } from "storybook/test";

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
 * (ADR-0050): the Workspace switcher, the account row, the menu.
 */
export async function openSidebar(
  canvasElement: HTMLElement,
  userEvent: UserEvent,
): Promise<HTMLElement> {
  const document = canvasElement.ownerDocument;
  const body = within(document.body);
  if ((document.defaultView?.innerWidth ?? 1280) < 768) {
    await userEvent.click(body.getByRole("button", { name: "Toggle Sidebar" }));
    return body.findByRole("dialog");
  }
  const sidebar = document.querySelector('[data-slot="sidebar-inner"]');
  if (!(sidebar instanceof HTMLElement)) throw new Error("Sidebar is missing");
  return sidebar;
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
      name: "Active Workspace: Riverside Centre. Switch Workspace",
    }),
  ).toBeVisible();
  await expect(scope.getByText("Riverside Centre")).toBeVisible();
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
