import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { LoginForm } from "@/components/auth/login-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { authFailure, authMocks, signInAs } from "../../.storybook/mocks/auth";

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];
type UserEvent = Parameters<NonNullable<Story["play"]>>[0]["userEvent"];

async function signInWith(
  canvas: Canvas,
  userEvent: UserEvent,
  identifier: string,
  password = "password123",
): Promise<void> {
  await userEvent.type(canvas.getByLabelText("Email or username"), identifier);
  await userEvent.type(canvas.getByLabelText("Password"), password);
  await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
}

function unverifiedEmail(): void {
  authMocks.signIn.password.mockImplementation(() =>
    authFailure("EMAIL_NOT_VERIFIED", 403),
  );
}

const meta = {
  title: "Auth/LoginForm",
  component: LoginForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
  },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Credentials: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
    await expect(canvas.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup",
    );
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      canvas.getByText("Email or username is required"),
    ).toBeVisible();
    await expect(canvas.getByText("Password is required")).toBeVisible();
    await expect(authMocks.signIn.password).not.toHaveBeenCalled();
  },
};

export const SignsIn: Story = {
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await expect(authMocks.signIn.password).toHaveBeenCalledWith({
      identifier: "ada@example.com",
      password: "password123",
    });
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
  },
};

export const IncorrectCredentials: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("INVALID_EMAIL_OR_PASSWORD", 401),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "missing@example.com");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Incorrect email, username, or password.",
    );
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const PasswordFieldError: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("PASSWORD_TOO_LONG"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada");
    await expect(
      await canvas.findByText("Password is too long."),
    ).toBeVisible();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const TooManyRequests: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("RATE_LIMITED", 429),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
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

export const GoogleError: Story = {
  args: { initialError: "Google sign-in was cancelled. Please try again." },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Google sign-in was cancelled. Please try again.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with Google" }),
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const UnverifiedEmail: Story = {
  beforeEach: unverifiedEmail,
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await expect(
      await canvas.findByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
    await expect(authMocks.signUp.sendEmailCode).toHaveBeenCalledWith(
      "ada@example.com",
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.type(canvas.getByLabelText("Verification code"), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await expect(authMocks.signUp.verifyEmailCode).toHaveBeenCalledWith({
      email: "ada@example.com",
      code: "123456",
    });
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
  },
};

export const UnverifiedEmailCodeErrors: Story = {
  beforeEach() {
    unverifiedEmail();
    authMocks.signUp.verifyEmailCode.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    const code = await canvas.findByLabelText("Verification code");
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await expect(canvas.getByText("Enter the 6-digit code")).toBeVisible();
    await expect(authMocks.signUp.verifyEmailCode).not.toHaveBeenCalled();

    await userEvent.type(code, "000000");
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await expect(
      await canvas.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const UnverifiedEmailResendCode: Story = {
  beforeEach: unverifiedEmail,
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resend code" }),
    );
    await expect(
      await canvas.findByText("Code resent. Check your inbox."),
    ).toBeVisible();
    await expect(authMocks.signUp.sendEmailCode).toHaveBeenCalledTimes(2);
  },
};

export const UnverifiedEmailCodeNotSent: Story = {
  beforeEach() {
    unverifiedEmail();
    authMocks.signUp.sendEmailCode.mockImplementation(() =>
      authFailure("TOO_MANY_REQUESTS", 429),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again later.",
    );
    await expect(
      canvas.queryByRole("heading", { name: "Verify your email" }),
    ).not.toBeInTheDocument();
  },
};

export const UnverifiedUsername: Story = {
  beforeEach: unverifiedEmail,
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Verify your email before signing in. Sign in with your email address to get a new code.",
    );
    await expect(authMocks.signUp.sendEmailCode).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
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

export const PasswordSignInSelectsWorkspaceBeforeRequestedPage: Story = {
  args: { redirectUrl: "/students/new" },
  play: async ({ canvas, userEvent }) => {
    await signInWith(canvas, userEvent, "ada@example.com");
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/select-workspace?redirect_url=%2Fstudents%2Fnew",
      ),
    );
  },
};
