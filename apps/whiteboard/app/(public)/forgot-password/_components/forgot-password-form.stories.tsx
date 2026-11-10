import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { authFailure, authMocks, signInAs } from "../../.storybook/mocks/auth";

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];
type UserEvent = Parameters<NonNullable<Story["play"]>>[0]["userEvent"];

async function requestCode(
  canvas: Canvas,
  userEvent: UserEvent,
): Promise<void> {
  await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
  await userEvent.click(
    canvas.getByRole("button", { name: "Send reset code" }),
  );
}

async function submitReset(
  canvas: Canvas,
  userEvent: UserEvent,
): Promise<void> {
  await userEvent.type(await canvas.findByLabelText("Reset code"), "123456");
  await userEvent.type(canvas.getByLabelText("New password"), "password123");
  await userEvent.click(canvas.getByRole("button", { name: "Reset password" }));
}

const meta = {
  title: "Auth/ForgotPasswordForm",
  component: ForgotPasswordForm,
  decorators: [withAuthFormFrame],
} satisfies Meta<typeof ForgotPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RequestCode: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Send reset code" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Send reset code" }),
    );
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible();
    await expect(authMocks.passwordReset.sendCode).not.toHaveBeenCalled();
  },
};

export const RequestEmailError: Story = {
  beforeEach() {
    authMocks.passwordReset.sendCode.mockImplementation(() =>
      authFailure("INVALID_EMAIL"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await expect(
      await canvas.findByText("Enter a valid email address."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toBeVisible();
  },
};

export const RequestGlobalError: Story = {
  beforeEach() {
    authMocks.passwordReset.sendCode.mockImplementation(() =>
      authFailure("TOO_MANY_REQUESTS", 429),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
  },
};

export const ResetPassword: Story = {
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await expect(
      await canvas.findByText("Enter the code and choose a new password"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Reset code")).toBeVisible();
    await expect(canvas.getByLabelText("New password")).toBeVisible();
    await expect(authMocks.passwordReset.sendCode).toHaveBeenCalledWith(
      "ada@example.com",
    );
  },
};

export const ResetValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reset password" }),
    );
    await expect(canvas.getByText("Enter the 6-digit code")).toBeVisible();
    await expect(
      canvas.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
    await expect(authMocks.passwordReset.reset).not.toHaveBeenCalled();
  },
};

export const ResetCodeError: Story = {
  beforeEach() {
    authMocks.passwordReset.reset.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await submitReset(canvas, userEvent);
    await expect(
      await canvas.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(authMocks.signIn.password).not.toHaveBeenCalled();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const ResetPasswordError: Story = {
  beforeEach() {
    authMocks.passwordReset.reset.mockImplementation(() =>
      authFailure("PASSWORD_TOO_SHORT"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await submitReset(canvas, userEvent);
    await expect(
      await canvas.findByText("Password is too short."),
    ).toBeVisible();
  },
};

export const ResetFinishesAtWorkspaceSelection: Story = {
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await userEvent.type(await canvas.findByLabelText("Reset code"), "123456");
    await userEvent.type(canvas.getByLabelText("New password"), "password123");
    await expect(canvas.getByLabelText("Reset code")).toHaveValue("123456");
    await expect(canvas.getByLabelText("New password")).toHaveValue(
      "password123",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Reset password" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.passwordReset.reset).toHaveBeenCalledWith({
      email: "ada@example.com",
      code: "123456",
      password: "password123",
    });
    await expect(authMocks.signIn.password).toHaveBeenCalledWith({
      identifier: "ada@example.com",
      password: "password123",
    });
  },
};

export const ResetThenSignInFails: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("EMAIL_NOT_VERIFIED", 403),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await requestCode(canvas, userEvent);
    await submitReset(canvas, userEvent);
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/login"),
    );
  },
};

export const SignedIn: Story = {
  beforeEach() {
    signInAs("owner");
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
  },
};
