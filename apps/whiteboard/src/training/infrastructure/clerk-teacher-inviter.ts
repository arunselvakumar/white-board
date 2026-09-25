import { clerkClient } from "@clerk/nextjs/server";

import type { TeacherInviter } from "../application/teacher-handlers";

export class ClerkTeacherInviter implements TeacherInviter {
  async send(input: Parameters<TeacherInviter["send"]>[0]): Promise<string> {
    const clerk = await clerkClient();
    if (input.previousInvitationId != null) {
      await clerk.organizations.revokeOrganizationInvitation({
        organizationId: input.workspaceId,
        invitationId: input.previousInvitationId,
        requestingUserId: input.inviterUserId,
      });
    }
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: input.workspaceId,
      inviterUserId: input.inviterUserId,
      emailAddress: input.email,
      role: "org:teacher",
      redirectUrl: "/accept-invitation",
      publicMetadata: { teacherId: input.teacherId },
    });
    return invitation.id;
  }

  async removeAccess(input: Parameters<TeacherInviter["removeAccess"]>[0]): Promise<void> {
    const clerk = await clerkClient();
    const memberIds = new Set<string>();
    if (input.clerkUserId != null) memberIds.add(input.clerkUserId);
    let offset = 0;
    let pageSize = 100;
    while (pageSize === 100) {
      const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: input.workspaceId, limit: 100, offset });
      for (const membership of page.data) {
        if (membership.role !== "org:teacher" || membership.publicMetadata["teacherId"] !== input.teacherId) continue;
        const userId = membership.publicUserData?.userId;
        if (userId == null) throw new Error("Teacher membership has no Clerk User ID.");
        memberIds.add(userId);
      }
      pageSize = page.data.length;
      offset += pageSize;
    }
    for (const userId of memberIds) {
      try {
        await clerk.organizations.deleteOrganizationMembership({ organizationId: input.workspaceId, userId });
      } catch (error) {
        if (!isClerkNotFound(error)) throw error;
      }
    }
    if (input.invitationId == null) return;
    let status: string | undefined;
    try {
      const invitation = await clerk.organizations.getOrganizationInvitation({ organizationId: input.workspaceId, invitationId: input.invitationId });
      status = invitation.status;
    } catch (error) {
      if (isClerkNotFound(error)) return;
      throw error;
    }
    if (status === "pending") {
      try {
        await clerk.organizations.revokeOrganizationInvitation({
          organizationId: input.workspaceId,
          invitationId: input.invitationId,
          requestingUserId: input.userId,
        });
      } catch (error) {
        if (!isClerkNotFound(error)) throw error;
      }
    }
  }
}

function isClerkNotFound(error: unknown): boolean {
  return typeof error === "object" && error != null && "status" in error && error.status === 404;
}
