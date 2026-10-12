import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { AuthDivider } from "@/components/auth/auth-divider";
import { QuerySuspense } from "@/components/query-suspense";

import { mockFetch } from "../../.storybook/mock-fetch";
import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { CreateCompanyWizard } from "./create-company-wizard";
import { JoinRequestsList } from "./join-requests-list";
import { OnboardingSplitShell } from "./onboarding-shell";

const REQUEST = {
  id: "0199c3a0-0000-7000-8000-000000000010",
  companyId: "company_sri",
  companyName: "Sri Infra",
  memberName: "Arun Selva Kumar",
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
  // As on Create Company, where a User with no Company lands.
  render: () => (
    <OnboardingSplitShell>
      <QuerySuspense fallback={null}>
        <JoinRequestsList after={<AuthDivider />} />
      </QuerySuspense>
      <CreateCompanyWizard />
    </OnboardingSplitShell>
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
    await expect(
      canvas.getByText("Invited you as Arun Selva Kumar"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Accept Sri Infra" }),
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
      await canvas.findByRole("button", { name: "Decline Sri Infra" }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Sri Infra")).not.toBeInTheDocument(),
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
      await canvas.findByRole("heading", { name: "Your Company" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(fetchMock?.spy).toHaveBeenCalledWith(LIST, expect.anything()),
    );
    await expect(
      canvas.queryByRole("heading", { name: "Join Requests" }),
    ).not.toBeInTheDocument();
  },
};
