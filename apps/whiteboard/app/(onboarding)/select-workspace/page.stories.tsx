import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { SelectWorkspaceForm } from "@/components/onboarding/select-workspace-form";
import { authMocks, signInAs } from "../../../.storybook/mocks/auth";

const meta = {
  title: "Pages/Workspace Selection",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <OnboardingShell>
      <SelectWorkspaceForm redirectUrl="/" />
    </OnboardingShell>
  ),
  beforeEach() {
    signInAs("owner", { name: "Riverside School" });
    authMocks.workspaceId = null;
    authMocks.role = null;
    authMocks.workspaces = [
      ...authMocks.workspaces,
      {
        id: "org_harbor",
        name: "Harbor Academy",
        role: "teacher",
        institutionType: "training_institute",
      },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Select a workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Riverside School/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
  },
};

export const ActiveWorkspaceStillRequiresSelection: Story = {
  beforeEach() {
    authMocks.workspaceId = "org_riverside";
    authMocks.role = "owner";
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Select a workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    );
    await expect(authMocks.setActive).toHaveBeenCalledWith("org_harbor", "/");
  },
};

export const SignOut: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/login"),
    );
    await expect(authMocks.signOut).toHaveBeenCalledWith("/login");
  },
};
