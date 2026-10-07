import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import {
  AcceptInvitationForm,
  type InvitationSummary,
} from "@/components/auth/accept-invitation-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { authFailure, authMocks } from "../../.storybook/mocks/auth";

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];
type UserEvent = Parameters<NonNullable<Story["play"]>>[0]["userEvent"];

const invitation: InvitationSummary = {
  id: "inv_123",
  email: "anita@example.com",
  role: "teacher",
  workspaceName: "Riverside Centre",
  hasAccount: true,
};

const newUserInvitation: InvitationSummary = {
  ...invitation,
  id: "inv_456",
  role: "student",
  hasAccount: false,
};

async function signInToJoin(
  canvas: Canvas,
  userEvent: UserEvent,
): Promise<void> {
  await userEvent.type(canvas.getByLabelText("Password"), "password123");
  await userEvent.click(
    canvas.getByRole("button", { name: "Sign in and join" }),
  );
}

async function createSignIn(
  canvas: Canvas,
  userEvent: UserEvent,
): Promise<void> {
  await userEvent.type(canvas.getByLabelText("Username"), "anita");
  await userEvent.type(canvas.getByLabelText("Password"), "password123");
  await userEvent.click(canvas.getByRole("button", { name: "Create sign-in" }));
}

const meta = {
  title: "Auth/AcceptInvitationForm",
  component: AcceptInvitationForm,
  decorators: [withAuthFormFrame],
  args: { invitation, signedInEmail: null },
} satisfies Meta<typeof AcceptInvitationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ---------------------------- unavailable ---------------------------- */

export const Unavailable: Story = {
  args: { invitation: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Invitation unavailable" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Sign-in" }),
    ).toHaveAttribute("href", "/login");
  },
};

/* ----------------------------- signed in ----------------------------- */

export const SignedInAccepts: Story = {
  args: { signedInEmail: "Anita@Example.com" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Joining your Workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Joining Riverside Centre as a Teacher."),
    ).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Accepting invitation…",
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.acceptInvitation).toHaveBeenCalledTimes(1);
    await expect(authMocks.acceptInvitation).toHaveBeenCalledWith("inv_123");
  },
};

export const SignedInAcceptFailure: Story = {
  args: { signedInEmail: "anita@example.com" },
  beforeEach() {
    authMocks.acceptInvitation.mockImplementation(() =>
      authFailure("INVITATION_NOT_FOUND", 404),
    );
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This invitation is no longer valid. Ask the Owner to send a new one.",
    );
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const WrongAccount: Story = {
  args: { signedInEmail: "ravi@example.com" },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Use a different account" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "This invitation to Riverside Centre is for anita@example.com. You're signed in as ravi@example.com.",
      ),
    ).toBeVisible();
    await expect(authMocks.acceptInvitation).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out and continue" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/accept-invitation?id=inv_123",
      ),
    );
    await expect(authMocks.signOut).toHaveBeenCalledWith(
      "/accept-invitation?id=inv_123",
    );
  },
};

/* -------------------- signed out, existing account -------------------- */

export const SignInToJoin: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Join Riverside Centre" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Sign in to join as a Teacher."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toHaveValue(
      "anita@example.com",
    );
    await expect(
      canvas.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");

    await signInToJoin(canvas, userEvent);
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.signIn.password).toHaveBeenCalledWith({
      identifier: "anita@example.com",
      password: "password123",
    });
    await expect(authMocks.acceptInvitation).toHaveBeenCalledWith("inv_123");
  },
};

export const SignInToJoinValidation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign in and join" }),
    );
    await expect(canvas.getByText("Password is required")).toBeVisible();
    await expect(authMocks.signIn.password).not.toHaveBeenCalled();
  },
};

export const SignInToJoinIncorrectPassword: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("INVALID_EMAIL_OR_PASSWORD", 401),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInToJoin(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Incorrect email, username, or password.",
    );
    await expect(authMocks.acceptInvitation).not.toHaveBeenCalled();
  },
};

export const SignInToJoinAcceptFailure: Story = {
  beforeEach() {
    authMocks.acceptInvitation.mockImplementation(() =>
      authFailure("YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", 403),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInToJoin(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This invitation was sent to a different email address.",
    );
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const SignInToJoinWithGoogle: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with Google" }),
    );
    await expect(authMocks.signIn.google).toHaveBeenCalledWith(
      "/accept-invitation?id=inv_123",
    );
  },
};

