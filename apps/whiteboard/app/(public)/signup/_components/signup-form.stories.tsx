import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { SignupForm } from "@/components/auth/signup-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { authFailure, authMocks, signInAs } from "../../.storybook/mocks/auth";

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];
type UserEvent = Parameters<NonNullable<Story["play"]>>[0]["userEvent"];

async function submitDetails(
  canvas: Canvas,
  userEvent: UserEvent,
): Promise<void> {
  await userEvent.type(canvas.getByLabelText("Username"), "ada");
  await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(canvas.getByLabelText("Password"), "password123");
  await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
}

const meta = {
  title: "Auth/SignupForm",
  component: SignupForm,
  decorators: [withAuthFormFrame],
} satisfies Meta<typeof SignupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Username")).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toBeVisible();
    await expect(canvas.getByLabelText("Password")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create account" }),
    );
    await expect(
      canvas.getByText("Username must be at least 3 characters"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible();
    await expect(
      canvas.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
    await expect(authMocks.signUp.create).not.toHaveBeenCalled();
  },
};

export const UsernameTaken: Story = {
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("USERNAME_IS_ALREADY_TAKEN", 422),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await expect(
      await canvas.findByText("That username is already taken."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Verify your email" }),
    ).not.toBeInTheDocument();
  },
};

export const EmailTaken: Story = {
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("USER_ALREADY_EXISTS", 422),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await expect(
      await canvas.findByText("An account with this email already exists."),
    ).toBeVisible();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const PasswordRejected: Story = {
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("PASSWORD_TOO_SHORT"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await expect(
      await canvas.findByText("Password is too short."),
    ).toBeVisible();
  },
};

export const GlobalError: Story = {
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("TOO_MANY_REQUESTS", 429),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
  },
};

export const EmailVerification: Story = {
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await expect(
      await canvas.findByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
    await expect(authMocks.signUp.create).toHaveBeenCalledWith({
      username: "ada",
      email: "ada@example.com",
      password: "password123",
    });
  },
};

export const VerificationCodeErrors: Story = {
  beforeEach() {
    authMocks.signUp.verifyEmailCode.mockImplementation(() =>
      authFailure("OTP_EXPIRED"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    const code = await canvas.findByLabelText("Verification code");
    await userEvent.type(code, "123");
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }));
    await expect(canvas.getByText("Enter the 6-digit code")).toBeVisible();

    await userEvent.type(code, "456");
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }));
    await expect(
      await canvas.findByText("That code has expired. Request a new one."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const ResendCode: Story = {
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resend code" }),
    );
    await expect(
      await canvas.findByText("Code resent. Check your inbox."),
    ).toBeVisible();
    await expect(authMocks.signUp.sendEmailCode).toHaveBeenCalledWith(
      "ada@example.com",
    );
  },
};

export const ResendCodeFailure: Story = {
  beforeEach() {
    authMocks.signUp.sendEmailCode.mockImplementation(() =>
      authFailure("TOO_MANY_REQUESTS", 429),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resend code" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
    await expect(
      canvas.getByRole("button", { name: "Resend code" }),
    ).toBeVisible();
  },
};

export const GoogleSignIn: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with Google" }),
    );
    await expect(authMocks.signIn.google).toHaveBeenCalledWith(
      "/select-workspace",
    );
  },
};

export const VerifiedSignupSelectsWorkspace: Story = {
  play: async ({ canvas, userEvent }) => {
    await submitDetails(canvas, userEvent);
    const code = await canvas.findByLabelText("Verification code");
    await userEvent.type(code, "123456");
    await expect(code).toHaveValue("123456");
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }));
    await expect(authMocks.signUp.verifyEmailCode).toHaveBeenCalledWith({
      email: "ada@example.com",
      code: "123456",
    });
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
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
