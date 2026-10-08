import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { authFailure, authMocks } from "../../.storybook/mocks/auth";
import { PublicShell } from "./public-shell";
import { SignInForm } from "./sign-in-form";

const meta = {
  title: "Auth/SignInForm",
  component: SignInForm,
  args: { redirectUrl: null },
  render: (args) => (
    <PublicShell>
      <SignInForm {...args} />
    </PublicShell>
  ),
} satisfies Meta<typeof SignInForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    await expect(page.getByRole("tab", { name: "Mobile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.type(
      panel().getByLabelText("Mobile number"),
      "98765 43210",
    );
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(authMocks.mobileOtp.sendCode).toHaveBeenCalledWith(
        "+919876543210",
      ),
    );
    await expect(await panel().findByText("+91 98765 43210")).toBeVisible();
    await userEvent.type(panel().getByLabelText("6-digit code"), "123456");
    await userEvent.click(panel().getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.mobileOtp.verifyCode).toHaveBeenCalledWith({
        mobile: "+919876543210",
        code: "123456",
      }),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
    await expect(authMocks.mobileOtp.setName).not.toHaveBeenCalled();
  },
};

export const InvalidMobile: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    await userEvent.type(panel().getByLabelText("Mobile number"), "12345");
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await expect(
      await panel().findByText("Enter a valid 10-digit mobile number"),
    ).toBeVisible();
    await expect(authMocks.mobileOtp.sendCode).not.toHaveBeenCalled();
  },
};

export const WrongCode: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    authMocks.mobileOtp.verifyCode.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
    await userEvent.type(panel().getByLabelText("Mobile number"), "9876543210");
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await panel().findByLabelText("6-digit code"),
      "000000",
    );
    await userEvent.click(panel().getByRole("button", { name: "Sign in" }));
    await expect(
      await panel().findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const KeepsRedirect: Story = {
  args: { redirectUrl: "/app/masters" },
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    await userEvent.type(panel().getByLabelText("Mobile number"), "9876543210");
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await panel().findByLabelText("6-digit code"),
      "123456",
    );
    await userEvent.click(panel().getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/continue?redirect_url=%2Fapp%2Fmasters",
      ),
    );
  },
};

export const Email: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    await userEvent.click(page.getByRole("tab", { name: "Email" }));
    await userEvent.type(
      panel("Email").getByLabelText("Email"),
      "ramesh@patil.in",
    );
    await userEvent.type(
      panel("Email").getByLabelText("Password"),
      "site-pass-1",
    );
    await userEvent.click(
      panel("Email").getByRole("button", { name: "Sign in" }),
    );
    await waitFor(() =>
      expect(authMocks.emailSignIn).toHaveBeenCalledWith({
        email: "ramesh@patil.in",
        password: "site-pass-1",
      }),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
  },
};

export const EmailNotVerified: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    authMocks.emailSignIn.mockImplementation(() =>
      authFailure("EMAIL_NOT_VERIFIED", 403),
    );
    await userEvent.click(page.getByRole("tab", { name: "Email" }));
    await userEvent.type(
      panel("Email").getByLabelText("Email"),
      "ramesh@patil.in",
    );
    await userEvent.type(
      panel("Email").getByLabelText("Password"),
      "site-pass-1",
    );
    await userEvent.click(
      panel("Email").getByRole("button", { name: "Sign in" }),
    );
    await expect(
      await panel("Email").findByText("ramesh@patil.in"),
    ).toBeVisible();
    await expect(authMocks.emailSignUp.sendEmailCode).toHaveBeenCalledWith(
      "ramesh@patil.in",
    );
    await userEvent.type(
      panel("Email").getByLabelText("6-digit code"),
      "654321",
    );
    await userEvent.click(
      panel("Email").getByRole("button", { name: "Verify and sign in" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue"),
    );
  },
};

export const WrongPassword: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    authMocks.emailSignIn.mockImplementation(() =>
      authFailure("INVALID_EMAIL_OR_PASSWORD", 401),
    );
    await userEvent.click(page.getByRole("tab", { name: "Email" }));
    await userEvent.type(
      panel("Email").getByLabelText("Email"),
      "ramesh@patil.in",
    );
    await userEvent.type(panel("Email").getByLabelText("Password"), "wrong");
    await userEvent.click(
      panel("Email").getByRole("button", { name: "Sign in" }),
    );
    await expect(
      await panel("Email").findByText("Incorrect email or password."),
    ).toBeVisible();
  },
};
