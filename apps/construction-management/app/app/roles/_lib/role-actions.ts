import type { RoleActions } from "@/components/roles/role-actions";

import { viewerCan, viewerFlags } from "../../_lib/viewer-can";

/** What the viewer may do on Role Management, for the pages to hide the rest. */
export async function viewerRoleActions(): Promise<RoleActions> {
  const flags = await viewerFlags("organization.roles", [
    "read",
    "create",
    "update",
    "delete",
  ]);
  return {
    ...flags,
    read: flags.read || (await viewerCan("organization.team_members", "read")),
  };
}
