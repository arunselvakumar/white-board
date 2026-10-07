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
  await expect(canvas.getByText("Riverside Centre")).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: "Account menu for Arun" }),
  ).toBeVisible();

  const view = canvasElement.ownerDocument.defaultView;
  let scope: Canvas = canvas;
  if (view != null && view.innerWidth < 768) {
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle Sidebar" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
    );
    scope = within(dialog);
  }

  const mainNav = within(scope.getByRole("navigation", { name: "Main" }));
  for (const item of APP_NAV) {
    const link = mainNav.getByRole("link", { name: item.label });
    await expect(link).toHaveAttribute("href", item.href);
  }

  await expect(
    mainNav.getByRole("link", { name: current.label }),
  ).toHaveAttribute("aria-current", "page");
}
