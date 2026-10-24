import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi } from "../../.storybook/mocks/api";
import { authFailure, authMocks } from "../../.storybook/mocks/auth";
import { PublicShell } from "./public-shell";
import { SignInForm } from "./sign-in-form";

const PHONE_SIGN_IN = "/api/auth/sign-in/phone-number";

let api: ReturnType<typeof mockApi> | null = null;

/** Better Auth's mobile + password sign-in: `password` is the right one. */
function servePhoneSignIn(password = "site-pass-26") {
  return () => {
    api = mockApi(({ method, path, body }) => {
      if (method !== "POST" || path !== PHONE_SIGN_IN) return undefined;
      const input = body as { phoneNumber: string; password: string };
      if (input.password !== password)
        return Response.json(
          {
            code: "INVALID_PHONE_NUMBER_OR_PASSWORD",
            message: "Invalid phone number or password",
          },
          { status: 401 },
        );
      return Response.json({ token: "session-token", user: { id: "u1" } });
    });
    return api.restore;
  };
}

const meta = {
  title: "Auth/SignInForm",
  component: SignInForm,
  args: { redirectUrl: null, mobileOtp: false },
  render: (args) => (
    <PublicShell>
      <SignInForm {...args} />
    </PublicShell>
  ),
} satisfies Meta<typeof SignInForm>;

export default meta;
type Story = StoryObj<typeof meta>;
type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

function panel(page: Canvas, name: "Email" | "Mobile") {
  return within(page.getByRole("tabpanel", { name }));
}

/** SMS off: Email first; Mobile signs in with mobile and password. */
export const MobilePassword: Story = {
  beforeEach: servePhoneSignIn(),
  play: async ({ canvas: page, userEvent }) => {
    await expect(page.getByRole("tab", { name: "Email" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    const mobile = panel(page, "Mobile");
    await expect(
      mobile.queryByRole("button", { name: "Text me a code instead" }),
    ).not.toBeInTheDocument();
    await userEvent.type(mobile.getByLabelText("Mobile number"), "77081 65767");
    await userEvent.type(mobile.getByLabelText("Password"), "site-pass-26");
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue"),
    );
    await expect(api?.calls).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: PHONE_SIGN_IN,
        body: expect.objectContaining({
          phoneNumber: "+917708165767",
          password: "site-pass-26",
        }) as unknown,
      }),
    );
  },
};

export const MobileWrongPassword: Story = {
  beforeEach: servePhoneSignIn(),
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    const mobile = panel(page, "Mobile");
    await userEvent.type(mobile.getByLabelText("Mobile number"), "7708165767");
    await userEvent.type(mobile.getByLabelText("Password"), "wrong-pass");
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await expect(
      await mobile.findByText("Incorrect mobile number or password."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

/** No code to reset by: the Company admin sets a new password. */
export const MobileForgotPassword: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    const mobile = panel(page, "Mobile");
    const forgot = mobile.getByRole("button", { name: "Forgot password?" });
    await expect(forgot).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(forgot);
    await expect(
      mobile.getByText(/Ask your Company admin to set a new password/),
    ).toBeVisible();
    await expect(forgot).toHaveAttribute("aria-expanded", "true");
  },
};

export const InvalidMobile: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    const mobile = panel(page, "Mobile");
    await userEvent.type(mobile.getByLabelText("Mobile number"), "12345");
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await expect(
      await mobile.findByText("Enter a valid 10-digit mobile number"),
    ).toBeVisible();
    await expect(await mobile.findByText("Enter your password")).toBeVisible();
  },
};

