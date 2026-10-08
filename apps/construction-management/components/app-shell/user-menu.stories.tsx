import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { signInAs } from "../../.storybook/mocks/auth";
import { PIXEL_PNG, mockApi } from "../../.storybook/mocks/profile-api";
import { UserMenu } from "./user-menu";

const meta = {
  title: "App/UserMenu",
  component: UserMenu,
  parameters: { layout: "centered" },
  beforeEach() {
    signInAs("member");
  },
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InitialsAndMyProfile: Story = {
  args: { photoUrl: null },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", {
      name: "Account menu for Ramesh Patil",
    });
    await expect(trigger).toHaveTextContent("RP");
    await userEvent.click(trigger);
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
