import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { OnboardingSplitShell } from "@/components/onboarding/onboarding-shell";

import { mockApi } from "../../.storybook/mocks/api";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { ChangePasswordForm } from "./change-password-form";

const CHANGE = "/api/auth/change-password";
const TEMPORARY = "site-pass-26";

let api: ReturnType<typeof mockApi> | null = null;

/** Better Auth's change-password: `TEMPORARY` is the current password. */
function serve() {
  return () => {
    api = mockApi(({ method, path, body }) => {
      if (method !== "POST" || path !== CHANGE) return undefined;
      const input = body as { currentPassword: string };
      if (input.currentPassword !== TEMPORARY)
        return Response.json(
          { code: "INVALID_PASSWORD", message: "Invalid password" },
          { status: 400 },
        );
      return Response.json({ token: "new-session", user: { id: "u1" } });
    });
    return api.restore;
  };
}

const meta = {
  title: "Auth/ChangePasswordForm",
  component: ChangePasswordForm,
  args: { redirectUrl: null },
  beforeEach() {
    signInAs("member");
  },
  render: (args) => (
    <OnboardingSplitShell>
      <ChangePasswordForm {...args} />
    </OnboardingSplitShell>
  ),
} satisfies Meta<typeof ChangePasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChangesAndContinues: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Choose your own password" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await expect(
      await canvas.findByText("Enter the password you signed in with"),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Current password"), TEMPORARY);
    await userEvent.type(canvas.getByLabelText("New password"), TEMPORARY);
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "something-else",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await expect(
      await canvas.findByText(
        "Choose a password different from the one you were given",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("The two passwords do not match"),
    ).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("New password"));
    await userEvent.type(canvas.getByLabelText("New password"), "my-own-pass");
    await userEvent.clear(canvas.getByLabelText("Confirm new password"));
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "my-own-pass",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue"),
    );
    await expect(api?.calls).toHaveBeenCalledWith(
      expect.objectContaining({
        path: CHANGE,
        body: {
          currentPassword: TEMPORARY,
          newPassword: "my-own-pass",
          revokeOtherSessions: true,
        },
      }),
    );
  },
};

export const WrongCurrentPassword: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Current password"), "nope");
    await userEvent.type(canvas.getByLabelText("New password"), "my-own-pass");
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "my-own-pass",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await expect(
      await canvas.findByText("That is not your current password."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const KeepsRedirect: Story = {
  args: { redirectUrl: "/app/workspace/hrms" },
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Current password"), TEMPORARY);
    await userEvent.type(canvas.getByLabelText("New password"), "my-own-pass");
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "my-own-pass",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/continue?redirect_url=%2Fapp%2Fworkspace%2Fhrms",
      ),
    );
  },
};

/** At phone width the form fits; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByLabelText("Current password")).toBeVisible();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("New password")).toBeVisible();
  },
};
