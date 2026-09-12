import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SignupForm } from "@/components/auth/signup-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

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
  },
};

export const UsernameTaken: Story = {
  beforeEach() {
    clerkMocks.signUp.password.mockImplementation(() => {
      clerkMocks.errors.fields["username"] = { code: "form_username_exists" };
      return { error: {} };
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Username"), "ada");
    await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create account" }),
    );
    await expect(
      await canvas.findByText("That username is already taken."),
    ).toBeVisible();
  },
};

export const EmailVerification: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Username"), "ada");
    await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create account" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
    await expect(
      clerkMocks.signUp.verifications.sendEmailCode,
    ).toHaveBeenCalled();
  },
};

export const GoogleSignIn: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with Google" }),
    );
    await expect(clerkMocks.signUp.sso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: "/sso-callback",
    });
  },
};
