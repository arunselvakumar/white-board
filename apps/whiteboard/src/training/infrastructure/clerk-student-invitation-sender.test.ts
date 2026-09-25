import { beforeEach, describe, expect, it, vi } from "vitest";

type InvitationInput = {
  organizationId: string;
  inviterUserId: string;
  emailAddress: string;
  role: string;
  redirectUrl: string;
};

type MockState = {
  calls: InvitationInput[];
  failure: "none" | "pending" | "unavailable";
};

const mockState = vi.hoisted<MockState>(() => ({
  calls: [],
  failure: "none",
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({
    organizations: {
      createOrganizationInvitation: (input: InvitationInput) => {
        mockState.calls.push(input);
        if (mockState.failure === "pending") {
          throw Object.assign(new Error("Invitation exists"), {
            errors: [{ code: "organization_invitation_not_unique" }],
          });
        }
        if (mockState.failure === "unavailable") throw new Error("Clerk unavailable");
        return Promise.resolve({});
      },
    },
  }),
}));

import { ClerkStudentInvitationSender } from "./clerk-student-invitation-sender";

const invite = {
  organizationId: "org_1",
  inviterUserId: "user_owner",
  emailAddress: "student@example.com",
  role: "org:student" as const,
};

describe("Clerk Student invitation adapter", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.failure = "none";
  });

  it("sends a role-specific Workspace invitation", async () => {
    await new ClerkStudentInvitationSender().send(invite);
    expect(mockState.calls).toEqual([{ ...invite, redirectUrl: "/accept-invitation" }]);
  });

  it("accepts an already pending invitation", async () => {
    mockState.failure = "pending";
    await new ClerkStudentInvitationSender().send(invite);
    expect(mockState.calls).toEqual([{ ...invite, redirectUrl: "/accept-invitation" }]);
  });

  it("surfaces other Clerk failures to the event listener", async () => {
    mockState.failure = "unavailable";
    await expect(new ClerkStudentInvitationSender().send(invite)).rejects.toThrow("Clerk unavailable");
  });
});
