import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { signInAs } from "@/.storybook/mocks/auth";
import { PIXEL_PNG, mockApi } from "@/.storybook/mocks/profile-api";
import { SidebarAccountRow } from "./sidebar-account-row";

/**
 * The account menu, opened from the sidebar's account row (ADR-0049,
 * ADR-0050): the User's avatar, name and email, the notification bell and
 * `…`. On the ink panel, as in the shell.
 */
const meta = {
  title: "App/UserMenu",
  component: SidebarAccountRow,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="bg-sidebar text-sidebar-foreground w-70 rounded-2xl p-3">
        <Story />
      </div>
    ),
  ],
  beforeEach() {
    signInAs("member");
    return mockApi((call) =>
      call.path === "/api/construction/organization/me/profile"
        ? Response.json({ photoUrl: null })
        : undefined,
    ).restore;
  },
} satisfies Meta<typeof SidebarAccountRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InitialsAndMyProfile: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText("AK")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /^Notifications/ }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Arun Selva Kumar" }),
    );
    const menu = within(
      await within(canvasElement.ownerDocument.body).findByRole("menu"),
    );
    // The menu fades in.
    await waitFor(() =>
      expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible(),
    );
    await expect(
      menu.getByRole("menuitem", { name: "My Profile" }),
    ).toHaveAttribute("href", "/app/profile");
    await expect(
      menu.getByRole("menuitem", { name: "Downloads" }),
    ).toHaveAttribute("href", "/app/downloads");
    await expect(
      menu.getByRole("menuitem", { name: "Your Subscription" }),
    ).toHaveAttribute("href", "/app/subscription");
  },
};

export const PhotoFromMyProfile: Story = {
  beforeEach() {
    return mockApi((call) =>
      call.path === "/api/construction/organization/me/profile"
        ? Response.json({ photoUrl: PIXEL_PNG })
        : undefined,
    ).restore;
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("img")).toHaveAttribute(
        "src",
        PIXEL_PNG,
      ),
    );
  },
};
