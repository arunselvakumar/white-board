import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { authMocks } from "../../.storybook/mocks/auth";
import { PublicShell } from "./public-shell";
import { SignUpForm } from "./sign-up-form";

const meta = {
  title: "Auth/SignUpForm",
  component: SignUpForm,
  args: { redirectUrl: null, mobileOtp: false },
  render: (args) => (
    <PublicShell>
      <SignUpForm {...args} />
    </PublicShell>
  ),
} satisfies Meta<typeof SignUpForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = {
  args: { mobileOtp: true },
  play: async ({ canvas: page, userEvent }) => {
    const panel = (name = "Mobile") =>
      within(page.getByRole("tabpanel", { name }));
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await expect(await panel().findByText("Enter your name")).toBeVisible();
    await userEvent.type(
      panel().getByLabelText("Your name"),
      "Arun Selva Kumar",
    );
    await userEvent.type(panel().getByLabelText("Mobile number"), "7708165767");
    await userEvent.click(panel().getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await panel().findByLabelText("6-digit code"),
      "123456",
    );
    await userEvent.click(
      panel().getByRole("button", { name: "Create account" }),
    );
    await waitFor(() =>
      expect(authMocks.mobileOtp.setName).toHaveBeenCalledWith(
        "Arun Selva Kumar",
      ),
    );
    await expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue");
  },
};

export const Email: Story = {
  play: async ({ canvas: page, userEvent }) => {
    await userEvent.type(page.getByLabelText("Your name"), "Arun Selva Kumar");
    await userEvent.type(page.getByLabelText("Email"), "arun@anugraha.in");
    await userEvent.type(page.getByLabelText("Password"), "short");
    await userEvent.click(page.getByRole("button", { name: "Create account" }));
    await expect(
      await page.findByText("Use at least 8 characters"),
    ).toBeVisible();
    await userEvent.type(page.getByLabelText("Password"), "-and-long");
    await userEvent.click(page.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(authMocks.emailSignUp.create).toHaveBeenCalledWith({
        name: "Arun Selva Kumar",
        email: "arun@anugraha.in",
        password: "short-and-long",
      }),
    );
    await userEvent.type(await page.findByLabelText("6-digit code"), "111222");
    await userEvent.click(page.getByRole("button", { name: "Verify email" }));
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/continue"),
    );
  },
};
