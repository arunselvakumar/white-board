import { workspaces } from "@repo/auth/server";

import type { ParentInviter } from "../application/child-ports";

/**
 * Invites a Parent to the Workspace (ADR-0034). A pending invitation or an
 * existing membership for the address counts as already sent. Admitting a
 * Child is open to Centre Heads, so the invitation goes out for the Owner.
 */
export class WorkspaceParentInviter implements ParentInviter {
  async invite(input: Parameters<ParentInviter["invite"]>[0]): Promise<void> {
    await workspaces.invite({
      workspaceId: input.workspaceId,
      inviterUserId: input.inviterUserId,
      email: input.email,
      role: "parent",
      onBehalfOfOwner: true,
    });
  }
}
