import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { signInAs } from "../../.storybook/mocks/auth";
import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { CompanyDeletionBanner } from "./company-deletion-banner";

const PATH = "/api/construction/organization/company-deletion";
const SCHEDULED = {
  requestedAt: "2026-10-16T05:00:00.000Z",
  scheduledFor: "2026-11-15T05:00:00.000Z",
};

let calls: ApiCall[] = [];

function serve(start: typeof SCHEDULED | null) {
  let deletion = start;
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path === PATH)
      return Response.json({ deletion });
    if (call.method === "POST" && call.path === `${PATH}/cancel`) {
      deletion = null;
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "AppShell/CompanyDeletionBanner",
  component: CompanyDeletionBanner,
  render: () => (
    <StoryQueries>
      <CompanyDeletionBanner />
      <p>Page content</p>
    </StoryQueries>
  ),
} satisfies Meta<typeof CompanyDeletionBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerCancels: Story = {
  beforeEach() {
    signInAs("owner");
    return serve(SCHEDULED);
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(/This Company will be deleted on 15 Nov 2026/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Cancel deletion" }),
    );
    await waitFor(() => expect(canvas.queryByRole("status")).toBeNull());
    await expect(calls.some((call) => call.path === `${PATH}/cancel`)).toBe(
      true,
    );
  },
};

export const MemberSeesTheDate: Story = {
  beforeEach() {
    signInAs("member");
    return serve(SCHEDULED);
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Ask the Owner if this is a mistake."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Cancel deletion" }),
    ).toBeNull();
  },
};

export const NothingScheduled: Story = {
  beforeEach() {
    signInAs("owner");
    return serve(null);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Page content")).toBeVisible();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await expect(canvas.queryByRole("status")).toBeNull();
  },
};
