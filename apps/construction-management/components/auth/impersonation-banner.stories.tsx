import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { ImpersonationBanner } from "./impersonation-banner";

const meta = {
  title: "Auth/ImpersonationBanner",
  component: ImpersonationBanner,
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="h-24 [--impersonation-bar:2.25rem]">
      <ImpersonationBanner />
    </div>
  ),
} satisfies Meta<typeof ImpersonationBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Impersonating: Story = {
  beforeEach() {
    signInAs("owner");
    authMocks.impersonatedBy = "arun@white-board.io";
  },
  play: async ({ canvas: page, userEvent }) => {
    const banner = await page.findByRole("status");
    await expect(banner).toHaveTextContent(
      "You are signed in as muthu@anugrahaengineers.in",
    );
    await expect(banner).toHaveTextContent(
      "Impersonated by arun@white-board.io",
    );
    await userEvent.click(page.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(authMocks.signOut).toHaveBeenCalledWith("/sign-in/as"),
    );
  },
};

export const NotImpersonating: Story = {
  beforeEach() {
    signInAs("owner");
  },
  play: async ({ canvas: page }) => {
    await expect(page.queryByRole("status")).not.toBeInTheDocument();
  },
};
