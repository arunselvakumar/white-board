import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { authFailure, authMocks } from "../../.storybook/mocks/auth";
import { PublicShell } from "./public-shell";
import { SignInAsForm } from "./sign-in-as-form";

const meta = {
  title: "Auth/SignInAsForm",
  component: SignInAsForm,
  render: () => (
    <PublicShell>
      <SignInAsForm />
    </PublicShell>
  ),
} satisfies Meta<typeof SignInAsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const CUSTOMER = "muthu@anugrahaengineers.in";
const ADMIN = "arun@white-board.io";

export const SignsInAsCustomer: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.type(page.getByLabelText("Customer email"), CUSTOMER);
    await userEvent.type(page.getByLabelText("Your White Board email"), ADMIN);
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(authMocks.impersonation.sendCode).toHaveBeenCalledWith({
        customerEmail: CUSTOMER,
        adminEmail: ADMIN,
      }),
    );
    await expect(await page.findByText(ADMIN)).toBeVisible();
    await userEvent.type(page.getByLabelText("6-digit code"), "482913");
    await userEvent.click(
      page.getByRole("button", { name: "Sign in as customer" }),
    );
    await waitFor(() =>
      expect(authMocks.impersonation.verifyCode).toHaveBeenCalledWith({
        customerEmail: CUSTOMER,
        adminEmail: ADMIN,
        code: "482913",
      }),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
  },
};

export const RefusesOtherDomains: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.type(page.getByLabelText("Customer email"), CUSTOMER);
    await userEvent.type(
      page.getByLabelText("Your White Board email"),
      "arun@gmail.com",
    );
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await expect(
      await page.findByText("Use your @white-board.io email"),
    ).toBeVisible();
    await expect(authMocks.impersonation.sendCode).not.toHaveBeenCalled();
  },
};

export const UnknownCustomer: Story = {
  play: async ({ canvas: page, userEvent }) => {
    authMocks.impersonation.verifyCode.mockImplementation(() =>
      authFailure("IMPERSONATION_USER_NOT_FOUND", 404),
    );
    await userEvent.type(
      page.getByLabelText("Customer email"),
      "nobody@example.com",
    );
    await userEvent.type(page.getByLabelText("Your White Board email"), ADMIN);
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await userEvent.type(await page.findByLabelText("6-digit code"), "482913");
    await userEvent.click(
      page.getByRole("button", { name: "Sign in as customer" }),
    );
    await expect(
      await page.findByText(
        "No User has this customer email. Change emails and try again.",
      ),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const WrongCode: Story = {
  play: async ({ canvas: page, userEvent }) => {
    authMocks.impersonation.verifyCode.mockImplementation(() =>
      authFailure("INVALID_OTP"),
    );
    await userEvent.type(page.getByLabelText("Customer email"), CUSTOMER);
    await userEvent.type(page.getByLabelText("Your White Board email"), ADMIN);
    await userEvent.click(page.getByRole("button", { name: "Send code" }));
    await userEvent.type(await page.findByLabelText("6-digit code"), "000000");
    await userEvent.click(
      page.getByRole("button", { name: "Sign in as customer" }),
    );
    await expect(
      await page.findByText("That code is incorrect. Please try again."),
    ).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Change emails" }));
    await expect(page.getByLabelText("Customer email")).toBeVisible();
  },
};
