import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { PublicShell } from "@/components/auth/public-shell";

import { mockFetch } from "../../.storybook/mock-fetch";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { JoinLinkCard, type JoinLinkPreview } from "./join-link-card";

const TOKEN = "Zt0kenZt0kenZt0kenZt0kenZt0ken12";
const PREVIEW: JoinLinkPreview = {
  id: "0199c3a0-0000-7000-8000-000000000011",
  companyName: "Patil Builders",
  memberName: "Suresh Kale",
  contacts: [{ kind: "mobile", masked: "+91 ••••• 43210" }],
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
      canvas.getByRole("heading", { name: "Join Patil Builders" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Sign in with +91 ••••• 43210 to accept."),
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
        respond: () => Response.json({ companyId: "company_patil" }),
      },
    ]);
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Join Patil Builders" }),
      );
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
    } finally {
      restore();
    }
  },
};

export const SignedInWithAnotherNumber: Story = {
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
        canvas.getByRole("button", { name: "Join Patil Builders" }),
      );
      await expect(
        await canvas.findByText(/This invitation is for \+91 ••••• 43210/),
      ).toBeVisible();
      await userEvent.click(
        canvas.getByRole("button", { name: "Sign out and use that number" }),
      );
      await waitFor(() =>
        expect(authMocks.signOut).toHaveBeenCalledWith(`/join/${TOKEN}`),
      );
    } finally {
      restore();
    }
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
