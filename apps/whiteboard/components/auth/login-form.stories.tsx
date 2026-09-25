import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { LoginForm } from "@/components/auth/login-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

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
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      canvas.getByText("Email or username is required"),
    ).toBeVisible();
    await expect(canvas.getByText("Password is required")).toBeVisible();
  },
};

export const UnknownIdentifier: Story = {
  beforeEach() {
    clerkMocks.signIn.password.mockImplementation(() => {
      clerkMocks.errors.fields["identifier"] = {
        code: "form_identifier_not_found",
      };
      return { error: {} };
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Email or username"),
      "missing@example.com",
    );
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      await canvas.findByText("No account found with this email or username."),
    ).toBeVisible();
  },
};

export const GoogleSignIn: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with Google" }),
    );
    await expect(clerkMocks.signIn.sso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/select-workspace",
      redirectCallbackUrl: "/sso-callback",
    });
  },
};

export const SecondFactor: Story = {
  beforeEach() {
    clerkMocks.signIn.password.mockImplementation(() => {
      clerkMocks.signIn.status = "needs_second_factor";
      return { error: null };
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Email or username"),
      "ada@example.com",
    );
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      await canvas.findByRole("heading", { name: "Verify it's you" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Verify" })).toBeVisible();
  },
};

export const ResendSecondFactorCode: Story = {
  beforeEach() {
    clerkMocks.signIn.password.mockImplementation(() => {
      clerkMocks.signIn.status = "needs_second_factor";
      return { error: null };
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Email or username"),
      "ada@example.com",
    );
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resend code" }),
    );
    await expect(
      await canvas.findByText("Code resent. Check your inbox."),
    ).toBeVisible();
    await expect(clerkMocks.signIn.mfa.sendEmailCode).toHaveBeenCalled();
  },
};

export const SignedIn: Story = {
  beforeEach() {
    clerkMocks.isSignedIn = true;
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
};

export const PasswordSignInSelectsWorkspaceBeforeRequestedPage: Story = {
  args: { redirectUrl: "/students/new" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Email or username"), "ada@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(clerkMocks.signIn.finalize).toHaveBeenCalled());
    const call = clerkMocks.signIn.finalize.mock.calls.at(-1)?.[0] as {
      navigate: (input: { decorateUrl: (url: string) => string }) => void;
    };
    let destination = "";
    call.navigate({ decorateUrl: (url) => { destination = url; return url; } });
    await expect(destination).toBe("/select-workspace?redirect_url=%2Fstudents%2Fnew");
  },
};
