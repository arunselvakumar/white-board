import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Auth/AcceptInvitationForm",
  component: AcceptInvitationForm,
  decorators: [withAuthFormFrame],
} satisfies Meta<typeof AcceptInvitationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExistingUser: Story = {
  args: { ticket: "ticket_123", status: "sign_in" },
  play: async () => {
    await expect(clerkMocks.signIn.ticket).toHaveBeenCalledWith({
      ticket: "ticket_123",
    });
    await expect(clerkMocks.signIn.finalize).toHaveBeenCalled();
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

export const NewUser: Story = {
  args: { ticket: "ticket_456", status: "sign_up" },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Join your Workspace" }),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Username"), "anita");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(
      canvas.getByRole("button", { name: "Join Workspace" }),
    );
    await expect(clerkMocks.signUp.create).toHaveBeenCalledWith({
      strategy: "ticket",
      ticket: "ticket_456",
      username: "anita",
      password: "password123",
    });
    await expect(clerkMocks.signUp.finalize).toHaveBeenCalled();
    const call = clerkMocks.signUp.finalize.mock.calls.at(-1)?.[0] as {
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

export const MissingTicket: Story = {
  args: { ticket: null, status: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Invitation unavailable" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Sign-in" }),
    ).toHaveAttribute("href", "/login");
  },
};
