import { workspaces } from "@repo/auth/server";

import type { InvitationSender } from "../application/invite-student-on-created";

/**
 * Student and Parent invitations (ADR-0027, ADR-0034). A pending invitation
 * or an existing membership for the address counts as already sent.
 */
export class WorkspaceStudentInvitationSender implements InvitationSender {
  async send(input: Parameters<InvitationSender["send"]>[0]): Promise<void> {
    await workspaces.invite({
      workspaceId: input.workspaceId,
      inviterUserId: input.inviterUserId,
      email: input.emailAddress,
      role: input.role,
    });
  }
}
