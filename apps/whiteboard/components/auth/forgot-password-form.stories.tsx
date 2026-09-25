import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

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
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Send reset code" }),
    );
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible();
  },
};

export const ResetPassword: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(
      canvas.getByRole("button", { name: "Send reset code" }),
    );
    await expect(
      await canvas.findByText("Enter the code and choose a new password"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Reset code")).toBeVisible();
    await expect(canvas.getByLabelText("New password")).toBeVisible();
    await expect(clerkMocks.signIn.create).toHaveBeenCalledWith({
      identifier: "ada@example.com",
    });
    await expect(
      clerkMocks.signIn.resetPasswordEmailCode.sendCode,
    ).toHaveBeenCalled();
  },
};

export const ResetValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(
      canvas.getByRole("button", { name: "Send reset code" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reset password" }),
    );
    await expect(canvas.getByText("Enter the 6-digit code")).toBeVisible();
    await expect(
      canvas.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
  },
};

export const ResetFinishesAtWorkspaceSelection: Story = {
  beforeEach() {
    clerkMocks.signIn.resetPasswordEmailCode.verifyCode.mockImplementation(
      () => ({ error: null }),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(
      canvas.getByRole("button", { name: "Send reset code" }),
    );
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
      expect(
        clerkMocks.signIn.resetPasswordEmailCode.verifyCode,
      ).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(
        clerkMocks.signIn.resetPasswordEmailCode.submitPassword,
      ).toHaveBeenCalled(),
    );
    await waitFor(() => expect(clerkMocks.signIn.finalize).toHaveBeenCalled());
    const call = clerkMocks.signIn.finalize.mock.calls.at(-1)?.[0] as {
      navigate: (input: { decorateUrl: (url: string) => string }) => void;
    };
    let destination = "";
    call.navigate({
      decorateUrl: (url) => {
        destination = url;
        return url;
      },
    });
    await expect(destination).toBe("/select-workspace");
  },
};