export const SignInToJoinUnverifiedEmail: Story = {
  beforeEach() {
    authMocks.signIn.password.mockImplementation(() =>
      authFailure("EMAIL_NOT_VERIFIED", 403),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await signInToJoin(canvas, userEvent);
    const code = await canvas.findByLabelText("Verification code");
    await expect(authMocks.signUp.sendEmailCode).toHaveBeenCalledWith(
      "anita@example.com",
    );
    await expect(
      canvas.getByText("Enter the 6-digit code we emailed you"),
    ).toBeVisible();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.type(code, "123456");
    await userEvent.click(
      canvas.getByRole("button", { name: "Verify and join" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.signUp.verifyEmailCode).toHaveBeenCalledWith({
      email: "anita@example.com",
      code: "123456",
    });
    await expect(authMocks.acceptInvitation).toHaveBeenCalledWith("inv_123");
  },
};

/* ---------------------- signed out, no account yet --------------------- */

export const CreateSignInToJoin: Story = {
  args: { invitation: newUserInvitation },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Join Riverside Centre" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Create your sign-in to join as a Student."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toHaveValue(
      "anita@example.com",
    );

    await createSignIn(canvas, userEvent);
    await expect(authMocks.signUp.create).toHaveBeenCalledWith({
      username: "anita",
      email: "anita@example.com",
      password: "password123",
    });
    const code = await canvas.findByLabelText("Verification code");
    await expect(authMocks.acceptInvitation).not.toHaveBeenCalled();

    await userEvent.type(code, "123456");
    await userEvent.click(
      canvas.getByRole("button", { name: "Verify and join" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.signUp.verifyEmailCode).toHaveBeenCalledWith({
      email: "anita@example.com",
      code: "123456",
    });
    await expect(authMocks.acceptInvitation).toHaveBeenCalledWith("inv_456");
  },
};

export const CreateSignInValidation: Story = {
  args: { invitation: newUserInvitation },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create sign-in" }),
    );
    await expect(
      canvas.getByText("Username must be at least 3 characters"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
    await expect(authMocks.signUp.create).not.toHaveBeenCalled();
  },
};

export const CreateSignInUsernameTaken: Story = {
  args: { invitation: newUserInvitation },
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("USERNAME_IS_ALREADY_TAKEN", 422),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await createSignIn(canvas, userEvent);
    await expect(
      await canvas.findByText("That username is already taken."),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText("Verification code"),
    ).not.toBeInTheDocument();
  },
};

export const CreateSignInEmailTaken: Story = {
  args: { invitation: newUserInvitation },
  beforeEach() {
    authMocks.signUp.create.mockImplementation(() =>
      authFailure("USER_ALREADY_EXISTS", 422),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await createSignIn(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
  },
};

export const CreateSignInWrongCode: Story = {
  args: { invitation: newUserInvitation },
  beforeEach() {
    authMocks.signUp.verifyEmailCode.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await createSignIn(canvas, userEvent);
    const code = await canvas.findByLabelText("Verification code");
    await userEvent.click(
      canvas.getByRole("button", { name: "Verify and join" }),
    );
    await expect(canvas.getByText("Enter the 6-digit code")).toBeVisible();

    await userEvent.type(code, "000000");
    await userEvent.click(
      canvas.getByRole("button", { name: "Verify and join" }),
    );
    await expect(
      await canvas.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(authMocks.acceptInvitation).not.toHaveBeenCalled();
  },
};

export const CreateSignInResendCode: Story = {
  args: { invitation: newUserInvitation },
  play: async ({ canvas, userEvent }) => {
    await createSignIn(canvas, userEvent);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resend code" }),
    );
    await expect(
      await canvas.findByText("Code resent. Check your inbox."),
    ).toBeVisible();
    await expect(authMocks.signUp.sendEmailCode).toHaveBeenCalledWith(
      "anita@example.com",
    );
  },
};

export const VerifiedButAcceptFails: Story = {
  args: { invitation: newUserInvitation },
  beforeEach() {
    authMocks.acceptInvitation.mockImplementation(() =>
      authFailure(
        "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
        403,
      ),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await createSignIn(canvas, userEvent);
    await userEvent.type(
      await canvas.findByLabelText("Verification code"),
      "123456",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Verify and join" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Verify your email before accepting the invitation.",
    );
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};
