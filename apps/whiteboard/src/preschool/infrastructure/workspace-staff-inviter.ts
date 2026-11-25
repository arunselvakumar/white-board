import { workspaces } from "@repo/auth/server";

import type { StaffInviter } from "../application/staff-ports";

/**
 * Staff invitations through the identity Workspace (ADR-0034). Centre Heads
 * and Teachers both join as member role `teacher`; which one they are is read
 * from their Staff record when they sign in (ADR-0055).
 */
export class WorkspaceStaffInviter implements StaffInviter {
  async invite(
    input: Parameters<StaffInviter["invite"]>[0],
  ): Promise<"sent" | "already_member"> {
    const result = await workspaces.invite({
      workspaceId: input.workspaceId,
      inviterUserId: input.inviterUserId,
      email: input.email,
      role: "teacher",
      replacePending: true,
    });
    return result.status === "already_member" ? "already_member" : "sent";
  }
}