/** SMS on: Mobile first, password by default, a texted code on request. */
export const MobileOtp: Story = {
  args: { mobileOtp: true },
  play: async ({ canvas: page, userEvent }) => {
    await expect(page.getByRole("tab", { name: "Mobile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const mobile = panel(page, "Mobile");
    await expect(mobile.getByLabelText("Password")).toBeVisible();
    await userEvent.click(
      mobile.getByRole("button", { name: "Text me a code instead" }),
    );
    await userEvent.type(mobile.getByLabelText("Mobile number"), "77081 65767");
    await userEvent.click(mobile.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(authMocks.mobileOtp.sendCode).toHaveBeenCalledWith(
        "+917708165767",
      ),
    );
    await expect(await mobile.findByText("+91 77081 65767")).toBeVisible();
    await userEvent.type(mobile.getByLabelText("6-digit code"), "123456");
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.mobileOtp.verifyCode).toHaveBeenCalledWith({
        mobile: "+917708165767",
        code: "123456",
      }),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
    await expect(authMocks.mobileOtp.setName).not.toHaveBeenCalled();
  },
};

export const WrongCode: Story = {
  args: { mobileOtp: true },
  play: async ({ canvas: page, userEvent }) => {
    authMocks.mobileOtp.verifyCode.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
    const mobile = panel(page, "Mobile");
    await userEvent.click(
      mobile.getByRole("button", { name: "Text me a code instead" }),
    );
    await userEvent.type(mobile.getByLabelText("Mobile number"), "7708165767");
    await userEvent.click(mobile.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await mobile.findByLabelText("6-digit code"),
      "000000",
    );
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await expect(
      await mobile.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const KeepsRedirect: Story = {
  args: { redirectUrl: "/app/masters" },
  beforeEach: servePhoneSignIn(),
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    const mobile = panel(page, "Mobile");
    await userEvent.type(mobile.getByLabelText("Mobile number"), "7708165767");
    await userEvent.type(mobile.getByLabelText("Password"), "site-pass-26");
    await userEvent.click(mobile.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/continue?redirect_url=%2Fapp%2Fmasters",
      ),
    );
  },
};

export const Email: Story = {
  play: async ({ canvas: page, userEvent }) => {
    const email = panel(page, "Email");
    await expect(
      email.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
    await userEvent.type(email.getByLabelText("Email"), "arun@anugraha.in");
    await userEvent.type(email.getByLabelText("Password"), "site-pass-1");
    await userEvent.click(email.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(authMocks.emailSignIn).toHaveBeenCalledWith({
        email: "arun@anugraha.in",
        password: "site-pass-1",
      }),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
  },
};

export const EmailNotVerified: Story = {
  play: async ({ canvas: page, userEvent }) => {
    authMocks.emailSignIn.mockImplementation(() =>
      authFailure("EMAIL_NOT_VERIFIED", 403),
    );
    const email = panel(page, "Email");
    await userEvent.type(email.getByLabelText("Email"), "arun@anugraha.in");
    await userEvent.type(email.getByLabelText("Password"), "site-pass-1");
    await userEvent.click(email.getByRole("button", { name: "Sign in" }));
    await expect(await email.findByText("arun@anugraha.in")).toBeVisible();
    await expect(authMocks.emailSignUp.sendEmailCode).toHaveBeenCalledWith(
      "arun@anugraha.in",
    );
    await userEvent.type(email.getByLabelText("6-digit code"), "654321");
    await userEvent.click(
      email.getByRole("button", { name: "Verify and sign in" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue"),
    );
  },
};

export const WrongPassword: Story = {
  play: async ({ canvas: page, userEvent }) => {
    authMocks.emailSignIn.mockImplementation(() =>
      authFailure("INVALID_EMAIL_OR_PASSWORD", 401),
    );
    const email = panel(page, "Email");
    await userEvent.type(email.getByLabelText("Email"), "arun@anugraha.in");
    await userEvent.type(email.getByLabelText("Password"), "wrong");
    await userEvent.click(email.getByRole("button", { name: "Sign in" }));
    await expect(
      await email.findByText("Incorrect email or password."),
    ).toBeVisible();
  },
};

/** At phone width the tabs and forms fit; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement, canvas: page, userEvent }) => {
    await userEvent.click(page.getByRole("tab", { name: "Mobile" }));
    await userEvent.click(
      panel(page, "Mobile").getByRole("button", { name: "Forgot password?" }),
    );
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
