import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";

import { mockFetch } from "../../.storybook/mock-fetch";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { ChooseCompanyForm } from "./choose-company-form";
import { JoinRequestsList } from "./join-requests-list";
import { OnboardingShell } from "./onboarding-shell";

const REQUEST = {
  id: "0199c3a0-0000-7000-8000-000000000010",
  companyId: "company_shree",
  companyName: "Shree Infra",
  memberName: "Ramesh Patil",
  invitedAt: "2026-10-08T06:30:00.000Z",
};

const meta = {
  title: "Onboarding/JoinRequests",
  component: JoinRequestsList,
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
    authMocks.companies = [];
  },
  render: () => (
    <OnboardingShell>
      <ChooseCompanyForm
        redirectUrl={null}
        joinRequests={
          <QuerySuspense>
            <JoinRequestsList />
          </QuerySuspense>
        }
      />
    </OnboardingShell>
  ),
} satisfies Meta<typeof JoinRequestsList>;

export default meta;
type Story = StoryObj<typeof meta>;

const LIST = "/api/construction/organization/join-requests";
let fetchMock: ReturnType<typeof mockFetch> | null = null;

export const AcceptARequest: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      { path: LIST, respond: () => Response.json({ items: [REQUEST] }) },
      {
        method: "POST",
        path: `${LIST}/${REQUEST.id}/accept`,
        respond: () => Response.json({ companyId: REQUEST.companyId }),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Join Requests" }),
    ).toBeVisible();
    await expect(canvas.getByText("Invited you as Ramesh Patil")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Accept Shree Infra" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
    );
    await expect(fetchMock?.spy).toHaveBeenCalledWith(
      `${LIST}/${REQUEST.id}/accept`,
      expect.objectContaining({ method: "POST" }),
    );
  },
};

export const DeclineARequest: Story = {
  beforeEach() {
    let pending = [REQUEST];
    fetchMock = mockFetch([
      { path: LIST, respond: () => Response.json({ items: pending }) },
      {
        method: "POST",
        path: `${LIST}/${REQUEST.id}/reject`,
        respond: () => {
          pending = [];
          return new Response(null, { status: 204 });
        },
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Decline Shree Infra" }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Shree Infra")).not.toBeInTheDocument(),
    );
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const NoRequests: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      { path: LIST, respond: () => Response.json({ items: [] }) },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Get started" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(fetchMock?.spy).toHaveBeenCalledWith(LIST, expect.anything()),
    );
    await expect(
      canvas.queryByRole("heading", { name: "Join Requests" }),
    ).not.toBeInTheDocument();
  },
};
