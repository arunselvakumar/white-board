import { workspaces } from "@repo/auth/server";

import type { TeacherInviter } from "../application/teacher-handlers";

/** Teacher invitations through the identity Workspace (ADR-0034). */
export class WorkspaceTeacherInviter implements TeacherInviter {
  async send(input: Parameters<TeacherInviter["send"]>[0]): Promise<string> {
    // The Teacher's email may have changed since the last invitation.
    if (input.previousInvitationId != null)
      await workspaces.cancelInvitation({
        workspaceId: input.workspaceId,
        invitationId: input.previousInvitationId,
      });
    const result = await workspaces.invite({
      workspaceId: input.workspaceId,
      inviterUserId: input.inviterUserId,
      email: input.email,
      role: "teacher",
      replacePending: true,
    });
    if (result.status === "already_member")
      throw new Error(
        "This email already belongs to a member of the Workspace.",
      );
    return result.invitationId;
  }

  async removeAccess(
    input: Parameters<TeacherInviter["removeAccess"]>[0],
  ): Promise<void> {
    if (input.teacherUserId != null)
      await workspaces.removeMember({
        workspaceId: input.workspaceId,
        userId: input.teacherUserId,
      });
    if (input.invitationId != null)
      await workspaces.revokeInvitationAccess({
        workspaceId: input.workspaceId,
        invitationId: input.invitationId,
      });
  }
}
