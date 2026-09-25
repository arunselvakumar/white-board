import { clerkClient } from "@clerk/nextjs/server";

import type { InvitationSender } from "../application/invite-student-on-created";

function isPendingInvitation(error: unknown): boolean {
  if (typeof error !== "object" || error == null || !("errors" in error))
    return false;
  const errors: unknown = error.errors;
  return (
    Array.isArray(errors) &&
    errors.some((item: unknown) => {
      if (typeof item !== "object" || item == null || !("code" in item))
        return false;
      return item.code === "organization_invitation_not_unique";
    })
  );
}

export class ClerkStudentInvitationSender implements InvitationSender {
  async send(input: Parameters<InvitationSender["send"]>[0]): Promise<void> {
    try {
      const clerk = await clerkClient();
      await clerk.organizations.createOrganizationInvitation({
        organizationId: input.organizationId,
        inviterUserId: input.inviterUserId,
        emailAddress: input.emailAddress,
        role: input.role,
        redirectUrl: "/accept-invitation",
      });
    } catch (error) {
      if (isPendingInvitation(error)) return;
      throw error;
    }
  }
}
