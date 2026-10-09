import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { PublicShell } from "@/components/auth/public-shell";

import { mockFetch } from "../../.storybook/mock-fetch";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { JoinLinkCard, type JoinLinkPreview } from "./join-link-card";

const TOKEN = "Zt0kenZt0kenZt0kenZt0kenZt0ken12";
const PREVIEW: JoinLinkPreview = {
  id: "0199c3a0-0000-7000-8000-000000000011",
  companyName: "Anugraha Engineers",
  memberName: "Prabhu Saravanan",
  contacts: [{ kind: "email", masked: "s••••@sakthi.in" }],
};

const meta = {
  title: "Join/JoinLinkCard",
  component: JoinLinkCard,
  args: { token: TOKEN, preview: PREVIEW, signedIn: false },
  render: (args) => (
    <PublicShell>
      <JoinLinkCard {...args} />
    </PublicShell>
  ),
} satisfies Meta<typeof JoinLinkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Join Anugraha Engineers" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Sign in with s••••@sakthi.in to accept."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Sign in to accept" }),
    ).toHaveAttribute("href", `/sign-in?redirect_url=%2Fjoin%2F${TOKEN}`);
  },
};

export const SignedInAccepts: Story = {
  args: { signedIn: true },
  beforeEach() {
    signInAs("owner");
  },
  play: async ({ canvas, userEvent }) => {
    const { restore } = mockFetch([
      {
        method: "POST",
        path: `/api/construction/organization/join-requests/${PREVIEW.id}/accept`,
        respond: () => Response.json({ companyId: "company_anugraha" }),
      },
    ]);
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Join Anugraha Engineers" }),
      );
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
    } finally {
      restore();
    }
  },
};

export const SignedInWithAnotherEmail: Story = {
  args: { signedIn: true },
  beforeEach() {
    signInAs("owner");
  },
  play: async ({ canvas, userEvent }) => {
    const { restore } = mockFetch([
      {
        method: "POST",
        path: `/api/construction/organization/join-requests/${PREVIEW.id}/accept`,
        respond: () =>
          Response.json(
            { code: "JOIN_REQUEST_NOT_FOUND", message: "Not for you." },
            { status: 404 },
          ),
      },
    ]);
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Join Anugraha Engineers" }),
      );
      await expect(
        await canvas.findByText(
          "This invitation is for s••••@sakthi.in. You are signed in with a different email.",
        ),
      ).toBeVisible();
      await userEvent.click(
        canvas.getByRole("button", { name: "Sign out and use that email" }),
      );
      await waitFor(() =>
        expect(authMocks.signOut).toHaveBeenCalledWith(`/join/${TOKEN}`),
      );
    } finally {
      restore();
    }
  },
};

/** While SMS is on the invited number is listed beside the email. */
export const SignedOutWithSms: Story = {
  args: {
    preview: {
      ...PREVIEW,
      contacts: [
        { kind: "mobile", masked: "+91 ••••• 65767" },
        { kind: "email", masked: "s••••@sakthi.in" },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Sign in with +91 ••••• 65767 or s••••@sakthi.in to accept.",
      ),
    ).toBeVisible();
  },
};

export const Expired: Story = {
  args: { preview: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "This invite link has expired" }),
    ).toBeVisible();
  },
};
