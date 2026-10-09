import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { authFailure, authMocks } from "../../.storybook/mocks/auth";
import { ForgotPasswordForm } from "./forgot-password-form";
import { PublicShell } from "./public-shell";

const meta = {
  title: "Auth/ForgotPasswordForm",
  component: ForgotPasswordForm,
  render: () => (
    <PublicShell>
      <ForgotPasswordForm />
    </PublicShell>
  ),
} satisfies Meta<typeof ForgotPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResetsPassword: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await expect(
      page.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
    await userEvent.type(page.getByLabelText("Email"), "ramesh@patil.in");
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(authMocks.passwordReset.requestCode).toHaveBeenCalledWith(
        "ramesh@patil.in",
      ),
    );
    await expect(await page.findByText("ramesh@patil.in")).toBeVisible();
    await userEvent.type(page.getByLabelText("6-digit code"), "123456");
    await userEvent.type(page.getByLabelText("New password"), "new-site-pass");
    await userEvent.click(page.getByRole("button", { name: "Reset password" }));
    await waitFor(() =>
      expect(authMocks.passwordReset.resetPassword).toHaveBeenCalledWith({
        email: "ramesh@patil.in",
        code: "123456",
        password: "new-site-pass",
      }),
    );
    await expect(
      await page.findByText(
        "Your password has been reset. Sign in with your new password.",
      ),
    ).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Sign in" }));
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/sign-in");
  },
};

export const WrongCode: Story = {
  play: async ({ canvas: page, userEvent }) => {
    authMocks.passwordReset.resetPassword.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
    await userEvent.type(page.getByLabelText("Email"), "ramesh@patil.in");
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await userEvent.type(await page.findByLabelText("6-digit code"), "000000");
    await userEvent.type(page.getByLabelText("New password"), "new-site-pass");
    await userEvent.click(page.getByRole("button", { name: "Reset password" }));
    await expect(
      await page.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset password" }),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const ShortPassword: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.type(page.getByLabelText("Email"), "ramesh@patil.in");
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await userEvent.type(await page.findByLabelText("6-digit code"), "123456");
    await userEvent.type(page.getByLabelText("New password"), "short");
    await userEvent.click(page.getByRole("button", { name: "Reset password" }));
    await expect(
      await page.findByText("Use at least 8 characters"),
    ).toBeVisible();
    await expect(authMocks.passwordReset.resetPassword).not.toHaveBeenCalled();
  },
};

export const UseAnotherEmail: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.type(page.getByLabelText("Email"), "wrong@patil.in");
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await userEvent.click(
      await page.findByRole("button", { name: "Use another email" }),
    );
    await userEvent.type(page.getByLabelText("Email"), "ramesh@patil.in");
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(authMocks.passwordReset.requestCode).toHaveBeenLastCalledWith(
        "ramesh@patil.in",
      ),
    );
    await expect(await page.findByText("ramesh@patil.in")).toBeVisible();
  },
};
